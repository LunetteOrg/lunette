// `@lntt/scope/express` — the Express carrier and its mounts.
//
// A carrier is `__args` alone (§43): the shape of a run's second argument, and
// nothing coined. There is no vocabulary to render, so what a subpath ships
// besides the declaration is what Express needs to MOUNT a scope — which is why
// there is no separate adapter package between the two.
//
// Express hands a route `(req, res)` and a middleware `(req, res, next)`. Both
// are here, and neither reads the ctx: what a step reads it ANNOTATES, and the
// carrier either publishes it or the step is refused at the argument by
// contravariance.

import type { NextFunction, Request, RequestHandler, Response } from 'express'
import type { ParamsDictionary, RouteParameters } from 'express-serve-static-core'
import type { DepGuard, Next, Passed, ResultOf, Scope, State } from '../index.ts'
import type { StandardIssue } from '../guard/index.ts'
import {
  cookiesFrom,
  encodingMatches,
  headersFrom,
  isMultipart,
  queryFrom,
  readBody,
  type BodyOf,
  type Cookies,
  type Encoding,
  type Headers_ as HeaderRecord,
  type Query,
} from '../reads.ts'

// `Params` is what the scope says the URL carries. It defaults to Express's own
// wide dictionary — a scope that names nothing reads `string | undefined` and
// mounts anywhere.
export interface ExpressCarrier<Params = ParamsDictionary> {
  readonly __args?: {
    readonly req: Request<Params>
    readonly res: Response
    readonly next?: NextFunction
  }
}

// PURE DECLARATION — the returned object carries nothing; the type argument is
// the whole point of the call. `expressCarrier()` reads the wide dictionary;
// `expressCarrier<{ id: string }>()` says which params the scope reads, and
// `route(path, …)` can then check a pattern against it.
export const expressCarrier = <Params = ParamsDictionary>(): ExpressCarrier<Params> => ({})

// Whatever a middleware's steps derive lands on `res.locals` before Express's
// own `next()` runs — the leaf every `mw()` chain ends on, appended by `mw`
// itself so nobody has to remember to write it.
//
// `req` is destructured out and discarded with the rest of the carrier's own
// args: what belongs on `res.locals` is what the STEPS populated, not what the
// run was handed.
//
// A STEP HERE OBSERVES AND DERIVES; IT DOES NOT WRAP — and that is the one
// place a step stops meaning the same thing on every host. Express's `next`
// DISPATCHES and hands back nothing to wait on, so this leaf returns as soon as
// it has called it: a step written `const p = await next({}); …; return p` runs
// its second half BEFORE the downstream handler has finished. Hono's `next`
// returns a promise and its leaf awaits it, tRPC's hands that promise straight
// back, so on those two the same step runs after. The order is pinned both ways
// in the two `index.test.ts` files rather than left as a belief.
//
// It is a LIMIT, not a defect of this file: `next` returning nothing is
// Express's, and no leaf can invent what the host does not have. Nor is it
// expressible as a refusal — no type distinguishes a step that AWAITS `next`
// from one that RETURNS it, they share a signature.
//
// What it costs, concretely: a step committing a transaction, closing a
// connection or stopping a timer after `next` tears down while the handler is
// still using it, and one that THROWS after `next` reaches the error middleware
// with the response possibly already sent. Work that has to happen after the
// response does not belong in a step here — it belongs where Express puts it,
// on `res`.
//
// The one shape that CANNOT be made to work on Express whatever we did:
// decorating the response after the handler. `res.on('finish')` would let this
// leaf wait for the response to be SENT — a different claim from "the chain
// answered", and by then the headers are gone. Measured before choosing the
// limit over the half-truth.
const toNext = async (
  _app: {},
  ctx: {
    readonly res: Response
    readonly next?: NextFunction
    readonly req?: Request
  } & Record<string, unknown>,
) => {
  const { res, next, req, ...derived } = ctx
  void req
  Object.assign(res.locals, derived)
  next?.()
  return undefined
}

