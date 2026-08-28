import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'
import * as admin from '../src/admin.ts'
import * as catalog from '../src/catalog.ts'
import { makeApp } from '../src/server.ts'

// Two products in one process, driven over a real socket. What this proves is
// that nothing leaks between them: not the app a handler reads, not the seed,
// not the lifecycle.
const start = async () => {
  const { app, dispose } = makeApp({
    catalog: { SOURCE: 'catalogue-db' },
    admin: { TOKEN: 'let-me-in' },
  })
  const server = createServer(app)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://localhost:${port}`,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await dispose()
    },
  }
}

describe('two chains on one Express app', () => {
  it('serves each route from ITS OWN chain', async () => {
    const { url, close } = await start()

    const items = await fetch(`${url}/items`)
    expect(items.status).toBe(200)
    expect(await items.json()).toEqual({
      items: [
        { id: 'a1', title: 'A catalogue item' },
        { id: 'a2', title: 'Another one' },
      ],
    })

    // the admin routes answer from the admin chain — different services entirely
    const audit = await fetch(`${url}/admin/audit`, {
      headers: { authorization: 'let-me-in' },
    })
    expect(audit.status).toBe(200)
    expect(await audit.json()).toEqual({ entries: [] })

    await close()
  })

  it("keeps each product's gate to itself", async () => {
    const { url, close } = await start()

    // the admin gate rejects without the admin token…
    expect((await fetch(`${url}/admin/audit`)).status).toBe(401)
    // …while the catalogue, which has no gate at all, serves anyone
    expect((await fetch(`${url}/items`)).status).toBe(200)

    await close()
  })

  it("runs each chain's own use case, with its own state", async () => {
    const { url, close } = await start()
    const auth = { headers: { authorization: 'let-me-in' } }

    await fetch(`${url}/admin/audit`, { method: 'POST', ...auth })
    const after = await fetch(`${url}/admin/audit`, auth)
    expect(await after.json()).toEqual({ entries: ['someone looked'] })

    // the catalogue is untouched by any of it
    const items = (await (await fetch(`${url}/items`)).json()) as { items: unknown[] }
    expect(items.items).toHaveLength(2)

    await close()
  })

  it('builds and disposes the two lifecycles independently', async () => {
    catalog.opened.length = 0
    catalog.closed.length = 0
    admin.opened.length = 0
    admin.closed.length = 0

    const { url, close } = await start()
    // lazily built: nothing is open until a request reaches each product
    expect(catalog.opened).toEqual([])
    expect(admin.opened).toEqual([])

    await fetch(`${url}/items`)
    expect(catalog.opened).toEqual(['catalogue-db'])
    expect(admin.opened).toEqual([]) // the admin chain was never needed

    await close()
    expect(catalog.closed).toEqual(['catalogue-db'])
    expect(admin.closed).toEqual([]) // never built, nothing to close
  })

  it('builds each chain ONCE, however many requests it serves', async () => {
    catalog.opened.length = 0
    const { url, close } = await start()

    await fetch(`${url}/items`)
    await fetch(`${url}/items/a1`)
    await fetch(`${url}/items`)
    expect(catalog.opened).toEqual(['catalogue-db'])

    await close()
  })

  it('renders an abort from whichever chain produced it', async () => {
    const { url, close } = await start()

    expect((await fetch(`${url}/items/nope`)).status).toBe(404) // catalogue's notFound
    expect((await fetch(`${url}/admin/audit`)).status).toBe(401) // admin's unauthorized

    await close()
  })
})
