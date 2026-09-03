// `@lntt/scope/trpc` — the tRPC carrier and its mount.
//
// A carrier is `__args` alone (§43). tRPC's shape is its own: a resolver gets
// `input` — already read AND validated by `.input(schema)`, so there is no raw
// body to split from a schema check the way Express and Hono need — and `ctx`,
// created once per request by the transport.
//
// There is no `mw` here. A procedure is the only mount unit tRPC has, and
// giving it an Express-shaped middleware would invent a door tRPC does not
// have — and so this subpath imports nothing from the core: a scope is already
// the function `procedure` calls.

// The context is the APPLICATION's, so the carrier is generic over it and a
// scope names its own: `scope(trpcCarrier<{ actorId: string | undefined }>())`.
// It is the one carrier that is a factory rather than a bare value, and the
// alternative — `ctx: unknown`, read at that width and cast the way `input` is
// — throws away the one thing tRPC types natively.
//
// A context with a REQUIRED key of `string | undefined` rather than an optional
// one is what tRPC's own types produce: `ProcedureResolverOptions` reshapes the
// context through a mapped type keyed on a UNION (`keyof TContext | keyof
// TContextOverridesIn`), which is not homomorphic and so drops the `?`
// modifier. Under `exactOptionalPropertyTypes` an optional `actorId?: string`
// would then refuse tRPC's own `{ actorId: string | undefined }`.
export interface TrpcCarrier<Ctx extends object> {
  readonly __args?: { readonly input: unknown; readonly ctx: Ctx }
}

// PURE DECLARATION — the returned object carries nothing; the type argument is
// the whole point of the call.
export const trpcCarrier = <Ctx extends object>(): TrpcCarrier<Ctx> => ({})

// `input` stays `unknown` and a step reads it at its own width and casts —
// where Express's per-route narrowing rides an index signature, `unknown`
// satisfies nothing narrower by assignment, and `.input(schema)` has already
// done the checking a narrower type would be claiming.
//
// `R` stays generic so a resolver's actual return type survives the wrapper,
// which is what tRPC's own output inference reads.
export const trpc = <App extends object, Ctx extends object>(deps: App) => ({
  procedure:
    <R>(sc: (app: App, args: { readonly input: unknown; readonly ctx: Ctx }) => R) =>
    (args: { readonly input: unknown; readonly ctx: Ctx }): R =>
      sc(deps, args),
})
