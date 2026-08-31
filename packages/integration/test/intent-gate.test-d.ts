// The MOUNT-side half of the intent gate (`IntentGuard`), proved against the
// REAL host packs rather than the model in `@lntt/scope`'s own
// `intent-vocabulary.test-d.ts`. Each host's supply set is written out by
// hand (§34): Hono/Express/RR7 render `@lntt/scope/http`'s whole vocabulary,
// tRPC renders only its own — so a scope built on the WRONG carrier's words
// is rejected at exactly one side, naming the intent it cannot render.

import { initTRPC } from '@trpc/server'
import { describe, it } from 'vitest'
import { z } from 'zod'
import { scope } from '@lntt/scope'
import { http, redirect } from '@lntt/scope/http'
import { forbidden as rpcForbidden, rpc } from '@lntt/scope/trpc'
import { chain, type App } from './fixture/chain.ts'
import { hono } from '../src/hono.ts'
import { toProcedure } from '../src/trpc.ts'

const empty = z.object({})

// An http-vocabulary scope — declares `redirect`, which tRPC has no channel
// for at all (an RPC reply has nowhere to go).
const redirecting = scope()
  .extend(http)
  .params(empty)
  .guard(() => redirect('/login'))
  .handle(() => ({ ok: true }))

describe('a scope built on http renders on Hono, not on tRPC', () => {
  it('mounts on Hono — it renders the whole http vocabulary', () => {
    const w = hono(chain, () => ({ env: { label: 'x' } }))
    w.handler('/login', redirecting)
  })

  it('is rejected at toProcedure, naming the intent it cannot render', () => {
    const t = initTRPC.context<App & { request: Request }>().create()
    // @ts-expect-error this host cannot render the intent: redirect
    toProcedure(t.procedure, redirecting)
  })
})

// The reverse: a scope built on tRPC's OWN vocabulary declares `code`, which
// no HTTP host renders — `@lntt/scope/http`'s hosts (Hono here) only ever
// claim `status | redirect | ok-status`.
const coded = scope()
  .extend(rpc)
  .input(empty)
  .guard(() => rpcForbidden())
  .handle(() => ({ ok: true }))

describe('a scope built on trpc renders on tRPC, not on Hono', () => {
  it('mounts at toProcedure — it renders its own vocabulary', () => {
    const t = initTRPC.context<App & { request: Request }>().create()
    toProcedure(t.procedure, coded)
  })

  it('is rejected on Hono, naming the intent it cannot render', () => {
    const w = hono(chain, () => ({ env: { label: 'x' } }))
    // @ts-expect-error this host cannot render the intent: code
    w.handler('/coded', coded)
  })
})
