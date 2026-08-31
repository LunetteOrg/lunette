import { describe, expectTypeOf, it } from 'vitest'
import { standardSchema } from './extensions/standard-schema.ts'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Capability, Carrier, CarrierGuard, Channel, Handler, RequestHead } from './index.ts'
import { scope } from './scope.ts'
import { body } from './extensions/body.ts'
import { http } from './extensions/http.ts'

// The capability alphabet is OPEN: an extension coins its own names and the core
// enumerates none (§34). This file is the negative that keeps the gate SHUT for
// a name the core has never heard of.
//
// The failure it guards against is silent and OPEN, which is why it is worth a
// file: an unrecognised capability collapses to `never`, `CarrierGuard<never,
// HostCaps>` is `unknown`, the brand disappears from the intersection, and the
// scope mounts ANYWHERE — in the one mechanism whose whole job is to make a bad
// mount impossible.

// A third-party channel, written the way `./extensions/*` are but coining a
// capability @lntt/scope does not know. It extends `Channel`, which is how the
// brand arrives — an author never names the symbol.
interface SocketChannel extends Channel {
  readonly __admission: { readonly websocket: true }
  readonly __ctx?: { readonly socket: { send(data: string): void } }
  readonly __caps?: { readonly websocket: true }
}
declare const websocket: SocketChannel

// The carrier that admits it. A channel is added to a CARRIER, and a carrier's
// admitted set is written out — so a third-party channel needs a carrier that
// lists it, exactly as a third-party capability needs a MOUNT that claims it.
// The supply side of both gates is closed on purpose (§34), and #44 is where
// opening it is tracked; what this costs is that `http` will not take this
// channel until `http` says so, which is the definition-side echo of the same
// rule.
interface SocketCarrier extends Carrier {
  readonly __admits?: { readonly websocket: true }
  readonly __declares?: { readonly status: true }
}
declare const socketCarrier: SocketCarrier

// Two mounts standing in for two hosts, written exactly as an adapter writes one
// (`packages/integration/src/*.ts`): `Handler<…, Cap>` is what makes `Cap`
// inferable, and the guard is the only other clause.
// The mount reads the scope's REGISTRY, which the core keeps opaque — a host
// narrows it to what it needs (`{ params: S }`) at its own signature.
type AnyRegistry = Readonly<Record<string, unknown>>
// The seed an `http` scope requires. It is contravariant (it is the callable's
// parameter), so a mount naming `object` here would refuse every real scope.
type HttpSeed = { request: RequestHead; params: Readonly<Record<string, string>> }

declare const httpMount: <Need extends object, Reg extends AnyRegistry, R, Seed extends object, Cap extends Capability>(
  h: Handler<Need, Reg, R, Seed, Cap> & CarrierGuard<Cap, 'body' | 'set-cookie' | 'response-headers'>,
) => void

declare const socketMount: <Need extends object, Reg extends AnyRegistry, R, Seed extends object, Cap extends Capability>(
  h: Handler<Need, Reg, R, Seed, Cap> &
    CarrierGuard<Cap, 'body' | 'set-cookie' | 'response-headers' | 'websocket'>,
) => void

declare const bodylessMount: <
  Need extends object,
  Reg extends AnyRegistry,
  R,
  Seed extends object,
  Cap extends Capability,
>(
  h: Handler<Need, Reg, R, Seed, Cap> & CarrierGuard<Cap, 'set-cookie'>,
) => void

// The same shape as `bodylessMount`, kept separate so the named-type-argument
// cases below read against a carrier that plainly lacks `body`.
declare const httpMountCookiesOnly: <
  Need extends object,
  Reg extends AnyRegistry,
  R,
  Seed extends object,
  Cap extends Capability,
>(
  h: Handler<Need, Reg, R, Seed, Cap> & CarrierGuard<Cap, 'set-cookie'>,
) => void

// Reads the capability parameter back off a built handler, which is the axis
// under test — `never` here is the failure, not a detail.
// `Int` is captured with its OWN `infer`, not matched against a literal `any`:
// when a scope's actual `Int` is `never` (no aborts here), `(i: never) =>
// never` — the `__int` phantom's invariant shape — does not structurally
// extend `(i: any) => any`, so a fixed `any` in that slot would make the
// WHOLE match fail for exactly the scopes this file needs to read `Cap` off.
type CapOf<H> = H extends Handler<any, any, any, any, infer C, infer _Int, any> ? C : never

const socketScope = scope(socketCarrier)
  .extend(websocket)
  .handle((_deps: {}, ctx) => {
    ctx.socket.send('hi')
    return { ok: true }
  })

const bodyScope = scope(http)
  .extend(body('json'))
  .extend(standardSchema)
  .validate('body', {} as StandardSchemaV1<unknown, { title: string }>)
  .handle(() => ({ ok: true }))

describe('a capability the core never named', () => {
  it('is CARRIED into the handler, not silently dropped to never', () => {
    // THE regression this file exists for: `never` here means the gate is open.
    expectTypeOf<CapOf<typeof socketScope>>().toEqualTypeOf<'websocket'>()
  })

  it('mounts NOWHERE until a host claims it', () => {
    // @ts-expect-error CarrierGuard: this carrier provides no `websocket` capability
    httpMount(socketScope)
  })

  it('mounts on the host that DOES claim it', () => {
    socketMount(socketScope)
  })
})

describe('the shipped capabilities keep behaving', () => {
  it('mounts where the carrier provides `body`', () => {
    httpMount(bodyScope)
  })

  it('is rejected where it does not', () => {
    // @ts-expect-error CarrierGuard: this carrier provides no `body` capability
    bodylessMount(bodyScope)
  })
})

// The gate holds for mounts whose type arguments are INFERRED — which is every
// mount anyone writes — and it has to hold when they are NAMED too. `__need` and
// `__cap` are phantoms of the SAME shape, so what separates them is the
// direction of each predicate against the bottom type: `Pub extends never` is
// false, so `DepGuard` fires, while `Exclude<never, HostCaps>` is vacuously
// `never`, so `CarrierGuard` used to vanish. `__cap` puts `Cap` in both
// positions to make it invariant, which is what refuses the assignment (§34).
describe('a mount that names its type arguments', () => {
  it('cannot declare away a capability the scope requires', () => {
    // @ts-expect-error CarrierGuard: naming `never` does not shed the `body` requirement
    httpMountCookiesOnly<object, AnyRegistry, unknown, HttpSeed, never>(bodyScope)
  })

  it('still takes a scope whose capability the carrier does provide', () => {
    httpMount<object, AnyRegistry, unknown, HttpSeed, 'body'>(bodyScope)
  })
})

// A capability key that is not a string: dropping it would leave `never`, which
// is the fail-OPEN this file exists to prevent. It becomes a name no carrier
// claims instead, so the scope mounts nowhere (§34).
interface OddChannel extends Channel {
  readonly __admission: { readonly odd: true }
  readonly __caps?: { readonly [k: symbol]: true }
}
declare const odd: OddChannel

interface OddCarrier extends Carrier {
  readonly __admits?: { readonly odd: true }
}
declare const oddCarrier: OddCarrier

describe('a capability key that is not a string', () => {
  it('mounts nowhere rather than silently carrying nothing', () => {
    const oddScope = scope(oddCarrier)
      .extend(odd)
      .handle(() => ({ ok: true }))
    // @ts-expect-error CarrierGuard: a non-string capability key is claimed by no carrier
    httpMount(oddScope)
  })
})
