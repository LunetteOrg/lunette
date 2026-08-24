import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Express } from 'express'
import { describe, expect, it } from 'vitest'
import { makeApp as adapterApp } from '../src/server.ts'
import { makeApp as manualApp } from '../src/server-manual.ts'

// The adapter-backed app and the hand-wired one, driven through the SAME
// requests, asserted to answer identically. This is what the guest posture
// (decision 33) claims and what the pair of files demonstrates: an adapter
// supplies build-once, the carrier and the outcome render; write those four
// sections yourself and the scopes behave exactly the same.
//
// Every response shape a scope can produce is covered below: a value, a 404 and
// a 401 abort, a 422 from the input schema, a redirect intent, and the cookie
// sink. Cookie VALUES are signed per instance (each app builds its own chain),
// so parity is asserted on the cookie names.
interface Snapshot {
  readonly status: number
  readonly location: string | null
  readonly cookies: readonly string[]
  readonly body: string
}

const start = async (app: Express) => {
  const server = createServer(app)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://localhost:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

const snapshot = async (res: Response): Promise<Snapshot> => ({
  status: res.status,
  location: res.headers.get('location'),
  cookies: (res.headers.getSetCookie?.() ?? []).map((c) => c.split('=')[0] ?? ''),
  body: await res.text(),
})

const drive = async (make: (env?: undefined) => Express): Promise<Snapshot[]> => {
  const { url, close } = await start(make())
  const invalid = new FormData()
  invalid.set('email', 'not-an-email')
  const valid = new FormData()
  valid.set('email', 'parity@example.com')

  const out = [
    // a leaf's value
    await fetch(`${url}/feed`),
    await fetch(`${url}/posts/nope/comments`),
    // the abort intents: 404 from a leaf, 401 from the session gate
    await fetch(`${url}/posts/does-not-exist`),
    await fetch(`${url}/me`),
    await fetch(`${url}/posts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'x', body: 'y' }),
    }),
    // the input schema's 422, then the `body` capability on a valid form
    await fetch(`${url}/login`, { method: 'POST', body: invalid }),
    await fetch(`${url}/login`, { method: 'POST', body: valid, redirect: 'manual' }),
    // a redirect intent carrying the cookie sink
    await fetch(`${url}/logout`, { method: 'POST', redirect: 'manual' }),
  ]

  const snapshots = []
  for (const res of out) snapshots.push(await snapshot(res))
  await close()
  return snapshots
}

describe('@lntt/integration/express vs the same app wired by hand', () => {
  it('answers identically on every response shape a scope can produce', async () => {
    const [viaAdapter, byHand] = await Promise.all([drive(adapterApp), drive(manualApp)])

    expect(byHand).toEqual(viaAdapter)
    // and the responses are the expected ones, not two matching mistakes
    expect(byHand.map((s) => s.status)).toEqual([200, 200, 404, 401, 401, 422, 200, 302])
    expect(byHand[6]?.cookies).toEqual(['pending-auth'])
    expect(byHand[7]).toMatchObject({ location: '/', cookies: ['session'] })
  })
})
