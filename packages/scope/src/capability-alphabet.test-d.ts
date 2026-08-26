import { describe, expectTypeOf, it } from 'vitest'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Capability, CarrierGuard, Handler, ScopeExtension } from './index.ts'
import { scope } from './scope.ts'
import { body } from './extensions/body.ts'

// The capability alphabet is OPEN: an extension coins its own names and the core
// enumerates none (§34). This file is the negative that keeps the gate SHUT for
// a name the core has never heard of.
//
// The failure it guards against is silent and OPEN, which is why it is worth a
// file: an unrecognised capability collapses to `never`, `CarrierGuard<never,
// HostCaps>` is `unknown`, the brand disappears from the intersection, and the
// scope mounts ANYWHERE — in the one mechanism whose whole job is to make a bad
// mount impossible.

// A third-party extension, written the way `./extensions/*` are but coining a
// capability @lntt/scope does not know. The runtime is irrelevant here — the
// declaration is the subject.
interface SocketExtension extends ScopeExtension {
  readonly __ctx?: { readonly socket: { send(data: string): void } }
  readonly __caps?: { readonly websocket: true }
}
declare const websocket: SocketExtension

// Two mounts standing in for two hosts, written exactly as an adapter writes one
// (`packages/integration/src/*.ts`): `Handler<…, Cap>` is what makes `Cap`
// inferable, and the guard is the only other clause.
declare const httpMount: <Need extends object, S extends StandardSchemaV1, R, Cap extends Capability>(
  h: Handler<Need, S, R, Cap> & CarrierGuard<Cap, 'body' | 'cookies' | 'headers'>,
) => void

declare const socketMount: <Need extends object, S extends StandardSchemaV1, R, Cap extends Capability>(
  h: Handler<Need, S, R, Cap> & CarrierGuard<Cap, 'body' | 'cookies' | 'headers' | 'websocket'>,
) => void

declare const bodylessMount: <Need extends object, S extends StandardSchemaV1, R, Cap extends Capability>(
  h: Handler<Need, S, R, Cap> & CarrierGuard<Cap, 'cookies'>,
) => void

// The same shape as `bodylessMount`, kept separate so the named-type-argument
// cases below read against a carrier that plainly lacks `body`.
declare const httpMountCookiesOnly: <
  Need extends object,
  S extends StandardSchemaV1,
  R,
  Cap extends Capability,
>(
  h: Handler<Need, S, R, Cap> & CarrierGuard<Cap, 'cookies'>,
) => void

// Reads the capability parameter back off a built handler, which is the axis
// under test — `never` here is the failure, not a detail.
type CapOf<H> = H extends Handler<any, any, any, infer C, any> ? C : never

const socketScope = scope()
  .extend(websocket)
  .handle((_deps: {}, ctx) => {
    ctx.socket.send('hi')
    return { ok: true }
  })

const bodyScope = scope()
  .extend(body)
  .body({} as StandardSchemaV1<unknown, { title: string }>)
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
// mount anyone writes — and it has to hold when they are NAMED too. `Cap` lives
// only in a phantom (`__cap`), so unlike `Need`, which is a real field and
// contradicts a lie structurally, nothing else in `Handler` objects if a caller
// declares a capability the scope does not have. `__cap` puts `Cap` in both
// positions to make it invariant, which is what refuses the assignment (§34).
describe('a mount that names its type arguments', () => {
  it('cannot declare away a capability the scope requires', () => {
    // @ts-expect-error CarrierGuard: naming `never` does not shed the `body` requirement
    httpMountCookiesOnly<object, StandardSchemaV1, unknown, never>(bodyScope)
  })

  it('still takes a scope whose capability the carrier does provide', () => {
    httpMount<object, StandardSchemaV1, unknown, 'body'>(bodyScope)
  })
})
