import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import express from 'express'
import { describe, expect, it } from 'vitest'
import { chain, type Env } from '../chain.ts'
import { courseHandler, loginHandler } from '../example.ts'
import { express as expressPack } from './express.ts'

const startServer = async (handler: express.Express) => {
  const server = createServer(handler)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://localhost:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

describe('Express pack — mount middleware + real HTTP round-trip', () => {
  it('runs the same handlers behind a real express server', async () => {
    const pack = expressPack(chain, () => ({ env: { label: 'express' } satisfies Env }))

    const app = express()
    // mount is registered ONCE; it ensures the build and attaches the app.
    app.use(pack.mount())
    pack
      .route(app)
      .get('/courses/:courseId', courseHandler)
      .post('/login', loginHandler)
    const { url, close } = await startServer(app)

    const auth = { headers: { authorization: 'Bearer u-admin' } }

    const ok = await fetch(`${url}/courses/c1`, auth)
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ id: 'c1', title: 'Owned by admin' })

    const forbidden = await fetch(`${url}/courses/c2`, auth)
    expect(forbidden.status).toBe(403)

    const anon = await fetch(`${url}/courses/c1`)
    expect(anon.status).toBe(401)

    const login = await fetch(`${url}/login`, { method: 'POST', redirect: 'manual' })
    expect(login.status).toBe(302)
    expect(login.headers.get('location')).toBe('/dashboard')
    expect(login.headers.get('set-cookie')).toContain('sid=u-admin')
    expect(login.headers.get('set-cookie')).toContain('HttpOnly')

    await close()
    await pack.dispose()
  })
})