// ── the route gate: what the scope READS against what the pattern SUPPLIES ───
// WE WRITE NO PARSER. `RouteParameters` is Express's own reader, so this cannot
// drift from the router that matches paths at runtime — it understands `*path`
// and `{/:id}`, cases a parser of ours would have to bail on.
declare const OPAQUE: unique symbol
type Opaque = typeof OPAQUE

// A NON-LITERAL pattern resolves to `ParamsDictionary`, whose `keyof` is the
// wide `string`. That must read as "cannot read this pattern", never as "every
// name is missing": catching less is fine, rejecting a valid route is not.
type Readable<Path extends string> = string extends keyof RouteParameters<Path>
  ? Opaque
  : keyof RouteParameters<Path>

// OPTIONALITY IS MEANING, and Express's own reader already carries it: an
// optional group builds as `Partial<…>`, so `RouteParameters<'/posts{/:id}'>`
// says `id?: string` where `/posts/:id` says `id: string`. Read with a bare
// `keyof` the two look alike — and they are not, because `/posts{/:id}` matches
// `/posts` too, where the param is `undefined` against a step whose type says
// `string`. So the two key sets are split and compared by kind: a REQUIRED
// demand takes only a required supply, an OPTIONAL one takes either, since the
// step already reads `string | undefined`. This is Hono's `Unmet` in the shape
// an object's keys take, and still no parser of ours.
type Req<P> = { [K in keyof P]-?: {} extends Pick<P, K> ? never : K }[keyof P]
type Opt<P> = { [K in keyof P]-?: {} extends Pick<P, K> ? K : never }[keyof P]

// ONE DIRECTION, and which one is the point. The scope DEMANDS — it reads
// `req.params.id` — and the route SUPPLIES. A param the scope reads and the
// pattern does not supply is `undefined` at runtime; a param the pattern
// supplies and nobody reads is nothing at all, which is the same verdict
// `DepGuard` gives the chain (a superset passes) and what lets one scope mount
// under a nested route.
//
// The test is REVERSED on purpose: a param-less pattern's real key set is
// `never`, and `never extends Opaque` is VACUOUSLY TRUE — written the natural
// way round, the gate would silently skip every param-less route.
// The same reading on the DEMAND side: a scope started on the bare
// `expressCarrier()` holds Express's wide dictionary, whose `keyof` is `string`
// — which says "names nothing", not "reads every possible name". Without this
// such a scope would be refused by every pattern.
type DemandedReq<Par> = string extends keyof Par ? never : Req<Par>
type DemandedOpt<Par> = string extends keyof Par ? never : Opt<Par>

type Unsupplied<Path extends string, Par> = Opaque extends Readable<Path>
  ? never
  :
      | Exclude<DemandedReq<Par>, Req<RouteParameters<Path>>>
      | Exclude<DemandedOpt<Par>, keyof RouteParameters<Path>>

// GATES THAT CAN BOTH FAIL ARE CHAINED, never intersected side by side: two
// message literals meeting on one argument give `'⛔ A' & '⛔ B'`, which is
// `never`, and TypeScript then reports "not assignable to parameter of type
// 'never'" with both messages gone — measured on exactly this pair. So each
// message-gate takes what to check NEXT, and only one of them can be the answer.
// A gate whose failure is not a literal — `DepGuard`'s branded object, the
// contravariant `ArgsGate` — cannot collapse and needs no place in the chain.
type PathGate<Path extends string, Par, Then = unknown> = [Unsupplied<Path, Par>] extends [never]
  ? Then
  : `⛔ this route does not supply a param the scope reads: ${Unsupplied<Path, Par> & string}`

// ── gate: what a MIDDLEWARE derives, against what the run itself brought ─────
// `toNext` — and Hono's and tRPC's twins — strips the run's own args back off
// by NAME, because the fold hands it one merged object and a name is all there
// is to tell the two halves apart. So a step deriving a key the carrier already
// occupies is dropped on the way out, and on Express it is worse than dropped:
// a derived `next` IS what `toNext` calls, Express's real one never runs, and
// the request hangs with no response and no error.
//
// The CORE does not refuse this, deliberately: refining a key the carrier
// brought is a supported shape there (`Ctx` resolves it with an `Omit`, and
// `shapes.test.ts` pins it). It is only the strip that cannot survive it — so
// the refusal belongs here, at the mount that strips, and only on the mounts
// that do. A `route` copies nothing out and takes no such gate.
// The names are WRITTEN OUT, not read off `S['args']`: what the leaf strips is
// what it destructures, and on Hono one of those two (`next`) is passed by the
// mount without the carrier declaring it. Naming them here keeps the gate and
// the destructuring one edit apart.
type Strips<S extends State> = Extract<keyof S['acc'], 'req' | 'res' | 'next'>

