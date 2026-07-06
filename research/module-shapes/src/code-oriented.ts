import { bind, lunette } from '@lntt/wire'
import type { PostRepository, RenderOne, UserRepository } from './domain.ts'
import { getAuthor, getPostForReading, listFeed, publishPost } from './use-cases.ts'

export type ThreadsSeed = {
  userRepo: UserRepository
  postRepo: PostRepository
  render: RenderOne
  generateId: () => string
}

// CONTROL specimen — the style the bootstrap-replica's threads module uses:
// one expose, a local const for the composition stage, an explicit deps
// slice per bind. Everything is in one callback; the wiring reads as code.
export const threadsCodeOriented = lunette<ThreadsSeed>().expose('threads', (ctx) => {
  const authors = bind({ getAuthor })({ userRepo: ctx.userRepo })
  return {
    ...authors,
    ...bind({ publishPost })({ postRepo: ctx.postRepo, generateId: ctx.generateId }),
    ...bind({ getPostForReading })({
      postRepo: ctx.postRepo,
      render: ctx.render,
      getAuthor: authors.getAuthor,
    }),
    ...bind({ listFeed })({ postRepo: ctx.postRepo, render: ctx.render }),
  }
})
