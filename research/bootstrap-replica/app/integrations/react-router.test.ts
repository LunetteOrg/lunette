import { afterEach, describe, expect, it } from 'vitest'
import { parseEnv } from '../config/env.ts'
import { bootOnce, disposeApp, getLoadContext } from './react-router.ts'
import { feedLoader, loginAction } from './routes.ts'

const env = parseEnv({})

describe('RR7 getLoadContext recipe', () => {
  afterEach(async () => {
    await disposeApp()
  })

  it('memoizes the build promise (HMR-safe singleton)', async () => {
    const a = await bootOnce(env)
    const b = await bootOnce(env)
    expect(a).toBe(b) // same instance, not a second boot
  })

  it('loaders and actions see only the public surface', async () => {
    const context = await getLoadContext(env)

    const loaded = await feedLoader({ request: new Request('http://x'), context })
    expect(loaded.signedIn).toBe(false)
    expect(loaded.feed).toEqual([])

    const form = new FormData()
    form.set('email', 'not-an-email')
    const rejected = await loginAction({
      request: new Request('http://x', { method: 'POST', body: form }),
      context,
    })
    expect(rejected).toEqual({ error: 'invalid-email' })
  })
})
