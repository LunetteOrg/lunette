import { buildOnce, Lunette } from '@lntt/wire'
import type { PubOf, SeedOf } from '@lntt/wire'
import { sValidator } from '@hono/standard-validator'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Context, MiddlewareHandler } from 'hono'
import type { ParamKeys } from 'hono/types'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type {
  Capability,
  CarrierGuard,
  DepGuard,
  Handler,
  IntentGuard,
  InputOf,
  OutputOf,
  RequestCarrier,
} from '@lntt/scope'
import { runFold } from '@lntt/scope'
import { readCookies } from '@lntt/scope/cookies'
import { readHeaders } from '@lntt/scope/headers'
import type { HttpIntent } from '@lntt/scope/http'
import { serializeCookie } from './http.ts'

// The Hono env `mount` writes into: the built app rides in Variables, under the
// pack's `contextKey`. Handlers do NOT read it — annotate your app with this
// only when you reach the app outside a scope (`c.get('__wireApp')`).
export type WireEnv<Pub, K extends string = '__wireApp'> = { Variables: Record<K, Pub> }

export interface HonoOptions {
  // Where `mount` stashes the app on the context. Default `'__wireApp'`; give
  // two packs in one app different keys.
  readonly contextKey?: string
}

// The set of intents THIS host renders — written out by hand (§34: supply is
// closed per mount). Hono is an HTTP host, so it renders `@lntt/scope/http`'s
// whole vocabulary.
type HttpIntents = 'status' | 'redirect' | 'ok-status'
// The capabilities Hono's carrier actually supplies: it streams a readable
// request (`body`), and can decorate the response (`cookies`/`headers`).
type HonoCaps = 'body' | 'cookies' | 'headers'

// ── the route gate — pattern vs `.params()` schema, WE WRITE NO PARSER ──────
// Hono already knows its own path syntax; `ParamKeys` is Hono's OWN exported
// reader (`hono/types`), reused rather than re-derived so this cannot drift
// from the router that actually matches paths at runtime.
declare const OPAQUE: unique symbol
type Opaque = typeof OPAQUE

// Hono keeps the `?` INSIDE the key for an optional param (`:id?` → `"id?"`);
// the schema's own keys never carry one, so strip it before comparing.
type NameOf<K> = K extends `${infer Name}?` ? Name : K

// `ParamKeys<P>` is `never` for TWO different reasons that must not be
// confused: a genuinely param-less LITERAL route (`/login`), where the gate
// should still run (an over-declared schema is a real mismatch), and a
// NON-LITERAL path (`string extends P` — built from a variable, or containing
// a runtime interpolation), which means "cannot read this pattern" and must
// be skipped entirely. THE RULE THAT MAKES THIS SAFE: catching less is fine,
// rejecting a valid route is not.
type RouteParams<P extends string> = string extends P ? Opaque : NameOf<ParamKeys<P>>

// The reversed vacuous-truth check (decision 34's trap, paid for once already
// in `research/outcome-vocabulary/src/mounts.ts`): a param-less route's REAL
// `RouteParams` is `never`, and `never extends Opaque` is VACUOUSLY TRUE — so
// writing this as `RouteParams<P> extends Opaque` would silently skip every
// param-less route. Only `Opaque extends RouteParams<P>` tells the two apart.
type Missing<P extends string, Par> = Opaque extends RouteParams<P>
  ? never
  : Exclude<RouteParams<P>, keyof Par>
type Extra<P extends string, Par> = Opaque extends RouteParams<P>
  ? never
  : Exclude<keyof Par, RouteParams<P>>

type PathGate<P extends string, Par> = [Missing<P, Par>] extends [never]
  ? [Extra<P, Par>] extends [never]
    ? unknown
    : `⛔ the schema declares a param this route does not have: ${Extra<P, Par> & string}`
  : `⛔ this route has a param the schema does not declare: ${Missing<P, Par> & string}`

