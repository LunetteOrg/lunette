import { describe, expectTypeOf, it } from 'vitest'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { RequestHandler } from 'express'
import { scope } from '@lntt/scope'
import { body } from '@lntt/scope/body'
import type { Capability, CarrierGuard, Handler } from '@lntt/scope'
import { feedScope, publishPostScope } from '@lntt/example-app'
import { makeHandler } from './server-manual.ts'

// The two brands the hand-wired mount applies are @lntt/scope's, not the
// adapters': a host that writes its own `handler` keeps them by naming them in
// ONE signature. These are the negatives that prove they still bite with
// nothing from @lntt/integration in the picture.
const { handler } = makeHandler()

describe('the hand-wired mount', () => {
  it('takes a scope the chain satisfies, capabilities included', () => {
    expectTypeOf(handler(publishPostScope)).toEqualTypeOf<RequestHandler>()
  })

  it('rejects a scope whose deps the chain does not expose', () => {
    const rogue = scope().guard((_deps: { notOnTheChain: string }) => ({})).handle(() => ({}))
    // @ts-expect-error DepGuard: `notOnTheChain` is not on the chain's public surface
    handler(rogue)
  })
})

// A carrier that cannot read a body — a bus, an RPC transport, any host whose
// request has no stream — declares the narrower capability set, and every
// body-reading scope stops compiling at ITS mount (decision 34). The gate is a
// property of the scope core, so it is one line away for any host.
declare const bodylessMount: <
  Need extends object,
  S extends StandardSchemaV1,
  R,
  Cap extends Capability,
>(
  handler: Handler<Need, S, R, Cap> & CarrierGuard<Cap, 'cookies'>,
) => void

describe('a carrier declaring fewer capabilities', () => {
  it('still takes the scopes that need none', () => {
    bodylessMount(feedScope)
  })

  it('rejects the body-reading write at the mount', () => {
    // @ts-expect-error CarrierGuard: this carrier provides no `body` capability
    bodylessMount(publishPostScope)
  })

  it('rejects it whatever the scope is built from', () => {
    const reader = scope().extend(body).body({} as StandardSchemaV1<unknown, object>).handle(() => ({}))
    // @ts-expect-error CarrierGuard: `.body` carries the `body` capability
    bodylessMount(reader)
  })
})
