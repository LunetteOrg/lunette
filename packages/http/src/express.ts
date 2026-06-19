// @lntt/http/express — two ways to use Express with a wire chain:
//
// 1. `expressEngine(options?)` — an Engine for the engine-agnostic
//    dialect (`@lntt/http`): it spins a real Node server on an ephemeral
//    port and bridges fetch-style Request/Response. The optional `setup`
//    hands you the naked Express app for native middleware.
//
// 2. `express(chain)` — the NATIVE dialect: the real Express app
//    (routers, the whole middleware ecosystem) wired with the chain's
//    deps by closure in the setup (and in `app.locals.deps` for whoever
//    wants them from a request handler). `run` opens a Node server on an
//    ephemeral port that lives as long as the scope.

import expressLib from 'express'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Lunette } from '@lntt/wire'
import type { Engine } from './index.ts'

type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never

export const expressEngine =
  (options: { setup?: (app: expressLib.Express) => void } = {}): Engine =>
  async (routes) => {
    const app = expressLib()
    app.use(expressLib.text({ type: '*/*' }))
    options.setup?.(app)

    for (const r of routes) {
      const method = r.method.toLowerCase() as Lowercase<typeof r.method>
      app[method](r.path, async (req, res) => {
        const init: RequestInit = {
          method: r.method,
          headers: req.headers as Record<string, string>,
        }
        if (typeof req.body === 'string' && req.body.length > 0) {
          init.body = req.body
        }
        const response = await r.handle(
          new Request(`http://express.local${req.originalUrl}`, init),
        )
        res.status(response.status)
        response.headers.forEach((value, key) => res.setHeader(key, value))
        res.send(Buffer.from(await response.arrayBuffer()))
      })
    }

    const server = createServer(app)
    await new Promise<void>((resolve) => server.listen(0, resolve))
    const port = (server.address() as AddressInfo).port

    return {
      fetch: async (req) => {
        const url = new URL(req.url)
        const init: RequestInit = { method: req.method, headers: req.headers }
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          init.body = await req.text()
        }
        return fetch(`http://127.0.0.1:${port}${url.pathname}${url.search}`, init)
      },
      close: () => new Promise((resolve) => server.close(() => resolve())),
    }
  }

export const express = <
  Ctx extends object,
  Pub extends object,
  Seed extends object,
>(
  chain: Lunette<Ctx, Pub, Seed>,
) => ({
  app(setup: (deps: Expand<Pub>, app: expressLib.Express) => void) {
    const runChain = chain.run.bind(chain) as (
      seed: Seed,
      scope: (pub: Expand<Pub>) => Promise<unknown>,
    ) => Promise<unknown>

    return {
      run: <T>(
        seed: Seed,
        scope: (server: {
          app: expressLib.Express
          url: string
          fetch: (req: Request) => Promise<Response>
        }) => T | Promise<T>,
      ): Promise<T> =>
        runChain(seed, async (pub) => {
          const app = expressLib()
          app.locals.deps = pub
          setup(pub, app)

          const server = createServer(app)
          await new Promise<void>((resolve) => server.listen(0, resolve))
          const port = (server.address() as AddressInfo).port
          const url = `http://127.0.0.1:${port}`

          try {
            return await scope({
              app,
              url,
              fetch: async (req) => {
                const target = new URL(req.url)
                const init: RequestInit = {
                  method: req.method,
                  headers: req.headers,
                }
                if (req.method !== 'GET' && req.method !== 'HEAD') {
                  init.body = await req.text()
                }
                return fetch(`${url}${target.pathname}${target.search}`, init)
              },
            })
          } finally {
            await new Promise<void>((resolve) => server.close(() => resolve()))
          }
        }) as Promise<T>,
    }
  },
})
