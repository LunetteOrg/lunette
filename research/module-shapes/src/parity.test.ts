import { describe, expect, it } from 'vitest'
import { threadsCodeOriented } from './code-oriented.ts'
import { type Author, memInfra, type Post } from './domain.ts'
import { threadsFluent } from './fluent.ts'

// The two shapes must be interchangeable: same public surface, same
// behaviour. The scenario is written against the structural surface so the
// SAME code drives both modules.

type ThreadsSurface = {
  getAuthor: (id: string) => Promise<Author | null>
  publishPost: (input: { authorId: string; title: string; body: string }) => Promise<Post>
  getPostForReading: (
    id: string,
  ) => Promise<{ post: Post; body: string; authorName: string } | null>
  listFeed: () => Promise<Array<{ id: string; excerpt: string }>>
}

const scenario = async (threads: ThreadsSurface) => {
  const post = await threads.publishPost({ authorId: 'u1', title: 'Hello', body: 'World' })
  return {
    keys: Object.keys(threads).sort(),
    post,
    reading: await threads.getPostForReading(post.id),
    missing: await threads.getPostForReading('nope'),
    feed: await threads.listFeed(),
    author: await threads.getAuthor('u1'),
  }
}

describe('code-oriented vs fluent', () => {
  it('same surface, same behaviour, composition edge included', async () => {
    const a = await threadsCodeOriented.run(memInfra(), async (app) => scenario(app.threads))
    const b = await threadsFluent.run(memInfra(), async (app) => scenario(app.threads))

    expect(b).toEqual(a)

    // and the scenario itself is meaningful, not vacuous:
    expect(a.keys).toEqual(['getAuthor', 'getPostForReading', 'listFeed', 'publishPost'])
    expect(a.reading?.authorName).toBe('Writer') // through the injected getAuthor
    expect(a.reading?.body).toBe('[html] World') // through the injected render
    expect(a.missing).toBeNull()
    expect(a.feed).toEqual([{ id: 'id-1', excerpt: '[html] World' }])
  })
})