type StripGate<S extends State> = [Strips<S>] extends [never]
  ? unknown
  : `⛔ this middleware derives a ctx key the run itself brought: ${Strips<S> & string} — the leaf strips those by name, so it would never arrive`

// ── gate: a route ANSWERS on `res` ───────────────────────────────────────────
// Express ignores what a handler returns, so a leaf handing back a plain value
// — the shape every other host takes — writes nothing and the request simply
// never gets an answer. Hono catches this by TYPE, since its mount is declared
// to return what the scope returned; here nothing downstream reads it, so the
// check has to be asked for. `undefined` passes: a leaf that wrote the response
// itself and has nothing to hand back says exactly that.
type Unsendable<S extends State> = Exclude<ResultOf<Scope<S>>, Response | undefined>

// The OUTER link of the chain: a leaf Express cannot send is wrong under every
// pattern and on either mount, so it is answered before asking which pattern
// this is, or which key the middleware derived.
//
// It rides `mw` as well, where the SAME mistake ends worse than on a route.
// Under the library's error convention a RETURNED error is a domain value (§3),
// so `return { error: 'unauthorized' }` is the natural thing to write — and
// there the fold never reaches `toNext`, so Express's `next` is never called
// and the request hangs with no response at all.
type AnswerGate<S extends State, Then = unknown> = [Unsendable<S>] extends [never]
  ? Then
  : `⛔ answer on \`res\`: this scope's leaf hands back a value Express will never send`

// ── gate: the scope was written for THIS carrier ─────────────────────────────
// NO GATE OF OURS: what a mount brings is written as a FUNCTION the scope must
// be assignable to, and `strictFunctionTypes` does the rest — a parameter is
// contravariant, so a scope demanding args the mount does not bring is refused
// at the argument. It is the shape `trpc.procedure` and `reactRouter` already
// had for free by naming `S['args']` in a real parameter position; the two
// mounts that take a `Scope<S>` and cast had nothing checking that axis at all,
// so a Hono scope mounted here compiled and died on `c.json is not a function`
// on every request.
//
// `app` is `never` because the CHAIN is `DepGuard`'s to judge: it is assignable
// to any app type, so this member says nothing about the deps and the two gates
// stay one claim each.
//
// It is a FUNCTION rather than a conditional yielding a message on purpose. Two
// message-gates failing on the same argument intersect their literals, `'⛔ A' &
// '⛔ B'` is `never`, and TypeScript then reports "not assignable to parameter
// of type 'never'" with both messages gone — measured, and the exact trap the
// route gate's own note describes. A function member cannot collapse that way.
type RouteBrings<S extends State> = {
  readonly req: Request<ParamsOf<S>>
  readonly res: Response
}
type MwBrings<S extends State> = RouteBrings<S> & { readonly next: NextFunction }

type ArgsGate<Brings> = (app: never, args: Brings) => unknown

// What the scope says it reads, taken off the carrier it was started on.
type ParamsOf<S extends State> = S['args'] extends { readonly req: Request<infer P> } ? P : never

// What a middleware's steps populated — exactly what `toNext` copies onto
// `res.locals`, so the type and the runtime say the same thing.
type LocalsDerivedBy<S extends State> = S['acc'] extends Record<string, any>
  ? S['acc']
  : Record<string, any>

