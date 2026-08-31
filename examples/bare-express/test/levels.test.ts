import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Express } from 'express'
import { describe, expect, it } from 'vitest'
import { makeApp as chainOnly } from '../src/level-1-chain-only.ts'
import { makeApp as withScopes } from '../src/level-2-scopes.ts'

// Adopting lunette one layer at a time, both levels driven over a real socket.
// The two servers answer the same reads identically — the chain is the same —
// and level two adds what level one has no answer for.
const start = async (app: Express) => {
  const server = createServer(app)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://localhost:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

describe('level one — the chain alone', () => {
  it('serves the composed app from ordinary Express handlers', async () => {
    const { url, close } = await start(chainOnly())

    const list = await fetch(`${url}/notes`)
    expect(list.status).toBe(200)
    expect(await list.json()).toEqual({ notes: [{ id: 'n1', text: 'the first note' }] })

    expect((await fetch(`${url}/notes/n1`)).status).toBe(200)
    expect((await fetch(`${url}/notes/nope`)).status).toBe(404)

    await close()
  })
})

describe('level two — scopes, with no adapter package', () => {
  it('answers the reads exactly as level one does', async () => {
    const { url, close } = await start(withScopes())

    const list = await fetch(`${url}/notes`)
    expect(await list.json()).toEqual({ notes: [{ id: 'n1', text: 'the first note' }] })
    expect((await fetch(`${url}/notes/n1`)).status).toBe(200)

    await close()
  })

  it('renders a RETURNED abort, body and all', async () => {
    const { url, close } = await start(withScopes())

    const missing = await fetch(`${url}/notes/nope`)
    expect(missing.status).toBe(404)
    // level one could only send a bare 404; the scope carries WHAT was missing
    expect(await missing.json()).toEqual({ missing: 'nope' })

    await close()
  })

  it('validates the input the schema declares, without a line of parsing', async () => {
    const { url, close } = await start(withScopes())

    // `noteId` must be at least 2 characters: a bad param is a RETURNED 422
    expect((await fetch(`${url}/notes/x`)).status).toBe(422)

    await close()
  })

  it('renders the cookie sink on a write', async () => {
    const { url, close } = await start(withScopes())

    const created = await fetch(`${url}/notes?text=written%20by%20a%20scope`, { method: 'POST' })
    expect(created.status).toBe(200)
    expect(created.headers.get('set-cookie')).toMatch(/^last-note=n\d+; Path=\/; HttpOnly$/)

    await close()
  })
})

describe('the claim itself', () => {
  it('depends on no adapter package', () => {
    // The point of this example is what it does NOT need. Asserted against the
    // manifest and the sources rather than stated in a comment.
    const manifest = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { dependencies: Record<string, string>; devDependencies: Record<string, string> }

    expect(Object.keys(manifest.dependencies)).toEqual(['@lntt/scope', '@lntt/wire'])
    expect(Object.keys(manifest.devDependencies)).not.toContain('@lntt/integration')

    // IMPORTS, not mentions: the comments name the package to explain what is
    // being avoided, and that must not trip the check.
    for (const file of ['level-1-chain-only.ts', 'level-2-scopes.ts', 'bootstrap.ts']) {
      const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')
      expect(source).not.toMatch(/from ['"]@lntt\/integration/)
    }
  })
})
