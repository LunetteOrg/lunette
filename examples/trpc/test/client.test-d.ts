// The typed client survives the dedicated tRPC WRITE path. `publishPost` is a
// mutation whose INPUT is inferred from the RPC-shaped fragment's `.input`
// schema and whose OUTPUT is the leaf's R — the same end-to-end inference the
// read procedures get, now for a write.

import { expectTypeOf, it } from 'vitest'
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '../src/router.ts'

type Inputs = inferRouterInputs<AppRouter>
type Outputs = inferRouterOutputs<AppRouter>

it('infers the publishPost mutation input (payload) and output (the created post)', () => {
  // input from `.input`: title/body required, status optional
  expectTypeOf<Inputs['publishPost']>().toMatchTypeOf<{ title: string; body: string }>()
  // output from the leaf R
  expectTypeOf<Outputs['publishPost']>().toMatchTypeOf<{ post: { id: string; title: string } }>()
})

it('infers the comment and setPreference mutations end to end', () => {
  expectTypeOf<Inputs['comment']>().toMatchTypeOf<{ postId: string; body: string }>()
  expectTypeOf<Outputs['comment']>().toMatchTypeOf<{ comment: { id: string; body: string } }>()
  expectTypeOf<Inputs['setPreference']>().toMatchTypeOf<{ surface: string }>()
  expectTypeOf<Outputs['setPreference']>().toMatchTypeOf<{ locale: string | null }>()
})
