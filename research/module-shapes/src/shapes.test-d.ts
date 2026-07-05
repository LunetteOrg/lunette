import { bind, lunette } from '@lntt/wire'
import { describe, expectTypeOf, it } from 'vitest'
import type { Author, Post, PostRepository } from './domain.ts'
import { threadsFluent } from './fluent.ts'
import { getPostForReading, listFeed } from './use-cases.ts'

describe('the fluent shape keeps the contract', () => {
  it('exact bound signatures survive the binder and .as()', () => {
    type App = Awaited<ReturnType<typeof threadsFluent.build>>['app']

    expectTypeOf<App['threads']['publishPost']>().toEqualTypeOf<
      (input: { authorId: string; title: string; body: string }) => Promise<Post>
    >()
    expectTypeOf<App['threads']['getAuthor']>().toEqualTypeOf<
      (id: string) => Promise<Author | null>
    >()
    // Nothing but the namespace crosses the boundary.
    expectTypeOf<keyof App>().toEqualTypeOf<'threads'>()
  })

  it('the binder surfaces the requirement check at the expose call', () => {
    // 'render' and 'getAuthor' are missing from this chain: the expose does
    // not compile — the binder's parameter is the intersection of the
    // leaves' deps, and the ctx cannot satisfy it. DX note (tsc 5.9
    // verbatim): the diagnostic is a TS2769 overload wall, but its final
    // drill-down line is exactly right —
    //   Type '{ postRepo: PostRepository; }' is missing the following
    //   properties from type '{ postRepo: ...; render: RenderOne;
    //   getAuthor: ... }': render, getAuthor
    const incomplete = lunette<{ postRepo: PostRepository }>()
    // @ts-expect-error — ctx does not satisfy the leaves' deps intersection
    incomplete.expose(bind({ getPostForReading, listFeed }))
  })
})
