import { describe, expectTypeOf, it } from 'vitest'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { scope } from '@lntt/scope'
import { body } from '@lntt/scope/body'
import type { Capability, CarrierGuard, Handler } from '@lntt/scope'
import { feedScope, publishPostScope } from '@lntt/example-app'
import { route, type Route } from './server.ts'

// The two brands a host applies at its mount are @lntt/scope's, not the
// adapters': a hand-wired host keeps both by naming them in ONE signature. These
// are the negatives that prove they still bite with no @lntt/integration in the
// picture.
describe('the hand-wired mount keeps the core brands', () => {
  it('accepts a scope the chain satisfies, capabilities included', () => {
    expectTypeOf(route('POST', '/posts', publishPostScope)).toEqualTypeOf<Route>()
  })

  it('rejects a scope whose deps the chain does not expose', () => {
    const rogue = scope().guard((_deps: { notOnTheChain: string }) => ({})).handle(() => ({}))
    // @ts-expect-error DepGuard: `notOnTheChain` is not on the chain's public surface
    route('GET', '/rogue', rogue)
  })
})

// A carrier that cannot read a body — a bus, an RPC transport, any host whose
// request has no stream — declares the narrower capability set, and every
// body-reading scope stops compiling at ITS mount (§34). The gate is a property
// of the scope core, so it is available to any host that writes this one line.
declare const bodylessRoute: <
  Need extends object,
  S extends StandardSchemaV1,
  R,
  Cap extends Capability,
>(
  handler: Handler<Need, S, R, Cap> & CarrierGuard<Cap, 'cookies'>,
) => void

describe('a carrier declaring fewer capabilities', () => {
  it('still takes the scopes that need none', () => {
    bodylessRoute(feedScope)
  })

  it('rejects the body-reading write at the mount', () => {
    // @ts-expect-error CarrierGuard: this carrier provides no `body` capability
    bodylessRoute(publishPostScope)
  })

  it('rejects it whatever the scope is built from', () => {
    const reader = scope().extend(body).body({} as StandardSchemaV1<unknown, object>).handle(() => ({}))
    // @ts-expect-error CarrierGuard: `.body` carries the `body` capability
    bodylessRoute(reader)
  })
})
