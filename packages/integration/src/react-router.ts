import { Lunette } from '@lntt/wire'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { DepGuard, Handler, RequestScope } from '@lntt/scope'
import { fragment, runScope } from '@lntt/scope'
import { outcomeToResponse } from './http-codec.ts'

// The chain's public surface and its Seed, extracted from the Lunette value.
type PubOf<C> = C extends { build: (...a: never[]) => Promise<{ app: infer A }> } ? A : never
type SeedOf<C> = C extends Lunette<any, any, infer S> ? S : never

// Build-once per isolate: first-seed-wins promise-memo. Correct because the
// design's seed is isolate-static (env) — one app per isolate. This is NOT a
// per-request cache; a per-request-varying seed would break the model.
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

// The load context the mount produces and the loaders read back.
export interface WireContext<Pub> {
  readonly __wireApp: Pub
}

// React Router 7 pack. Takes the CHAIN, owns build-once, and exposes the shared
// fragment surface, the host `to*`, a `mount`, and `dispose`. The core never
// imports react-router beyond its calling convention.
export function reactRouter<C extends Lunette<any, any, any>>(
  chain: C,
  seedFrom: (hostEnv: unknown) => SeedOf<C>,
) {
  type Pub = PubOf<C>
  const { ensure, dispose } = buildOnce(chain)
  const base = fragment()

  // mount = the getLoadContext-shaped seeding step, registered ONCE in the
  // server entry. Reads the host env, seeds the memoized build, and returns the
  // load context carrying the built app; loaders read it back via args.context.
  const mount = async (hostEnv: unknown): Promise<WireContext<Pub>> => ({
    __wireApp: (await ensure(seedFrom(hostEnv))).app as Pub,
  })

  // The deps check (DepGuard) fires when the frag meets `toLoader`. Params are
  // NOT reconciled against the schema here: RR7's own typegen types
  // `args.params` from the file route (`Record<string, string>`), independent
  // of the fragment's schema. `runScope` validates+coerces them at runtime →
  // a RETURNED 422 abort on a bad param, and the leaf reads the coerced
  // `OutputOf<S>`.
  const toLoader =
    <Need extends object, S extends StandardSchemaV1, R>(
      handler: Handler<Need, S, R> & DepGuard<Pub, Need>,
    ) =>
    (args: {
      request: Request
      params: Record<string, string>
      context: WireContext<Pub>
    }): Promise<Response> =>
      runScope<RequestScope, S, R>(
        handler,
        args.context.__wireApp as object,
        { request: args.request },
        args.params,
      ).then(outcomeToResponse)

  // Actions share the loader calling convention.
  const toAction = toLoader

  return { guard: base.guard, handle: base.handle, toLoader, toAction, mount, dispose }
}
