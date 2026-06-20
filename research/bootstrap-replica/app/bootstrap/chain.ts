import { randomUUID } from 'node:crypto'
import { lunette } from '@lntt/wire'
import type { Env } from '../config/env.ts'
import { withDb } from '../db/layer.ts'
import { commentRepo } from '../db/repos/comment.repo.ts'
import { otpRepo } from '../db/repos/otp.repo.ts'
import { postRepo } from '../db/repos/post.repo.ts'
import { renderCacheRepo } from '../db/repos/render-cache.repo.ts'
import { sessionRepo } from '../db/repos/session.repo.ts'
import { userRepo } from '../db/repos/user.repo.ts'
import { blobs } from '../lib/blobs/index.ts'
import { pendingCookie, sessionCookie } from '../lib/cookies.ts'
import { mailer } from '../lib/mailer/index.ts'
import { renderer } from '../lib/renderer/index.ts'
import { validateEmail } from '../lib/validate-email.ts'
import { accessModule } from '../modules/access.ts'
import { profileModule } from '../modules/profile.ts'
import { renderModule } from '../modules/render.ts'
import { threadsModule } from '../modules/threads.ts'
import { sessionReader } from './session-reader.ts'

// The whole composition root, dissolved into a chain. `createApp` becomes this:
// the explicit onion ONLY for the disposable (withDb); point-free keyed provide
// for every other resource; the render mini-app mounted PRIVATELY (use) as
// wiring; the three feature areas mounted PUBLICLY (expose). run/build deliver
// only the public surface — repos, services, db and the render leaves never
// reach a route.
export const chain = lunette<{ env: Env }>()
  .use(withDb)
  .provide('generateId', () => () => randomUUID())
  .provide('otpRepo', otpRepo)
  .provide('userRepo', userRepo)
  .provide('sessionRepo', sessionRepo)
  .provide('renderCache', renderCacheRepo)
  .provide('postRepo', postRepo)
  .provide('commentRepo', commentRepo)
  .provide('mailer', mailer)
  .provide('renderer', renderer)
  .provide('blobs', blobs)
  .provide('sessionCookie', sessionCookie)
  .provide('pendingCookie', pendingCookie)
  .use(renderModule) // private infrastructure fragment: its Pub is wiring only
  .expose(accessModule) // public feature module
  .expose(profileModule)
  .expose(threadsModule)
  .expose('getSession', (ctx) => sessionReader(ctx.sessionCookie, ctx.sessionRepo))
  .expose('validateEmail', () => validateEmail)

export type App = Awaited<ReturnType<typeof chain.build>>['app']
