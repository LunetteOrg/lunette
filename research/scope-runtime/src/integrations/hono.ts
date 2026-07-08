import { Lunette } from '@lntt/wire'
import type { Hono, MiddlewareHandler } from 'hono'
import type { ParamKeys, ParamKeyToRecord } from 'hono/types'
import type { Simplify, UnionToIntersection } from 'hono/utils/types'
import type { DepGuard } from '../scope/adapter-guard.ts'
import { fragment, type Handler } from '../scope/fragment.ts'
import { runFold } from '../scope/run-fold.ts'
import type { RequestScope } from '../scope/scope.ts'
import { outcomeToResponse } from './http-codec.ts'

type PubOf<C> = C extends { build: (...a: never[]) => Promise<{ app: infer A }> } ? A : never
type SeedOf<C> = C extends Lunette<any, any, infer S> ? S : never

function buildOnce<C extends Lunette<any, any, any>>(chain: C) {
  type Built = Awaited<ReturnType<C['build']>>
  let built: Promise<Built> | undefined
  const build = chain.build.bind(chain) as unknown as (seed: SeedOf<C>) => Promise<Built>
  const ensure = (seed: SeedOf<C>): Promise<Built> => (built ??= build(seed))
  const dispose = async (): Promise<void> => {
    if (built) await (await built).dispose()
  }
  return { ensure, dispose }
}

// Hono's OWN generics are the source of truth for route params — no custom
// parser. `ParamKeys`/`ParamKeyToRecord` come from `hono/types`, `Simplify`/
// `UnionToIntersection` from `hono/utils/types` (neither in the root export).
// A param-less path collapses to `{}`.
export type HonoParams<Path extends string> = Simplify<
  UnionToIntersection<ParamKeyToRecord<ParamKeys<Path>>>
>

// The Hono env the mount and registrar share: the built app rides in Variables.
export type WireEnv<Pub> = { Variables: { __wireApp: Pub } }

// Hono pack. Takes the CHAIN, owns build-once, exposes the shared fragment
// surface, a `mount` middleware, a `route` registrar, and `dispose`.
export function hono<C extends Lunette<any, any, any>>(
  chain: C,
  seedFrom: (hostEnv: unknown) => SeedOf<C>,
) {
  type Pub = PubOf<C>
  const { ensure, dispose } = buildOnce(chain)
  const base = fragment()

  // mount = the middleware registered ONCE. Reads c.env (Cloudflare) as the
  // seed source, seeds the per-isolate build, stashes the app on the context.
  const mount = (): MiddlewareHandler<WireEnv<Pub>> => async (c, next) => {
    c.set('__wireApp', (await ensure(seedFrom(c.env))).app as Pub)
    await next()
  }

  // The registrar receives BOTH path and frag — the param check CANNOT live at
  // a bare `app.get` (spike 2: a Hono Handler cannot carry a param
  // requirement). `RP = HonoParams<Path>` meets the frag's `P` contravariantly;
  // the deps check is the DepGuard brand. Hono still owns routing — we only
  // type-check the (path, frag) pairing.
  const route = (app: Hono<WireEnv<Pub>>) => {
    const run = async <Need extends object, P extends object, R>(
      handler: Handler<Need, P, R>,
      c: Parameters<MiddlewareHandler<WireEnv<Pub>>>[0],
    ): Promise<Response> =>
      outcomeToResponse(
        await runFold<RequestScope, R>(
          handler,
          c.get('__wireApp') as object,
          { request: c.req.raw },
          c.req.param(),
        ),
      )

    const reg = {
      get<Path extends string, Need extends object, R>(
        path: Path,
        handler: Handler<Need, HonoParams<Path>, R> & DepGuard<Pub, Need>,
      ) {
        app.get(path, (c) => run(handler, c))
        return reg
      },
      post<Path extends string, Need extends object, R>(
        path: Path,
        handler: Handler<Need, HonoParams<Path>, R> & DepGuard<Pub, Need>,
      ) {
        app.post(path, (c) => run(handler, c))
        return reg
      },
    }
    return reg
  }

  return { guard: base.guard, handle: base.handle, mount, route, dispose }
}
