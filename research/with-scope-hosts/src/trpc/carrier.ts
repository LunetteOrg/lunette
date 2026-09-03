// tRPC's own shape: a procedure resolver gets `input` (already read AND
// validated by `.input(schema)` — there is no raw body to split from a
// schema check the way Hono/Express need) and `ctx` (created once per
// request, carrying whatever the transport put there — here, an actor id).
// There is no req/res pair and no middleware in the Express sense: `ctx` is
// the closest thing to Express's `req`, and it is data a step reads, never
// something with behaviour to keep out of `app`.
// A required key of `string | undefined`, not an optional one: tRPC's own
// `ProcedureResolverOptions.ctx` type reshapes context through a mapped type
// keyed on a UNION (`keyof TContext | keyof TContextOverridesIn`), which is
// not homomorphic and so drops the `?` modifier — under
// `exactOptionalPropertyTypes`, an optional `actorId?: string` here would
// then refuse tRPC's own `{ actorId: string | undefined }` shape.
export type Context = { readonly actorId: string | undefined }

export interface TrpcCarrier {
  readonly __args?: { readonly input: unknown; readonly ctx: Context }
}

export const trpcCarrier: TrpcCarrier = {}

// `app` = deps, curried once, same as every other host — but there is no
// `mw` here: a tRPC procedure is the only mount unit this host has, and
// forcing an Express-shaped middleware onto it would invent a door tRPC
// does not have (§76 already found tRPC's ownership model differs, not
// just its syntax).
//
// `Args` is fixed, not generic like Express's `route<Args>` — Express's
// per-route narrowing rides an INDEX SIGNATURE (`ParamsDictionary`, which
// structurally satisfies a literal `{ id: string }`); `input` here is
// `unknown`, which satisfies nothing narrower by assignment. A step reads
// it at its own width and casts, same as Express's `req.params.id as
// string`. `R` stays generic so a procedure's actual return type survives
// through the wrapper, for tRPC's own output inference.
export const trpc = <App extends object>(deps: App) => ({
  procedure:
    <R>(sc: (app: App, args: { readonly input: unknown; readonly ctx: Context }) => R) =>
    (args: { readonly input: unknown; readonly ctx: Context }): R =>
      sc(deps, args),
})
