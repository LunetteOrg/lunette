import { describe, expect, it } from 'vitest'
import { chain } from './chain.ts'

describe('the shared chain, with no host at all', () => {
  it('finds a seeded post', async () => {
    await chain.run(async (app) => {
      expect(app.posts.getPost('1')).toEqual({ id: '1', title: 'Hello', content: 'World', published: false })
    })
  })

  it('returns a domain value, not a throw, when the post is missing', async () => {
    await chain.run(async (app) => {
      expect(app.posts.getPost('missing')).toEqual({ notFound: true })
    })
  })

  it('creates and then finds a post', async () => {
    await chain.run(async (app) => {
      const created = app.posts.createPost({ title: 'New', content: 'Body' })
      expect(app.posts.getPost(created.id)).toEqual(created)
    })
  })

  it('publishing an unknown post returns notFound, not a throw', async () => {
    await chain.run(async (app) => {
      expect(app.posts.publishPost('missing')).toEqual({ notFound: true })
    })
  })

  it('publishing a known post flips its published flag', async () => {
    await chain.run(async (app) => {
      const published = app.posts.publishPost('1')
      expect(published).toMatchObject({ id: '1', published: true })
    })
  })
})