// THE MOUNTS ARE TRANSPARENT: each hands back the host's own type with what the
// scope knows filled in, rather than the widest thing that would compile.
//
//   a route     the PARAMS it declared, so `RequestHandler<{ id: string }>`
//   a middleware the LOCALS its steps derived, since `toNext` copies exactly
//                those onto `res.locals`
//
// Express accumulates neither across a router the way Hono's RPC schema does,
// so nothing downstream reads them on its own — but a handler written against
// one (`RequestHandler<P, any, any, ParsedQs, LocalsOf<typeof withActor>>`)
// then reads `res.locals.actor` typed, and the declaration stops being a lie.
export type LocalsOf<Mw> = Mw extends RequestHandler<any, any, any, any, infer L> ? L : never

export const express = <App extends object>(deps: App) => {
  // THE REJECTION IS HANDED TO EXPRESS, never dropped. A THROWN error is the
  // library's infrastructure signal (§3), and Express's error middleware is
  // where that signal is answered — so the fold's promise goes to `next`. Left
  // as a bare `void`, the request would hang until the client gave up and the
  // rejection would surface as an unhandled one, which Node's default
  // `--unhandled-rejections=throw` turns into a dead process.
  //
  // `.catch(next)` rather than RETURNING the promise: Express 5 forwards a
  // returned rejection on its own, Express 4 does not, and this says the same
  // thing on both.
  const handlerFor =
    <S extends State>(sc: unknown): RequestHandler<ParamsOf<S>> =>
    (req, res, next) => {
      void (sc as (app: App, args: object) => Promise<unknown>)(deps, { req, res }).catch(next)
    }

  return {
    // TWO VERBS, and the CHECKED one has the short name.
    //
    //   app.get(...route('/posts/:id', scope))     the pattern checked
    //   app.get('/posts/:id', handler(scope))      the bare handler, nothing checked
    //
    // Which one is called `route` is the whole point. Written as one verb with
    // two forms, the shorter and more natural call — `route(scope)` — was the
    // one that checks NOTHING, so the library's own principle 1 cost an extra
    // argument and a spread while the mistake was free. The adjective belongs
    // on whoever gives something up, not on whoever keeps it, so the escape
    // hatch is the one that has to be named — and `handler` says what it hands
    // back rather than what it skips.
    //
    // `handler` is not a shortcut kept for comfort: the pattern is Express's
    // own argument there, so it never reaches a type of ours and nothing can
    // compare it. That is a fact about Express rather than a choice — its
    // `P = RouteParameters<Route>` is a DEFAULT, used only where inference
    // found no candidate, and a handler we return always offers one, its own
    // `req`. Making it generic does not help: TypeScript instantiates the
    // variable to whatever keeps the call compatible, so a gate written inside
    // is never evaluated against the pattern. Measured across seven handler
    // shapes — concrete, generic, generic-constrained, `NoInfer`, and the gate
    // placed on the parameter, on `res`, or on the return type — and none
    // reaches it. A pattern reaches a type of ours only by being an ARGUMENT to
    // one, which is what `route` is for.
    //
    // Both carry `DepGuard` and the carrier gate: the deps were curried at
    // `express(deps)`, so a mount hands them to the scope exactly as a direct
    // call does, and a mount owing the scope less than it asks would be refused
    // nowhere and die on the first request.
    route: <Path extends string, S extends State>(
      path: Path,
      // The gates ride the SCOPE argument: intersected onto the path, a failing
      // gate collapses to `never` and the message is lost. `AnswerGate` and
      // `PathGate` are CHAINED for the same reason — two message literals side
      // by side reduce to `never` between themselves.
      sc: Scope<S> &
        ArgsGate<RouteBrings<S>> &
        DepGuard<App, S['need']> &
        AnswerGate<S, PathGate<Path, ParamsOf<S>>>,
    ): readonly [Path, RequestHandler<ParamsOf<S>>] => [path, handlerFor<S>(sc)],

    handler: <S extends State>(
      sc: Scope<S> & ArgsGate<RouteBrings<S>> & DepGuard<App, S['need']> & AnswerGate<S>,
    ): RequestHandler<ParamsOf<S>> => handlerFor<S>(sc),

    // Express has no middleware the scope could return a value TO: a middleware
    // either answers on `res` or calls `next()`. So `mw` appends `toNext` as the
    // leaf, and a step that stops simply never reaches it.
    //
    // No pattern here, and none to take: `app.use(…)` mounts across routes.
    mw:
      <S extends State>(
        // CHAINED, not intersected: `AnswerGate` and `StripGate` are both
        // message literals and both can fail here, and side by side they would
        // collapse to `never` with nothing left to read.
        sc: Scope<S> & ArgsGate<MwBrings<S>> & DepGuard<App, S['need']> & AnswerGate<S, StripGate<S>>,
        // `Request['query']` rather than naming `ParsedQs`: that type lives in
        // `qs`, which is not a dependency here, and the query slot has to be
        // filled to reach the locals one.
      ): RequestHandler<ParamsDictionary, any, any, Request['query'], LocalsDerivedBy<S>> => {
        // The leaf is appended ONCE, where `mw` is called. Built inside the
        // handler instead, every request would rebuild the step list and rewire
        // the verb map to reach the same value — `toNext` closes over nothing.
        const finished = (sc as { step: (s: unknown) => unknown }).step(toNext) as unknown as (
          app: App,
          args: unknown,
        ) => Promise<unknown>

        // `.catch(next)`, and here it is not only the error path: `toNext` — the
        // leaf that calls Express's own `next()` — lives inside the fold, so a
        // dropped rejection would leave the chain stalled with no response AND
        // no error handler reached.
        //
        // THE LATCH IS WHAT MAKES THAT SAFE. `toNext` calls `next()` and returns
        // at once (the limit stated where it is written), so the fold's promise
        // is still pending while the downstream handler runs — and a step that
        // throws AFTER `await next({})` rejects it then. Handed to `next` at
        // that point it becomes a 500 for a request that was about to answer
        // 200, with the handler's own write discarded and, on Express 5, the
        // resulting `ERR_HTTP_HEADERS_SENT` swallowed so nothing is logged
        // either. Measured.
        //
        // So the rejection goes to Express only in the window where Express can
        // still act on it: before control was handed on. After, the response
        // belongs to the handler and this error has nowhere left to go — it is
        // DROPPED, and dropped SILENTLY, because there is nowhere for it to be
        // dropped loudly: this package has no logger and invents no channel, so
        // saying otherwise would be a comfort rather than a fact. The two
        // alternatives are worse and both were measured: `next(err)` is the 500
        // above, and rethrowing is the unhandled rejection that kills the
        // process. Work that must survive the response does not belong in a
        // step here.
        //
        // `handOn` MARKS and forwards; it does not deduplicate. Calling
        // Express's `next` twice is Express's own business, and a wrapper that
        // quietly swallowed the second call would be a second behaviour hiding
        // inside a latch that exists for one thing.
        return (req, res, next): void => {
          let handedOn = false
          const handOn: NextFunction = (...args) => {
            handedOn = true
            next(...args)
          }

          void finished(deps, { req, res, next: handOn }).catch((err: unknown) => {
            if (!handedOn) next(err)
          })
        }
      },
  }
}

