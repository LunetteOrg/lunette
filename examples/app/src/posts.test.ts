import { describe, expect, it } from 'vitest'
import { createPost, getPost, makeRepo, publishPost } from './posts.ts'

// PURE FUNCTIONS, no host, no chain: what the per-host entries' route tests
// exercise through a real mount is the WIRING, not this logic — this is
// where the logic itself is checked.
describe('the posts domain, with no host and no chain in the picture', () => {
  it('getPost: a known id, and a missing one', () => {
    const repo = makeRepo()
    expect(getPost(repo, '1')).toMatchObject({ id: '1', title: 'Hello' })
    expect(getPost(repo, 'nope')).toEqual({ notFound: true })
  })

  it('createPost: assigns an id and starts unpublished', () => {
    const repo = makeRepo()
    const post = createPost(repo, { title: 'New', content: 'Body' })
    expect(post).toMatchObject({ title: 'New', content: 'Body', published: false })
    expect(getPost(repo, post.id)).toEqual(post)
  })

  it('publishPost: flips a known post, and reports a missing one', () => {
    const repo = makeRepo()
    const published = publishPost(repo, '1')
    expect(published).toMatchObject({ id: '1', published: true })
    expect(publishPost(repo, 'nope')).toEqual({ notFound: true })
  })
})
