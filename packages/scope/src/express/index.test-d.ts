import expressLib from 'express'
import { describe, expectTypeOf, it } from 'vitest'
import { scope } from '../index.ts'
import { express } from './index.ts'

// THE TYPE CONTRACT for the route pattern: the params a step reads come from
// the pattern the mount was given, so the claim is only checkable here.
//
// NOTHING HERE RUNS: a `*.test-d.ts` is typechecked and never executed, and the
// refusals sit under `@ts-expect-error`.

const { route } = express({})

describe('what the route pattern types', () => {
  it('names each param the pattern declares, as `string`', () => {
    expressLib().get(
      ...route('/posts/:id/by/:author', (carrier) =>
        scope(carrier).step(async (_app: {}, { req, res }) => {
          expectTypeOf(req.params.id).toEqualTypeOf<string>()
          expectTypeOf(req.params.author).toEqualTypeOf<string>()
          return res.end()
        }),
      ),
    )
  })

  it('refuses a param the pattern does not declare', () => {
    route('/posts/:id', (carrier) =>
      // @ts-expect-error — `author` is not in this route's pattern
      scope(carrier).step(async (_app: {}, { req, res }) => res.json(req.params.author)),
    )
  })

  it('has NO OPINION on a pattern it cannot read: the params stay wide', () => {
    const dynamic: string = '/posts/:id'

    route(dynamic, (carrier) =>
      scope(carrier).step(async (_app: {}, { req, res }) => {
        // @ts-expect-error — a non-literal pattern yields Express's wide
        // dictionary, so a key read is `string | undefined`: catching less is
        // fine, claiming wrongly is not
        const id: string = req.params.id
        return res.json(id)
      }),
    )
  })

  it('hands back the pair Express itself takes, so the pattern is written once', () => {
    expectTypeOf(route('/posts/:id', (c) => scope(c).step(async (_a: {}, { res }) => res.end()))[0])
      .toEqualTypeOf<'/posts/:id'>()
  })
})
