import { describe, expectTypeOf, it } from 'vitest'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { CarrierGuard, Handler, ScopeExtension } from './index.ts'
import { scope } from './scope.ts'
import { body } from './extensions/body.ts'

// The capability alphabet is OPEN: an extension coins its own names and the core
// enumerates none (§34). This file is the negative that keeps the gate SHUT for
// a name the core has never heard of — which is exactly what used to fail.
//
// `Capability` was `'body' | 'cookies' | 'headers'`, and `CapsOf` filtered an
// extension's `__caps` through it. A third-party capability therefore became
// `never`; `CarrierGuard<never, HostCaps>` collapses to `unknown`; the brand
// vanished and the scope mounted ANYWHERE. A silent fail-OPEN in the one
// mechanism whose whole job is to make a bad mount impossible.

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
declare const httpMount: <Need extends object, S extends StandardSchemaV1, R, Cap extends string>(
  h: Handler<Need, S, R, Cap> & CarrierGuard<Cap, 'body' | 'cookies' | 'headers'>,
) => void

declare const socketMount: <Need extends object, S extends StandardSchemaV1, R, Cap extends string>(
  h: Handler<Need, S, R, Cap> & CarrierGuard<Cap, 'body' | 'cookies' | 'headers' | 'websocket'>,
) => void

declare const bodylessMount: <Need extends object, S extends StandardSchemaV1, R, Cap extends string>(
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
