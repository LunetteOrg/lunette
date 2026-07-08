// LOAD-BEARING RPC PROOF for the Hono host: assembling `courseHandler` through
// the real `hono` pack with NATIVE chaining preserves `hc<typeof app>()` fully
// typed — the request INPUT (validated param, from the fragment's schema) and
// the response OUTPUT@200 (the leaf's R via `c.json`), both exact, not
// `unknown`. If this file stops compiling, the pack has lost RPC.

import { Hono } from 'hono'
import { hc } from 'hono/client'
import type { InferRequestType, InferResponseType } from 'hono/client'
import { describe, expectTypeOf, it } from 'vitest'
import { chain, type Env } from '../chain.ts'
import { courseHandler } from '../example.ts'
import { hono, type WireEnv } from './hono.ts'

type Pub = Awaited<ReturnType<typeof chain.build>>['app']

const w = hono(chain, () => ({ env: {} as Env }))

// The whole point: the route is built with Hono's own chaining + a native
// validator fed by the fragment's schema (via `wire`). `typeof app` therefore
// carries the accumulated route schema that `hc` reads.
const app = new Hono<WireEnv<Pub>>()
  .use(w.mount())
  .get('/courses/:courseId', ...w.wire(courseHandler))

export type AppType = typeof app

describe('Hono RPC preservation — hc<typeof app>() is fully typed', () => {
  it('recovers the request INPUT from the fragment schema', () => {
    const call = hc<AppType>('http://localhost').courses[':courseId'].$get
    expectTypeOf<InferRequestType<typeof call>>().toEqualTypeOf<{ param: { courseId: string } }>()
  })

  it('recovers the response OUTPUT@200 as the leaf R (via c.json), not unknown', () => {
    const call = hc<AppType>('http://localhost').courses[':courseId'].$get
    expectTypeOf<InferResponseType<typeof call, 200>>().toEqualTypeOf<{
      id: string
      title: string
    }>()
    // load-bearing perturbation: 200 is NOT `unknown`
    expectTypeOf<InferResponseType<typeof call, 200>>().not.toEqualTypeOf<unknown>()
  })
})
