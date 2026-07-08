import { hc } from 'hono/client'
import type { InferRequestType, InferResponseType } from 'hono/client'
import { expectTypeOf, test } from 'vitest'
import type { AppType } from '../src/hono.ts'

// The load-bearing proof of the Hono host: `hc<typeof app>()` stays fully typed
// end to end. Native Hono chaining records `ToSchema<M, P, I.in, R>`, so the
// client reconstructs the route's INPUT (the validated param) and its OUTPUT
// (the leaf's R at status 200).
test('hc<AppType>() carries the typed input and output', () => {
  const client = hc<AppType>('http://localhost')

  const call = client.courses[':courseId'].$get

  // INPUT: the RPC input the typed client reconstructs — `{ param: { courseId } }`.
  type Req = InferRequestType<typeof call>
  expectTypeOf<Req>().toMatchTypeOf<{ param: { courseId: string } }>()

  // OUTPUT@200: the leaf's R flows into the RPC output, PURE (no abort union).
  type Res = InferResponseType<typeof call, 200>
  expectTypeOf<Res>().toEqualTypeOf<{ id: string; title: string }>()
})
