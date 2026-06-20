import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { connect, type Db } from '../client.ts'
import { migrate } from '../migrate.ts'
import { commentRepo } from './comment.repo.ts'
import { otpRepo } from './otp.repo.ts'
import { postRepo } from './post.repo.ts'
import { renderCacheRepo } from './render-cache.repo.ts'
import { sessionRepo } from './session.repo.ts'
import { userRepo } from './user.repo.ts'

describe('repos (real Drizzle against PGlite)', () => {
  let db: Db
  let close: () => Promise<void>

  beforeAll(async () => {
    const handle = connect('memory://')
    db = handle.db
    close = handle.close
    await migrate(db)
  })

  afterAll(async () => {
    await close()
  })

  it('users: create / findByEmail / findByIds / update', async () => {
    const repo = userRepo({ db })
    const created = await repo.create({ id: 'u1', email: 'a@b.c', termsAccepted: true })
    expect(created.email).toBe('a@b.c')
    expect((await repo.findByEmail('a@b.c'))?.id).toBe('u1')
    expect((await repo.findByIds(['u1', 'nope'])).length).toBe(1)
    expect((await repo.update('u1', { locale: 'it' })).locale).toBe('it')
  })

  it('posts + comments: counts batch by post', async () => {
    await userRepo({ db }).create({ id: 'u2', email: 'p@b.c', termsAccepted: true })
    await postRepo({ db }).create({
      id: 'p1', authorId: 'u2', title: 'T', body: 'B', origFormat: 'md', status: 'published', createdAt: new Date(),
    })
    const comments = commentRepo({ db })
    await comments.create({ id: 'c1', postId: 'p1', authorId: 'u2', parentId: null, body: 'x', origFormat: 'md', createdAt: new Date() })
    await comments.create({ id: 'c2', postId: 'p1', authorId: 'u2', parentId: null, body: 'y', origFormat: 'md', createdAt: new Date() })
    const counts = await comments.countByPosts(['p1'])
    expect(counts.get('p1')).toBe(2)
    expect((await postRepo({ db }).listPublished()).length).toBeGreaterThanOrEqual(1)
  })

  it('render cache: upsert / get / getMany', async () => {
    const cache = renderCacheRepo({ db })
    await cache.upsert({ contentType: 'post-body', contentId: 'p1', surface: 'web', output: '<p>hi</p>', source: 'lazy' })
    expect(await cache.get({ contentType: 'post-body', contentId: 'p1', surface: 'web' })).toBe('<p>hi</p>')
    const many = await cache.getMany([
      { contentType: 'post-body', contentId: 'p1', surface: 'web' },
      { contentType: 'post-body', contentId: 'p1', surface: 'feed' },
    ])
    expect(many.get('post-body:p1:web')).toBe('<p>hi</p>')
    expect(many.has('post-body:p1:feed')).toBe(false)
  })

  it('the SAME repo factory runs against a tx handle (the window swap)', async () => {
    await otpRepo({ db }).upsert({ email: 't@x.z', codeHash: 'h', nonce: 'n', expiresAt: new Date(Date.now() + 60_000) })
    // Rebuild the repo bound to tx — exactly what within(db.transaction, …) does.
    await db.transaction(async (tx) => {
      await otpRepo({ db: tx }).incrementAttempts('t@x.z')
    })
    const sessions = sessionRepo({ db })
    await sessions.create({ id: 's1', userId: 'u1', expiresAt: new Date(Date.now() + 60_000) })
    expect((await sessions.findById('s1'))?.userId).toBe('u1')
    const after = await otpRepo({ db }).findForUpdate('t@x.z')
    expect(after?.attempts).toBe(1)
  })
})
