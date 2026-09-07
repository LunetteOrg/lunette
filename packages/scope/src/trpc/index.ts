// `@lntt/scope/trpc` — the tRPC carrier and its two mounts.
//
// A carrier is `__args` alone (§43). tRPC's shape is its own: a resolver gets
// `input` — already read AND validated by `.input(schema)`, so there is no raw
// body to split from a schema check the way Express and Hono need — and `ctx`,
// created once per request by the transport.
//
// There is no `mw` here, and `middleware` is not one under another name: an
// EXPRESS-shaped middleware would invent a door tRPC does not have, while
// `t.middleware` is a door tRPC already owns. So the second mount is tRPC's own
// unit, and what it hands the chain is a CONTEXT OVERRIDE rather than a
// `res.locals` copy or a `c.set` (§45).

import type { TRPCMiddlewareFunction, TRPCRootObject } from '@trpc/server'
import type { DepGuard, ResultOf, Scope, State } from '../index.ts'
import type { Validated } from '../route-gate.ts'

// The context is the APPLICATION's — a session, a tenant, an actor id — so the
// carrier is generic over it where the other three publish types their
// framework owns and can be bare values.
//
// A context with a REQUIRED key of `string | undefined` rather than an optional
// one is what tRPC's own types produce: `ProcedureResolverOptions` reshapes the
// context through a mapped type keyed on a UNION (`keyof TContext | keyof
// TContextOverridesIn`), which is not homomorphic and so drops the `?`
// modifier. Under `exactOptionalPropertyTypes` an optional `actorId?: string`
// would then refuse tRPC's own `{ actorId: string | undefined }`.
//
// `Ctx` is UNCONSTRAINED: what has to be an object is `__args` itself, which it
// is whatever sits under `ctx` — and a constraint here would force the
// inference below to be widened to satisfy it, which is a type the steps would
// then read.
// `input` is FIXED at `unknown`, and that is the whole of what a run brings
// here: the raw value tRPC hands a resolver, already read and validated by
// `.input(schema)`. The carrier used to take an `In` saying which shape the
// scope reads of it, and it went the way Express's and Hono's params
// declarations went (§53) — what a scope reads of an entry is said by
// `.validate('input', schema, onError)`, once, and `procedure` puts THAT in the
// resolver's parameter so `.input(schema)` is still checked against it by
// contravariance.
export interface TrpcCarrier<Ctx> {
  readonly __args?: { readonly input: unknown; readonly ctx: Ctx }
}

// What the app's context IS, read off the tRPC builder the app already made.
//
// `TRPCRootObject` is tRPC's PUBLIC root-object type — the thing
// `initTRPC.context<Ctx>().create()` returns — and not the `_config` member its
// own typings mark `@internal`. It fails CLOSED: anything that is not a builder
// yields `never`, so the carrier declares a ctx no step can read rather than
// silently widening to `{}`.
type CtxOf<T> = T extends TRPCRootObject<infer Ctx, any, any> ? Ctx : never

// The app's `meta`, read off the same builder — a middleware's type carries it,
// and inventing `object` in its place would refuse an app that declared one.
type MetaOf<T> = T extends TRPCRootObject<any, infer Meta, any> ? Meta : object

// The carrier comes OUT of the mount factory here, where the other three are
// imported beside theirs. That asymmetry is the price of writing the context
// type NOWHERE: `t` already knows it, and a scope must know it BEFORE its first
// `.step` — a step is checked against `Ctx<S>` when it is added, so a mount that
// tried to supply the context afterwards would arrive too late to help.
//
// `input` stays `unknown` and a step reads it at its own width and casts —
// where Express's per-route narrowing rides an index signature, `unknown`
// satisfies nothing narrower by assignment, and `.input(schema)` has already
// done the checking a narrower type would be claiming.
//
// `R` stays generic so a resolver's actual return type survives the wrapper,
// which is what tRPC's own output inference reads.
// What a middleware's steps derive becomes tRPC's own CONTEXT OVERRIDE — the
// leaf every `middleware()` chain ends on, appended by it so nobody has to
// remember to write it. It is the exact twin of Express's `res.locals` copy and
// Hono's `c.set`, in the shape tRPC reads: `next({ ctx })`.
//
// `ctx` and `input` are destructured out: what extends the context is what the
// STEPS populated, not what the run was handed.
const toNext =
  <R>(next: (o: { readonly ctx: object }) => R) =>
  async (_app: {}, seen: Record<string, unknown>) => {
    const { ctx, input, ...derived } = seen
    void ctx
    void input
    return next({ ctx: derived })
  }

// ── NO READ EXTENSIONS HERE, and the two refusals differ in hardness ─────────
// The other three carriers ship `query`, `cookies`, `headers` and `body` (#62).
// This one ships none, and the reasons are not the same one twice:
//
// THE BODY IS UNREACHABLE. What a run brings here is `input` and `ctx` — the
// transport made both, and the request that carried them is gone by the time a
// resolver sees them. There is nothing for a `body` step to read, and offering
// one would be a name over an empty box. `.input(schema)` has already read AND
// validated it, which is why this carrier declares `In` instead.
//
// THE URL IS RIGHT THERE, and that refusal is ADVISORY. A tRPC transport does
// have a URL, and a step could parse one by hand off whatever the app put on its
// context. What is declined is a typed convenience for a case that does not
// exist in tRPC's own model: a procedure is addressed by its path in the router,
// not by a query string, so a `query` entry would invite a shape the protocol
// does not carry. An app that really has one puts it on its context and reads it
// there — and `validate('input', schema, onError)` is the door for everything
// the client actually sends.
//
// Conflating the two would be the "false safety" #38 warns about: the first is a
// fact about the transport, the second is a judgement about a design.

