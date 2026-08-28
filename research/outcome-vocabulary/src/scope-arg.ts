// CANDIDATE API — the carrier as an ARGUMENT to the builder, not an `.extend`.
// Read this next to `scope.ts`: same machinery, one difference, and the
// difference is what it makes impossible.
//
// `.extend(carrier)` cannot say "exactly one". `scope().extend(http).extend(rpc)`
// compiles today (verified against the shipped packages) and only fails later,
// at the mount, by accident — every host refuses the other's words, so it
// mounts NOWHERE rather than being refused where it was written. A constructor
// argument makes that a non-category: you call it once.
//
// Decision 35 rejected this shape, on a premise that has since expired: it
// argued tRPC "shares `RequestCarrier` with the HTTP hosts and differs only by
// CAPABILITY … it is not a distinct carrier or builder surface". Under the
// per-carrier vocabulary that is no longer true — tRPC differs by the words it
// can say. What decision 35 got right and this keeps: no carrier is the
// privileged default, and `scope()` with no argument stays a real thing.
import {
  type Abort,
  type IntentKeysOf,
  type IntentMap,
  type Ok,
  type ValueOf,
} from './kernel.ts'

type AccOf<T> = T extends { readonly __acc?: infer A } ? (A extends object ? A : {}) : {}
type CtxOf<T> = T extends { readonly __ctx?: infer C } ? (C extends object ? C : {}) : {}
type ParamsOf<T> = T extends { readonly __params?: infer P } ? P : undefined
type IntentsOf<T> = T extends { readonly __intents?: infer M }
  ? M extends object
    ? keyof M
    : never
  : never
type DeclaredOf<T> = T extends { readonly __declares?: infer M }
  ? M extends object
    ? keyof M
    : never
  : never

export type Ctx<Self> = { readonly params: ParamsOf<Self> } & CtxOf<Self> & AccOf<Self>

type Undeclared<Self, R> = Exclude<IntentKeysOf<R>, DeclaredOf<Self>>
type DeclGate<Self, R, A = Awaited<R>, U = Exclude<IntentKeysOf<A>, DeclaredOf<Self>>> = [
  U,
] extends [never]
  ? unknown
  : `⛔ this scope does not declare the intent: ${U & string} — is it the right carrier?`

export interface Handler<R, Int> {
  readonly __r?: R
  readonly __int?: (i: Int) => Int
}

export type MountGate<Int, HostInt> = [Exclude<Int, HostInt>] extends [never]
  ? unknown
  : `⛔ this host cannot render the intent: ${Exclude<Int, HostInt> & string}`

// A CARRIER is the thing you pick exactly one of; a CHANNEL (`cookies`,
// `headers`, `body`) is a thing you add. They are DISJOINT BY DECLARATION, not
// by shape: a carrier states that it is one, and a channel states that it is
// not. Deriving the category instead — "it is a carrier if it coins a
// vocabulary" — reads the CONSEQUENCE rather than the definition, and that is
// exactly how `react-router` got miscategorised once: at the moment it was
// judged it coined nothing, and it later grew a vocabulary. Declared, its
// author has to answer the question up front.
// The brand goes on the CHANNEL, and only there. Branding both — carrier
// `true`, channel `never` — is the shape that suggests itself first and it
// COLLAPSES: `Scope & Http & Cookies` reduces to `never` on the conflicting
// property, and carrier-plus-channel is the ordinary case. With the brand on
// one side only there is nothing to conflict, and a carrier fails `.extend`'s
// constraint simply because it does not carry it.
export declare const CHANNEL: unique symbol

export interface Carrier {
  readonly __ctx?: object
  readonly __declares?: object
  // Which channels this PROTOCOL admits at all. Not the same claim as the
  // mount's: tRPC has no `Set-Cookie` ever, while a hand-wired HTTP host may
  // simply not flush the ones HTTP does have. The first is knowable where the
  // scope is WRITTEN, the second only where it is MOUNTED — so both gates
  // exist and neither replaces the other (§34's "narrowing a host's set is
  // always legitimate" still holds at the mount).
  readonly __admits?: object
}
export interface Channel {
  readonly [CHANNEL]: true
  readonly __ctx?: object
  readonly __caps?: object
}

type CapsOf<T> = T extends { readonly __caps?: infer M }
  ? M extends object
    ? keyof M
    : never
  : never
type AdmitsOf<T> = T extends { readonly __admits?: infer M }
  ? M extends object
    ? keyof M
    : never
  : never

// A channel needing nothing has `CapsOf` = `never`, and `Exclude<never, …>` is
// `never`, so it passes — the tuple keeps that from being a vacuous pass for
// everything else.
type Admitted<Self, F> = [Exclude<CapsOf<F>, AdmitsOf<Self>>] extends [never]
  ? unknown
  : `⛔ this carrier has no ${Exclude<CapsOf<F>, AdmitsOf<Self>> & string} to speak of`

export interface Scope {
  readonly __acc?: object
  readonly __ctx?: object
  readonly __intents?: object
  readonly __declares?: object
  readonly __params?: unknown

  extend<F extends Channel, Self = this>(this: Self, ext: F & Admitted<Self, F>): Self & F

  guard<R, Self = this>(
    this: Self,
    g: ((ctx: Ctx<Self>) => R) & DeclGate<Self, R>,
  ): Self & { readonly __acc?: ValueOf<Awaited<R>>; readonly __intents?: IntentMap<IntentKeysOf<Awaited<R>>> }

  handle<R, Self = this>(
    this: Self,
    leaf: ((ctx: Ctx<Self>) => R) & DeclGate<Self, R>,
  ): Handler<ValueOf<Awaited<R>>, IntentsOf<Self> | IntentKeysOf<Awaited<R>>>
}

// The two overloads ARE the API: no argument is the agnostic scope (no input
// verb, no vocabulary — `feedScope`, `listScope`, `aboutScope` in the real
// examples are exactly this and mount everywhere by construction), one argument
// is a carrier and brings its verbs with it.
export declare function scope(): Scope
export declare function scope<C extends Carrier>(carrier: C): Scope & C

export type { Abort, Ok }
