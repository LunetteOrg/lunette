// The same machinery ACTUALLY RUNNING, so the types are not the only evidence.
// Read this next to errors.test-d.ts: that file shows what does not compile,
// this one shows what the compiling half does on the wire.
import { describe, expect, it } from 'vitest'
import { route, toProcedure } from './mounts.ts'
import { RpcError } from './rpc.ts'
import { FakeRouter } from './router.ts'
import {
  createScopeWeb,
  loginScopeWeb,
  postScopeRpc,
  postScopeWeb,
  throttledScopeWeb,
} from './app.ts'

describe('the http carrier renders its own vocabulary', () => {
  const [path, handler] = route('/posts/:postId', postScopeWeb)

  it('the mount hands the framework back its own path, written once', () => {
    expect(path).toBe('/posts/:postId')
  })

  it('a plain value is a 200 with the domain value as the body', async () => {
    expect(await handler({ postId: '1' })).toEqual({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ post: { id: '1', title: 'hello' } }),
    })
  })

  it("the domain's PostNotFound became a 404 AT THE WIRING, not in the domain", async () => {
    const out = await handler({ postId: 'nope' })
    expect(out.status).toBe(404)
    expect(out.body).toBe(JSON.stringify({ error: 'PostNotFound' }))
  })

  it('a bad input is the THIRD outcome branch — 422 chosen by the codec', async () => {
    const out = await handler({ postId: '' })
    expect(out.status).toBe(422)
    expect(JSON.parse(out.body ?? '{}')).toEqual({
      issues: [{ path: ['postId'], message: 'expected a non-empty string' }],
    })
  })

  it('json(value, 201) puts a success status on the ok branch', async () => {
    const out = await route('/posts/:postId', createScopeWeb)[1]({ postId: '7' })
    expect(out.status).toBe(201)
    expect(out.body).toBe(JSON.stringify({ created: '7' }))
  })

  it('redirect is a RETURNED value that becomes a Location header', async () => {
    const out = await route('/posts/:postId', loginScopeWeb)[1]({ postId: 'x' })
    expect(out).toEqual({ status: 302, headers: { location: '/login' }, body: null })
  })

  it('one guard returning TWO different intents keeps both', async () => {
    const t = route('/posts/:postId', throttledScopeWeb)[1]
    expect((await t({ postId: 'banned' })).status).toBe(403)
    expect((await t({ postId: 'slow' })).status).toBe(429)
    expect((await t({ postId: 'ok' })).status).toBe(200)
  })
})

describe('the rpc carrier renders its own', () => {
  const procedure = toProcedure(postScopeRpc)

  it('returns the value on the happy path', async () => {
    await expect(procedure({ postId: '1' })).resolves.toEqual({
      post: { id: '1', title: 'hello' },
    })
  })

  it('turns a RETURNED abort into a THROWN error — the one translation point', async () => {
    await expect(procedure({ postId: 'nope' })).rejects.toThrow(
      new RpcError('NOT_FOUND', 'no such post'),
    )
  })

  it('renders the same third branch as its own code, never as a 422', async () => {
    await expect(procedure({ postId: '' })).rejects.toMatchObject({
      code: 'UNPROCESSABLE_CONTENT',
    })
  })
})

describe('the mount spreads into the framework, so the pattern is written once', () => {
  // This is the gesture the route gate exists for. The pattern appears exactly
  // here: the framework gets it to match with, the gate got it to check.
  const app = new FakeRouter()
    .get(...route('/posts/:postId', postScopeWeb))
    .get(...route('/posts/:postId/created', createScopeWeb))

  it('registers under the paths it was given', () => {
    expect(app.registered).toEqual(['/posts/:postId', '/posts/:postId/created'])
  })

  it('serves through them, with the framework supplying the params', async () => {
    const found = await app.dispatch('/posts/:postId', { postId: '1' })
    expect(found.status).toBe(200)
    expect(found.body).toBe(JSON.stringify({ post: { id: '1', title: 'hello' } }))

    const missing = await app.dispatch('/posts/:postId', { postId: 'nope' })
    expect(missing.status).toBe(404)
  })
})
