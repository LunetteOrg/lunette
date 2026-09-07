// The route gate, shared by the hosts that take a pattern at the mount.
//
// ONE GATE, TWO READERS. What differs per host is only how its framework spells
// a pattern's params — Express's `RouteParameters` builds an object, Hono's
// `ParamKeys` a union of keys with the `?` kept inside — so each subpath
// normalises its own framework's answer into `Supply` and everything past that
// is written once, here. WE WRITE NO PARSER on either side: a reader of ours
// would drift from the router that matches paths at runtime, and both
// frameworks' understand cases one of ours would bail on (`*path`, `{/:id}`, a
// bare wildcard naming nothing).
//
// THE DEMAND IS THE SCHEMA, and that is the whole design (§53). It is read off
// what `.validate('params', schema, onError)` wrote into the state, so the two
// things compared each exist for a reason of their own — the pattern to route,
// the schema to validate — and nothing is declared a third time to be compared.

import type { State } from './index.ts'

// A pattern this gate cannot read. Not `never`, and the difference matters: see
// the note on `Unsupplied`.
declare const OPAQUE: unique symbol
export type Opaque = typeof OPAQUE

// A pattern's params, normalised: what it always supplies, and what it supplies
// only sometimes. OPTIONALITY IS MEANING — `/posts{/:id}` (Express) and
// `/posts/:id?` (Hono) also match WITHOUT the param, so a route that supplies
// `id` optionally does not satisfy a schema demanding it — and each host's own
// reader already carries the distinction, in its own spelling.
export interface Supply<Req extends string, Opt extends string> {
  readonly req: Req
  readonly opt: Opt
}

// ── the demand ───────────────────────────────────────────────────────────────
// What `validate` put on the ctx: the schema's OUTPUT, and the one place any
// host reads what a scope says about an entry it did not merely receive.
//
// The tRPC carrier borrows THIS half and none of the rest: it has no pattern to
// compare — its framework supplies a schema, so `.input(schema)`'s own output
// meets `Validated<S, 'input'>` at the resolver's parameter and contravariance
// does the refusing, with no gate of ours (§53). What is shared is where the
// demand comes from, which is the whole point of the design.
export type Validated<S extends State, N extends string> = N extends keyof S['acc']
  ? S['acc'][N]
  : unknown

// The params half, which is what the two pattern hosts compare.
export type ValidatedParams<S extends State> = Validated<S, 'params'>

type Req<P> = { [K in keyof P]-?: {} extends Pick<P, K> ? never : K }[keyof P]
type Opt<P> = { [K in keyof P]-?: {} extends Pick<P, K> ? K : never }[keyof P]

// A ctx whose `params` nobody validated is the raw dictionary the extension
// populates, and its `keyof` is the wide `string`. That says "names nothing",
// never "reads every possible name": unvalidated, there is nothing to compare
// and the gate has no opinion, which is the safe direction. The same reading
// covers a scope with no `params` step at all, whose demand is `unknown`.
type DemandedReq<Par> = string extends keyof Par ? never : Req<Par>
type DemandedOpt<Par> = string extends keyof Par ? never : Opt<Par>

// ── the comparison ───────────────────────────────────────────────────────────
// ONE DIRECTION, and which one is the point. The scope DEMANDS — its schema
// says the param must be there — and the route SUPPLIES. A param the schema
// demands and the pattern does not supply is `undefined` at runtime and a 400
// on every request the route ever serves; a param supplied and never validated
// is nothing at all, since reading it goes through `ctx.params`, which IS the
// schema. A superset passes, the verdict `DepGuard` gives the chain, and what
// lets one scope mount under a nested route.
//
// A required demand takes only a required supply; an optional one takes either,
// since the schema already admits its absence.
//
// THE OPAQUE TEST IS ON A WRAPPER, not on a key set, and that is deliberate.
// Written against the keys directly it reads `Opaque extends Keys`, and a
// param-less pattern's key set is `never`, which extends everything VACUOUSLY —
// so the gate would silently skip every param-less route (measured, twice: once
// on each host). A `Supply<never, never>` is an ordinary object type and is not
// `Opaque`, so the empty case takes the same path as any other.
export type Unsupplied<Sup, Par> = [Sup] extends [Opaque]
  ? never
  : Sup extends Supply<infer R, infer O>
    ? Exclude<DemandedReq<Par>, R> | Exclude<DemandedOpt<Par>, R | O>
    : never

// GATES THAT CAN BOTH FAIL ARE CHAINED, never intersected side by side: two
// message literals meeting on one argument give `'⛔ A' & '⛔ B'`, which is
// `never`, and TypeScript then reports "not assignable to parameter of type
// 'never'" with both messages gone (§44). So this takes what to check NEXT, and
// only one of them can be the answer.
export type PathGate<Sup, Par, Then = unknown> = [Unsupplied<Sup, Par>] extends [never]
  ? Then
  : `⛔ this route does not supply a param the scope validates: ${Unsupplied<Sup, Par> & string}`