// ── the read extensions ──────────────────────────────────────────────────────
// PLAIN STEPS, not verbs: these ADD a ctx entry, and a verb is what may REPLACE
// one (`@lntt/scope/guard`). The reasoning is written out in the Hono carrier.
//
// Express is its own family: `req` is a Node message, not a Fetch `Request`, so
// the readers are handed the two shapes they really need — a `URLSearchParams`
// and header pairs — and the adaptation happens here, in two lines, rather than
// a Fetch shim being built around a Node stream.
export type { Query, Cookies, Headers_ as HeaderEntries, Encoding, BodyOf } from '../reads.ts'

// `req.originalUrl` rather than `req.url`: under a mounted router the second is
// rewritten relative to the mount, and the query string survives both — but the
// first is what the client actually sent, which is what a step reading `query`
// means. The base is a placeholder; only the search part is read.
export const query = async (
  _app: {},
  { req }: { readonly req: Request },
  next: Next<{ query: Query }>,
) => next({ query: queryFrom(new URL(req.originalUrl ?? req.url, 'http://host.invalid').searchParams) })

export const headers = async (
  _app: {},
  { req }: { readonly req: Request },
  next: Next<{ headers: HeaderRecord }>,
) =>
  next({
    headers: headersFrom(
      Object.entries(req.headers).map(
        ([name, value]) => [name, Array.isArray(value) ? value.join(', ') : (value ?? '')] as const,
      ),
    ),
  })

