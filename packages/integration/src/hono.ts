import { buildOnce, Lunette } from '@lntt/wire'
import type { PubOf, SeedOf } from '@lntt/wire'
import { sValidator } from '@hono/standard-validator'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Context, MiddlewareHandler } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type {
  Capability,
  CarrierGuard,
  DepGuard,
  Handler,
  InputOf,
  OutputOf,
  RequestCarrier,
} from '@lntt/scope'
import { runFold } from '@lntt/scope'
import { serializeCookie } from './http.ts'

// The Hono env the mount and terminal share: the built app rides in Variables.
export type WireEnv<Pub> = { Variables: { __wireApp: Pub } }

// Hono pack. Takes the CHAIN, owns build-once, and — crucially — DOES NOT wrap
// the router. It contributes a `mount` middleware, a generic terminal handler
// (`wire`), and `dispose`. The user assembles routes with Hono's NATIVE
// chaining (`.get(path, ...handler(handler))`), which is what lets `typeof app`
// accumulate the route schema so `hc<typeof app>()` stays fully typed — path,
// method, INPUT (the validated param), and OUTPUT (the leaf's R via `c.json`).
export function hono<C extends Lunette<any, any, any>>(
  chain: C,
  seedFrom: (hostEnv: unknown) => SeedOf<C>,
) {
  type Pub = PubOf<C>
  const { ensure, dispose } = buildOnce(chain)

  // mount = the middleware registered ONCE. Reads c.env (Cloudflare) as the
  // seed source, seeds the per-isolate build, stashes the app on the context.
  // It contributes NOTHING to the route schema, so RPC typing is untouched.
  const mount = (): MiddlewareHandler<WireEnv<Pub>> => async (c, next) => {
    c.set('__wireApp', (await ensure(() => seedFrom(c.env))).app as Pub)
    await next()
  }

  // THE terminal. GENERIC over the route Input `I` (the load-bearing point,
  // spike 1): Hono's `.get` overload solves `I` to the handler's OWN constraint
  // — the scope's schema — and records `ToSchema<M, P, I.in, R>`, so `hc`
  // reads request `{ param: InferInput<S> }` and response@200 = R. Reads the
  // built app from the mount'd context, runs OUR fold, returns via `c.json` so
  // R flows into the RPC output.
  const handlerFrom =
    <S extends StandardSchemaV1, Need extends object, R>(handler: Handler<Need, S, R>) =>
    async <I extends { in: { param: InputOf<S> }; out: { param: OutputOf<S> } }>(
      c: Context<WireEnv<Pub>, string, I>,
    ) => {
      const params = c.req.valid('param') // OutputOf<S>, coerced by sValidator
      const outcome = await runFold<RequestCarrier, R>(
        handler,
        c.get('__wireApp') as object,
        { request: c.req.raw },
        params as object,
      )
      for (const ck of outcome.cookies) {
        c.header('set-cookie', serializeCookie(ck), { append: true })
      }
      if (outcome.ok) return c.json(outcome.value, 200) // R → RPC output@200
      const { intent } = outcome.abort
      if (intent.kind === 'redirect') {
        return c.redirect(intent.location, intent.status as 302)
      }
      // The abort body rides its 4xx/5xx status. Excluding 200 from the status
      // type keeps the RPC response@200 union PURE — only the success branch's R
      // lands at 200, so `InferResponseType<call, 200>` recovers R, never
      // `unknown | null` from a domain abort (blueprint §2.5).
      return c.json(intent.body ?? null, intent.status as Exclude<ContentfulStatusCode, 200>)
    }

  // Bind validator + terminal to ONE schema (from `handler.schema`) so they
  // cannot diverge — Hono's native 3-arg placement never cross-checks the
  // validator's contributed input against the terminal's required input, so
  // sharing the object is the only safety mechanism (spike 1, caveat 1). This
  // is also the single place the deps brand fires (Need ⊆ Pub) — at the call
  // site, before the tuple is spread into the native chain.
  // Hono's carrier streams a readable request, so it PROVIDES the `body`
  // capability — the `CarrierGuard<Cap, 'body' | 'cookies'>` clause accepts body/form
  // scopes. (tRPC's clause is `CarrierGuard<Cap, never>`, which rejects them.)
  const handler = <S extends StandardSchemaV1, Need extends object, R, Cap extends Capability>(
    handler: Handler<Need, S, R, Cap> & DepGuard<Pub, Need> & CarrierGuard<Cap, 'body' | 'cookies'>,
  ) => [sValidator('param', handler.schema), handlerFrom(handler)] as const

  return { mount, handler, dispose }
}
