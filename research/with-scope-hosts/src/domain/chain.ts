import { lunette, bind } from '@lntt/wire'
import { makeRepo, getPost, createPost, publishPost } from './posts.ts'

export const chain = lunette()
  .provide('repo', () => makeRepo())
  .expose('posts', (ctx) => bind({ getPost, createPost, publishPost })(ctx.repo))