// ── gate: the scope was written for THIS carrier ─────────────────────────────
// `procedure` above has this for free — it names the args in a real parameter
// position — and `middleware`, which takes a `Scope<S>` and casts, had nothing
// checking that axis. Written as a FUNCTION the scope must be assignable to, so
// `strictFunctionTypes` does the refusing; the reasoning is in the Express
// carrier.
//
// `input` is `unknown`, which is what a run really brings (the carrier's own
// note): what a scope reads OF it is the resolver's parameter's business, over
// on `procedure`. What this member states is the CONTEXT, which is the app's
// and is the same for every mount it takes.
type ArgsGate<T> = (
  app: never,
  args: { readonly input: unknown; readonly ctx: CtxOf<T> },
) => unknown

// ── gate: what a MIDDLEWARE derives, against what the run itself brought ─────
// `toNext` strips `ctx` and `input` back off by NAME, because the fold hands it
// one merged object and a name is all there is to tell the run's own args from
// what the steps populated. A step deriving either — a parsed `input` is the
// plausible one — is dropped before `next({ ctx })` and silently never reaches
// the procedure downstream. The reasoning is written out in the Express
// carrier, where the same collision hangs the request.
type Strips<S extends State> = Extract<keyof S['acc'], 'ctx' | 'input'>

type StripGate<S extends State> = [Strips<S>] extends [never]
  ? unknown
  : `⛔ this middleware derives a ctx key the run itself brought: ${Strips<S> & string} — the leaf strips those by name, so it would never arrive`

export const trpc = <T, App extends object>(_t: T, deps: App) => ({
  // PURE DECLARATION — the object carries nothing at all; what it is FOR is the
  // type it hands the scope.
  carrier: (): TrpcCarrier<CtxOf<T>> => ({}),

  // WHAT `.input(schema)` IS CHECKED AGAINST IS THE SCHEMA THE SCOPE VALIDATED
  // WITH — `Validated<S, 'input'>`, the same source the two pattern hosts read
  // for their route gate (§53). It sits in the RESOLVER'S PARAMETER, so the
  // check is tRPC's own and not a gate of ours: the resolver tRPC expects is
  // handed `.input(schema)`'s OUTPUT, and a resolver demanding `{ id: string }`
  // does not accept a procedure supplying `{ slug: string }` — nor one
  // supplying nothing, whose resolver is handed `undefined`. A scope that
  // validates no input demands `unknown` and mounts on any procedure.
  //
  // `Scope<S>` rather than a plain function shape, which is what reading the
  // state costs: `DepGuard` and the carrier gate came free from a
  // `(app: App, args) => R` parameter and are written out now. `ResultOf` keeps
  // the leaf's value, which is what `.output(schema)` and `inferRouterOutputs`
  // both read.
  procedure:
    <S extends State>(sc: Scope<S> & ArgsGate<T> & DepGuard<App, S['need']>) =>
    (args: {
      readonly input: Validated<S, 'input'>
      readonly ctx: CtxOf<T>
    }): Promise<ResultOf<Scope<S>>> =>
      (sc as unknown as (app: App, a: object) => Promise<ResultOf<Scope<S>>>)(deps, args),

  // A scope as a tRPC MIDDLEWARE: `t.middleware(middleware(scope))`. The
  // transparency that matters here is the CONTEXT OVERRIDE — tRPC reads what a
  // middleware adds to `ctx` off what `next` was called with, and carries it
  // into every procedure that `.use`s it. So `next` is called with exactly
  // `S['acc']`, and what it hands back is handed straight on.
  // `DepGuard` rides the argument here where `procedure` above gets the same
  // verdict for free — its plain `(app: App, …) => R` shape puts the deps under
  // contravariance. A `Scope<S>` argument does not, so the gate is written.
  middleware: <S extends State>(
    sc: Scope<S> & ArgsGate<T> & DepGuard<App, S['need']> & StripGate<S>,
  ): TRPCMiddlewareFunction<
    CtxOf<T>,
    MetaOf<T>,
    object,
    S['acc'],
    unknown
  > =>
    // The RETURN TYPE is written out rather than inferred, and that is what
    // makes the override arrive: `t.middleware(fn)` reads `$ContextOverrides`
    // off `fn`'s declared return (`Promise<MiddlewareResult<…>>`), so a generic
    // return inferred from the `next` we are handed leaves it with nothing to
    // read and the context silently does not grow (measured — the procedure
    // downstream then sees the bare context).
    ((opts) => {
      const finished = (sc as unknown as { step: (s: unknown) => unknown }).step(
        toNext(opts.next as unknown as (o: { readonly ctx: object }) => unknown),
      ) as unknown as (app: App, args: object) => never
      // The fold's promise resolves to what `next` handed back, and a promise
      // of a promise is that promise once awaited — the only shape tRPC sees.
      return finished(deps, { input: opts.input, ctx: opts.ctx })
    }) as TRPCMiddlewareFunction<CtxOf<T>, MetaOf<T>, object, S['acc'], unknown>,
})
