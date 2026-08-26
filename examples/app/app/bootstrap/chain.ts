import { randomUUID } from 'node:crypto'
import { bind, lunette, type PubOf } from '@lntt/wire'
import type { Env } from '../config/env.ts'
import { withDb } from '../db/layer.ts'
import { commentRepo } from '../db/repos/comment.repo.ts'
import { otpRepo } from '../db/repos/otp.repo.ts'
import { postRepo } from '../db/repos/post.repo.ts'
import { noopRenderCache, renderCacheRepo } from '../db/repos/render-cache.repo.ts'
import { sessionRepo } from '../db/repos/session.repo.ts'
import { userRepo } from '../db/repos/user.repo.ts'
import { blobs } from '../lib/blobs/index.ts'
import { pendingCookie, sessionCookie } from '../lib/cookies.ts'
import { httpTransport } from '../lib/mailer/http.ts'
import { sendMail } from '../lib/mailer/index.ts'
import { loggingTransport } from '../lib/mailer/logging.ts'
import { outboxTransport } from '../lib/mailer/outbox.ts'
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
  // Public: the auth handlers need a nonce id at the login step (pending-auth
  // flow). The same generator the modules consume from Ctx, now on Pub too.
  .expose('generateId', () => () => randomUUID())
  .provide('otpRepo', otpRepo)
  .provide('userRepo', userRepo)
  .provide('sessionRepo', sessionRepo)
  // Feature-flagged, conditional birth: the DB-backed cache when RENDER_CACHE is
  // on, else a no-op cache — the DB repo is never even constructed when off.
  .provide('renderCache', ({ env, db }) =>
    env.RENDER_CACHE === 'on' ? renderCacheRepo({ db }) : noopRenderCache(),
  )
  .provide('postRepo', postRepo)
  .provide('commentRepo', commentRepo)
  // the mail split: adapters are one file each behind the Transport port;
  // the SELECTION POLICY lives here — the composition root is the file
  // whose job is choosing implementations (decision 29). The transport is
  // the KEYED resource (conditional birth, skippable: substituted in tests,
  // neither branch runs); the sending behaviour a bound leaf, private wiring.
  .provide('transport', ({ env }) =>
    env.MAILER_API_KEY
      ? httpTransport(env.MAILER_API_KEY)
      : env.DEV_MAIL_OUTBOX
        ? outboxTransport() // dev/e2e: capture sent mail in memory (DEV_MAIL_OUTBOX)
        : loggingTransport(),
  )
  .provide(bind({ sendMail }))
  .provide('renderer', renderer)
  .provide('blobs', blobs)
  // Public: the auth handlers read the pending cookie and set the session /
  // pending cookies through the scope CookieSink (signing stays in the helper).
  .expose('sessionCookie', sessionCookie)
  .expose('pendingCookie', pendingCookie)
  .use(renderModule) // private infrastructure scope: its Pub is wiring only
  .expose(accessModule) // public feature module
  .expose(profileModule)
  .expose(threadsModule)
  .expose('getSession', (ctx) => sessionReader(ctx.sessionCookie, ctx.sessionRepo))
  .expose('validateEmail', () => validateEmail)

// The chain's PUBLIC surface — what `build` delivers and what a scope's `deps`
// are checked against. `PubOf` ships from @lntt/wire for this: reaching for
// `Awaited<ReturnType<typeof chain.build>>['app']` spells out the same inference
// by hand, and a reader copying this file would carry the long form into theirs.
export type App = PubOf<typeof chain>
