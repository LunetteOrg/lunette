import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseEnv } from '../config/env.ts'
import { createServer } from './express.ts'

const env = parseEnv({})

describe('raw Express boundary actually serves the chain over HTTP', () => {
  let baseUrl: string
  let stop: () => Promise<void>

  beforeAll(async () => {
    const { server, dispose } = await createServer(env)
    const listening = server.listen(0)
    await new Promise<void>((resolve) => listening.once('listening', resolve))
    const { port } = listening.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${port}`
    stop = async () => {
      await new Promise<void>((resolve) => listening.close(() => resolve()))
      await dispose()
    }
  })

  afterAll(async () => {
    await stop()
  })

  it('GET /feed serves the public surface (empty feed, 200)', async () => {
    const res = await fetch(`${baseUrl}/feed`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('POST /posts maps a returned domain error to 4xx', async () => {
    const res = await fetch(`${baseUrl}/posts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ authorId: 'u1', title: '', body: 'b', status: 'published' }),
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'PostTitleRequired' })
  })
})
