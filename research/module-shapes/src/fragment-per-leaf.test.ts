import { lunette } from '@lntt/wire'
import { fake } from '@lntt/wire/testing'
import { describe, expect, it } from 'vitest'
import { memInfra, type Post, type PostRepository } from './domain.ts'
import { publishPostFragment } from './fragment-per-leaf.ts'

describe('a per-leaf fragment', () => {
  it('standalone: every dep is a seed — the substitution question is moot', async () => {
    const created: Post[] = []
    await publishPostFragment.run(
      {
        postRepo: fake<Pick<PostRepository, 'create'>>({
          create: async (post) => {
            created.push(post)
            return post
          },
        }),
        generateId: () => 'id-9',
      },
      async (app) => {
        await app.publishPost({ authorId: 'u1', title: 'T', body: 'B' })
      },
    )
    expect(created).toEqual([{ id: 'id-9', authorId: 'u1', title: 'T', body: 'B' }])
  })

  it('mounted: the host pays one mount per leaf', async () => {
    const infra = memInfra()
    const host = lunette<{ postRepo: PostRepository; generateId: () => string }>()
      .expose(publishPostFragment)

    await host.run(
      { postRepo: infra.postRepo, generateId: infra.generateId },
      async (app) => {
        const post = await app.publishPost({ authorId: 'u1', title: 'T', body: 'B' })
        expect(post.id).toBe('id-1')
        expect(await infra.postRepo.list()).toHaveLength(1)
      },
    )
  })
})
