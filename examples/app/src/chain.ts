import { bind, lunette } from '@lntt/wire'
import { createPost, getPost, makeRepo, publishPost } from './posts.ts'

// The composition root: one chain, one repo, one exposed surface. Every
// host entry builds THIS chain once and hands its public surface to whatever
// mount that host ships.
export const chain = lunette()
  .provide('repo', () => makeRepo())
  .expose('posts', (ctx) => bind({ getPost, createPost, publishPost })(ctx.repo))
