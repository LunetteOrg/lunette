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

import type { TRPCRootObject } from '@trpc/server'

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
export const trpc = <T, App extends object>(_t: T, deps: App) => ({
  // PURE DECLARATION — the object carries nothing at all; what it is FOR is the
  // type it hands the scope.
  carrier: {} as TrpcCarrier<CtxOf<T>>,

  procedure:
    <R>(
      sc: (app: App, args: { readonly input: unknown; readonly ctx: CtxOf<T> }) => R,
    ) =>
    (args: { readonly input: unknown; readonly ctx: CtxOf<T> }): R =>
      sc(deps, args),
})
