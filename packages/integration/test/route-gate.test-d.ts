// The ROUTE gate — pattern vs `.params()` schema, on the two hosts that have
// a pattern to check (Hono's own `ParamKeys`, Express's own
// `RouteParameters` — WE WRITE NO PARSER, § the route gate). Both directions
// of a mismatch are rejected, on both hosts; each framework's OWN reader
// resolves a wildcard/optional-group pattern to its REAL param set (Hono's
// anonymous `/*` names nothing, Express's named `*rest`/`{/:id}` both do) —
// the ONLY thing this gate has no opinion on is a pattern it cannot read AT
// ALL: a NON-LITERAL path. Catching less is fine, rejecting a valid route is
// not.

import express from 'express'
import { describe, it } from 'vitest'
import { z } from 'zod'
import { http } from '@lntt/scope/http'
import { scope } from '@lntt/scope'
import { chain } from './fixture/chain.ts'
import { hono } from '../src/hono.ts'
import { express as expressPack } from '../src/express.ts'

const idSchema = z.object({ id: z.string() })
const restSchema = z.object({ rest: z.string() })
const idLeaf = scope()
  .extend(http)
  .params(idSchema)
  .handle((_deps: {}, ctx) => ({ id: ctx.params.id }))
const restLeaf = scope()
  .extend(http)
  .params(restSchema)
  .handle((_deps: {}, ctx) => ({ rest: ctx.params.rest }))
const emptyLeaf = scope()
  .extend(http)
  .params(z.object({}))
  .handle(() => ({ ok: true }))

const w = hono(chain, () => ({ env: { label: 'x' } }))
const ex = expressPack(chain, () => ({ env: { label: 'x' } }))
const app: express.Express = express()

describe('Hono — the route pattern vs the schema, both directions', () => {
  it('accepts a pattern that names exactly the schema’s keys', () => {
    w.handler('/posts/:id', idLeaf)
  })

  it('rejects a route with a param the schema does not declare', () => {
    // @ts-expect-error the schema declares a param this route does not have: id
    w.handler('/posts', idLeaf)
  })

  it('rejects a schema that declares a param the route does not have', () => {
    // @ts-expect-error this route has a param the schema does not declare: id
    w.handler('/posts/:id', emptyLeaf)
  })

  it('accepts Hono’s own optional-param syntax, `?` stripped before comparing', () => {
    w.handler('/posts/:id?', idLeaf)
  })

  // Hono's `ParamKeys` resolves an anonymous `/*` to NO named param — a
  // REAL answer (not an unreadable one), so this is an ordinary mismatch,
  // not a case the gate has no opinion on.
  it('a bare wildcard names nothing — an empty-schema route accepts, id does not', () => {
    w.handler('/posts/*', emptyLeaf)
    // @ts-expect-error the schema declares a param this route does not have: id
    w.handler('/posts/*', idLeaf)
  })

  it('has NO OPINION on a non-literal path (built from a variable) — unreadable, not zero params', () => {
    const dynamic: string = '/posts/:id'
    w.handler(dynamic, idLeaf)
    w.handler(dynamic, emptyLeaf)
  })
})

describe('Express — the route pattern vs the schema, both directions', () => {
  it('accepts a pattern that names exactly the schema’s keys', () => {
    app.get(...ex.handler('/posts/:id', idLeaf))
  })

  it('rejects a route with a param the schema does not declare', () => {
    // @ts-expect-error the schema declares a param this route does not have: id
    ex.handler('/posts', idLeaf)
  })

  it('rejects a schema that declares a param the route does not have', () => {
    // @ts-expect-error this route has a param the schema does not declare: id
    ex.handler('/posts/:id', emptyLeaf)
  })

  // Express 5's `RouteParameters` resolves `{/:id}` to a REAL `id` key
  // (understands the optional group — beats a hand-rolled parser, which had
  // to bail out here).
  it('understands the optional group `{/:id}` — a real param, checked like any other', () => {
    ex.handler('/posts{/:id}', idLeaf)
    // @ts-expect-error this route has a param the schema does not declare: id
    ex.handler('/posts{/:id}', emptyLeaf)
  })

  // Express 5's NAMED wildcard `*rest` resolves to a real `rest` key too.
  it('understands the named wildcard `*rest` — a real param, checked like any other', () => {
    ex.handler('/posts/*rest', restLeaf)
    // @ts-expect-error this route has a param the schema does not declare: rest
    ex.handler('/posts/*rest', emptyLeaf)
  })

  it('has NO OPINION on a non-literal path (built from a variable) — unreadable, not zero params', () => {
    const dynamic: string = '/posts/:id'
    ex.handler(dynamic, idLeaf)
    ex.handler(dynamic, emptyLeaf)
  })
})