export const cookies = async (
  _app: {},
  { req }: { readonly req: Request },
  next: Next<{ cookies: Cookies }>,
) => next({ cookies: cookiesFrom(req.headers.cookie) })

// TWO WORLDS, and the branch is unavoidable rather than a shortcut. If a body
// parser is already mounted — `express.json()` app-wide is the common case — it
// has CONSUMED the stream, so reading it again yields nothing; its result is
// what the route really has, and using it is the only correct answer. With no
// parser mounted the stream is ours, and then the read and the parse are split
// the way they are everywhere else: collecting the chunks is I/O and throws,
// parsing the bytes in hand comes back as issues.
//
// WHOEVER PARSES FIRST OWNS THE ERROR PATH, and that is the whole of what a
// mounted parser changes. Measured, and pinned in `reads.test.ts`:
//
//                        with `express.json()`        without
//   valid JSON           the leaf, from `req.body`     the leaf, read here
//   INVALID JSON         Express's own 400 — this      this `onError`, 422
//                        `onError` never runs, the
//                        parser threw before the
//                        scope existed
//   EMPTY body           the leaf, with `{}`           this `onError`, 422
//   wrong encoding       this `onError` (below)        this `onError`
//
// So DO NOT MOUNT A BODY PARSER on a route whose scope reads the body. Express
// scopes middleware to a path, so a legacy route can keep `express.json()` while
// one with a scope does not — and then this carrier behaves as the other three
// do, with `onError` as the single error path. Mounted anyway, nothing is
// unsafe: the encoding check below closes the case where the data would be
// WRONG, and what is left is which of two correct answers the client gets.
//
// WITH ONE COST STILL OWED, and it is not `express.json()`'s: the read below has
// no size limit, where that parser has 100kB by default. Node has no default of
// its own either, so following the advice above today means an unbounded read.
// A limit with a default is #91.
export const body =
  <E extends Encoding, R>(
    encoding: E,
    onError: (
      issues: readonly StandardIssue[],
      ctx: { readonly req: Request; readonly res: Response },
    ) => R,
  ) =>
  async (
    _app: {},
    ctx: { readonly req: Request; readonly res: Response },
    next: Next<{ body: BodyOf<E> }>,
  ): Promise<Passed | Awaited<R>> => {
    if (ctx.req.body !== undefined) {
      // A PARSED BODY DOES NOT SAY WHAT PARSED IT. `express.json()` mounted
      // app-wide leaves an object behind whatever the route asked for, so
      // `body('form')` would hand a JSON payload on as form fields — no error,
      // no `onError`, wrong data. The header the client sent is the only
      // evidence left once the stream is gone, so it is what gets checked.
      const sent = ctx.req.headers['content-type']

      if (!encodingMatches(sent, encoding)) {
        // `||` and not `??`: a header that is PRESENT AND EMPTY is `''`, which
        // `??` passes straight through into the message.
        return onError(
          [{ message: `the body was sent as ${sent || 'nothing'}, not ${encoding}` }],
          ctx,
        ) as Awaited<R>
      }

      if (isMultipart(sent)) {
        return onError(
          [
            {
              message:
                'a multipart body was parsed by other middleware: its files are not on `req.body`, so this entry would be half the payload',
            },
          ],
          ctx,
        ) as Awaited<R>
      }

      return next({ body: ctx.req.body as BodyOf<E> })
    }

    const chunks: Buffer[] = []
    for await (const chunk of ctx.req) chunks.push(chunk as Buffer)

    const read = await readBody(
      new globalThis.Request('http://body.invalid', {
        method: 'POST',
        headers: { 'content-type': ctx.req.headers['content-type'] ?? '' },
        body: Buffer.concat(chunks),
      }),
      encoding,
    )

    if ('issues' in read) return onError(read.issues, ctx) as Awaited<R>
    return next({ body: read.value as BodyOf<E> })
  }
