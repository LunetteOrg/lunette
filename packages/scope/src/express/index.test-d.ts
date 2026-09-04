import expressLib from 'express'
import { describe, expectTypeOf, it } from 'vitest'
import { scope } from '../index.ts'
import { express, expressCarrier } from './index.ts'

// THE TYPE CONTRACT for the params and the route gate. Both claims are
// type-level, so no runtime test could make them.
//
// NOTHING HERE RUNS: a `*.test-d.ts` is typechecked and never executed, and the
// refusals sit under `@ts-expect-error`.

const { route } = express({})

const byId = scope(expressCarrier<{ id: string }>()).step(async (_app: {}, { req, res }) => {
  expectTypeOf(req.params.id).toEqualTypeOf<string>()
  return res.json({ id: req.params.id })
})

// Nothing declared: the scope holds Express's own wide dictionary, so it names
// no param and mounts under any pattern (pinned below).
const wide = scope(expressCarrier()).step(async (_app: {}, { res }) => res.end())

describe('what a scope declares it reads', () => {
  it('types `req.params` by the carrier, with no annotation on the step', () => {
    // pinned by the `expectTypeOf` calls inside the two scopes above
    expectTypeOf(byId).toBeFunction()
  })
})

describe('`route(path, scope)`: what the scope READS against what the route SUPPLIES', () => {
  it('accepts a pattern that supplies what the scope reads', () => {
    expressLib().get(...route('/posts/:id', byId))
  })

  it('rejects a pattern that supplies a different param — the scope would read undefined', () => {
    // @ts-expect-error ⛔ this route does not supply a param the scope reads: id
    route('/posts/:postId', byId)
  })

  it('rejects a pattern that supplies none', () => {
    // @ts-expect-error ⛔ this route does not supply a param the scope reads: id
    route('/posts', byId)
  })

  it('ACCEPTS a route supplying more than the scope reads — a superset passes', () => {
    // the verdict `DepGuard` already gives the chain, applied to params: one
    // scope mounts under a nested route, or on a second pattern naming the same
    route('/tenants/:tenant/posts/:id', byId)
    route('/posts/:id', wide)
  })

  it('has NO OPINION on a pattern it cannot read', () => {
    const dynamic: string = '/posts/:id'
    route(dynamic, byId)
  })

  it('reads Express 5 syntax with Express\'s own reader: `{/:id}` supplies `id`', () => {
    route('/posts{/:id}', byId)
  })

  it('hands back the pattern as its literal, so the mount stays typed', () => {
    expectTypeOf(route('/posts/:id', byId)[0]).toEqualTypeOf<'/posts/:id'>()
  })
})

describe('`route(scope)`: the plain handler, with nothing checked', () => {
  it('is an Express handler, mountable anywhere', () => {
    // The pattern is Express's own argument here, so it never reaches a type of
    // ours and nothing compares it — including this, which is wrong and
    // compiles. `route(path, scope)` is the form that catches it.
    expressLib().get('/posts/:postId', route(byId))
  })
})
