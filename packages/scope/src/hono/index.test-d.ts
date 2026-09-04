import { Hono } from 'hono'
import { describe, expectTypeOf, it } from 'vitest'
import { scope } from '../index.ts'
import { hono } from './index.ts'

// THE TYPE CONTRACT for the route pattern. Hono's reader is softer than
// Express's: an undeclared param is not refused, it comes back
// `string | undefined` — so what is pinned here is the WEAKER claim, honestly.
//
// NOTHING HERE RUNS: a `*.test-d.ts` is typechecked and never executed.

const { route } = hono({})

describe('what the route pattern types', () => {
  it('names each param the pattern declares, as `string`', () => {
    new Hono().get(
      ...route('/posts/:id/by/:author', (carrier) =>
        scope(carrier).step(async (_app: {}, { c }) => {
          expectTypeOf(c.req.param('id')).toEqualTypeOf<string>()
          expectTypeOf(c.req.param('author')).toEqualTypeOf<string>()
          return c.text('')
        }),
      ),
    )
  })

  it('does not refuse an undeclared param, but hands back `string | undefined`', () => {
    route('/posts/:id', (carrier) =>
      scope(carrier).step(async (_app: {}, { c }) => {
        // @ts-expect-error — the pattern does not declare `author`, so it is
        // not a `string` and cannot be used as one without a check
        const author: string = c.req.param('author')
        return c.text(author)
      }),
    )
  })

  it('hands back the pair Hono itself takes, so the pattern is written once', () => {
    expectTypeOf(route('/posts/:id', (c) => scope(c).step(async (_a: {}, { c }) => c.text('')))[0])
      .toEqualTypeOf<'/posts/:id'>()
  })
})
