import { hc } from 'hono/client'
import type { InferRequestType, InferResponseType } from 'hono/client'
import { describe, expectTypeOf, it } from 'vitest'
import type { AppType } from '../src/server.ts'

// The payoff of mounting on Hono natively: a typed RPC client. `hc<AppType>()`
// infers each route's params and its JSON response from the fragments — no
// duplicated client types, no codegen.
describe('hc<AppType>() — the typed client survives the mount', () => {
  it('infers the /posts/:postId param and its response shape', () => {
    const call = hc<AppType>('http://localhost').posts[':postId'].$get
    expectTypeOf<InferRequestType<typeof call>>().toMatchTypeOf<{ param: { postId: string } }>()
    expectTypeOf<InferResponseType<typeof call, 200>>().toMatchTypeOf<{
      post: { id: string; title: string }
    }>()
  })

  it('infers the /feed response shape', () => {
    const call = hc<AppType>('http://localhost').feed.$get
    expectTypeOf<InferResponseType<typeof call, 200>>().toMatchTypeOf<{ signedIn: boolean }>()
  })
})
