// `@lntt/scope/trpc` — the tRPC carrier and its mount.
//
// A carrier is `__args` alone (§43). tRPC's shape is its own: a resolver gets
// `input` — already read AND validated by `.input(schema)`, so there is no raw
// body to split from a schema check the way Express and Hono need — and `ctx`,
// created once per request by the transport.
//
// There is no `mw` here. A procedure is the only mount unit tRPC has, and
// giving it an Express-shaped middleware would invent a door tRPC does not
// have.

import type { TRPCMiddlewareFunction, TRPCRootObject } from '@trpc/server'
import type { DepGuard, Scope, State } from '../index.ts'

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
// `In` is what the scope says it reads of the input. It defaults to `unknown`
// — a scope that declares nothing reads it at that width and casts, and mounts
// on any procedure. Declaring it (`carrier<{ id: string }>()`) types `input`
// inside every step AND makes `.input(schema)` checkable against it: the
// resolver tRPC expects takes the schema's OUTPUT, so contravariance refuses a
// scope reading something the schema does not supply.
export interface TrpcCarrier<Ctx, In = unknown> {
  readonly __args?: { readonly input: In; readonly ctx: Ctx }
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

// ── gate: the scope was written for THIS carrier ─────────────────────────────
// `procedure` above has this for free — it names the args in a real parameter
// position — and `middleware`, which takes a `Scope<S>` and casts, had nothing
// checking that axis. Written as a FUNCTION the scope must be assignable to, so
// `strictFunctionTypes` does the refusing; the reasoning is in the Express
// carrier.
//
// `input` is taken FROM THE SCOPE rather than fixed at `unknown`: what a
// middleware is handed depends on where it sits in the chain, and `.input`'s
// own check rides `procedure`. What this member states is the CONTEXT, which is
// the app's and is the same for every middleware it mounts.
type ArgsGate<T, S extends State> = (
  app: never,
  args: { readonly input: S['args'] extends { readonly input: infer I } ? I : unknown; readonly ctx: CtxOf<T> },
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
  carrier: <In = unknown>(): TrpcCarrier<CtxOf<T>, In> => ({}),

  // `In` is inferred FROM THE SCOPE, and that is what puts `.input(schema)`
  // under a check: the resolver tRPC expects is handed the schema's output, so
  // a scope reading `{ id: string }` mounted on a procedure whose schema
  // supplies `{ slug: string }` is refused at the argument by contravariance —
  // no gate of ours, the same shape `DepGuard` relies on. `R` stays generic so
  // the resolver's return survives, which is what `.output(schema)` and
  // `inferRouterOutputs` both read.
  procedure:
    <In, R>(sc: (app: App, args: { readonly input: In; readonly ctx: CtxOf<T> }) => R) =>
    (args: { readonly input: In; readonly ctx: CtxOf<T> }): R =>
      sc(deps, args),

  // A scope as a tRPC MIDDLEWARE: `t.middleware(middleware(scope))`. The
  // transparency that matters here is the CONTEXT OVERRIDE — tRPC reads what a
  // middleware adds to `ctx` off what `next` was called with, and carries it
  // into every procedure that `.use`s it. So `next` is called with exactly
  // `S['acc']`, and what it hands back is handed straight on.
  // `DepGuard` rides the argument here where `procedure` above gets the same
  // verdict for free — its plain `(app: App, …) => R` shape puts the deps under
  // contravariance. A `Scope<S>` argument does not, so the gate is written.
  middleware: <S extends State>(
    sc: Scope<S> & ArgsGate<T, S> & DepGuard<App, S['need']> & StripGate<S>,
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