// Hono pack. Takes the CHAIN, owns build-once, and — crucially — DOES NOT wrap
// the router. It contributes a `mount` middleware, a generic terminal handler
// (`wire`), and `dispose`. The user assembles routes with Hono's NATIVE
// chaining (`.get(...handler(path, handler))`), which is what lets `typeof app`
// accumulate the route schema so `hc<typeof app>()` stays fully typed — path,
// method, INPUT (the validated param), and OUTPUT (the leaf's R via `c.json`).
// `mount` is OPTIONAL: handlers are self-sufficient, it exists to expose the
// app on the context for code outside a scope.
export function hono<C extends Lunette<any, any, any>>(
  chain: C,
  seedFrom: (hostEnv: unknown) => SeedOf<C>,
  options: HonoOptions = {},
) {
  type Pub = PubOf<C>
  const { ensure, dispose } = buildOnce(chain)
  const key = options.contextKey ?? '__wireApp'

  // OPTIONAL. Handlers do not need it — each seeds from its own `c.env` and
  // reads the app from THIS pack's `ensure`. Register it only to reach the app
  // OUTSIDE a scope: your own middleware, a hand-written route, a healthcheck.
  // Two packs in one app must then take different `contextKey`s, since the
  // context slot is shared by whoever writes it (§33). It contributes NOTHING
  // to the route schema, so RPC typing is untouched.
  const mount = (): MiddlewareHandler<WireEnv<Pub>> => async (c, next) => {
    c.set(key as '__wireApp', (await ensure(() => seedFrom(c.env))).app as Pub)
    await next()
  }

  // THE terminal. GENERIC over the route Input `I`, and that is the
  // load-bearing part: Hono's `.get` overload solves `I` to the handler's OWN constraint
  // — the scope's schema — and records `ToSchema<M, P, I.in, R>`, so `hc`
  // reads request `{ param: InferInput<S> }` and response@200 = R. Reads the
  // built app from the mount'd context, runs OUR fold, returns via `c.json` so
  // R flows into the RPC output.
  // Generic over `Cap`/`Int` because it does not gate: both checks already
  // happened on the public `handler` signature below. Both are invariant
  // (§34), so an internal step that accepts any scope has to say so rather
  // than lean on a default of `never`.
  const handlerFrom =
    <S extends StandardSchemaV1, Need extends object, R, Cap extends Capability, Int extends PropertyKey>(
      handler: Handler<Need, S, R, Cap, Int>,
    ) =>
    async <I extends { in: { param: InputOf<S> }; out: { param: OutputOf<S> } }>(
      c: Context<WireEnv<Pub>, string, I>,
    ) => {
      const params = c.req.valid('param') // OutputOf<S>, coerced by sValidator
      // The seed comes from THIS request's `c.env` (Cloudflare hands bindings
      // to the handler, never at startup) and is read only on the build that
      // happens; the app comes from this pack's own memo, never from a context
      // slot another pack could overwrite (§33).
      // `handlerFrom` does not gate — the public `handler` below already
      // proved `Cap ⊆ HonoCaps` at ITS call site, but that proof does not
      // propagate through a second, independently-generic `Cap` here (§34's
      // usual shape: a brand carries no information once re-abstracted over a
      // fresh type parameter), so the cast states what is already known
      // rather than re-deriving it.
      const outcome = await runFold<RequestCarrier, R, HonoCaps, {}, Cap>(
        handler as Handler<Need, S, R, Cap, Int> & CarrierGuard<Cap, HonoCaps>,
        (await ensure(() => seedFrom(c.env))).app as object,
        { request: c.req.raw },
        params as object,
      )
      for (const [name, value] of readHeaders(outcome)) c.header(name, value)
      for (const ck of readCookies(outcome)) {
        c.header('set-cookie', serializeCookie(ck), { append: true })
      }
      if (outcome.ok) return c.json(outcome.value, 200) // R → RPC output@200
      // THREE branches, matching `Outcome`. The `invalid` case renders 422,
      // distinct from Hono's OWN native `sValidator` 400 (`validate.ts`'s
      // note) — the schema failure this branch reports is OURS (a param
      // that failed `runFold`'s own re-validation never happens on this
      // path, since `sValidator` already validated the same schema natively;
      // this branch exists so the codec still compiles exhaustively).
      if ('invalid' in outcome) {
        return c.json(
          { issues: outcome.invalid.issues },
          422 as Exclude<ContentfulStatusCode, 200>,
        )
      }
      const intent = outcome.abort.intent as HttpIntent
      if (intent.kind === 'redirect') {
        return c.redirect(intent.location, intent.status as 302)
      }
      // The `ok` kind never rides an ABORT (only `Ok`'s own success side
      // coins it) — what remains is `status`.
      const body = intent.kind === 'status' ? (intent.body ?? null) : null
      // The abort body rides its 4xx/5xx status. Excluding 200 from the status
      // type keeps the RPC response@200 union PURE — only the success branch's R
      // lands at 200, so `InferResponseType<call, 200>` recovers R, never
      // `unknown | null` from a domain abort (blueprint §2.5).
      return c.json(body, intent.status as Exclude<ContentfulStatusCode, 200>)
    }

  // Bind validator + terminal to ONE schema (from `handler.schema`) so they
  // cannot diverge — Hono's native 3-arg placement never cross-checks the
  // validator's contributed input against the terminal's required input, so
  // sharing the object is the only safety mechanism — annotate the two
  // separately and they can drift with nothing to catch it. This
  // is also the single place the deps brand fires (Need ⊆ Pub) — at the call
  // site, before the tuple is spread into the native chain.
  //
  // FOUR gates now. `DepGuard`/`CarrierGuard` as before (Hono's carrier
  // streams a readable request, so it PROVIDES `body`/`cookies`/`headers`;
  // tRPC's clause is `CarrierGuard<Cap, never>`, which rejects them).
  // `IntentGuard<Int, HttpIntents>`: Hono renders http's whole vocabulary, so
  // a scope built on ANY other carrier's words is rejected here, naming the
  // intent. `PathGate<P, OutputOf<S>>`: the route PATTERN, taken here and
  // returned to be spread — `app.get(...w.handler('/posts/:postId', scope))`
  // — checked against the schema's own keys, in BOTH directions, so the
  // pattern is written once and cannot drift from what the scope declares.
  const handler = <
    P extends string,
    S extends StandardSchemaV1,
    Need extends object,
    R,
    Cap extends Capability,
    Int extends PropertyKey,
  >(
    path: P,
    handler: Handler<Need, S, R, Cap, Int> &
      DepGuard<Pub, Need> &
      CarrierGuard<Cap, HonoCaps> &
      IntentGuard<Int, HttpIntents> &
      PathGate<P, OutputOf<S>>,
  ) => [path, sValidator('param', handler.schema), handlerFrom(handler)] as const

  return { mount, handler, dispose }
}
