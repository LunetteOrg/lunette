import express, { type ErrorRequestHandler } from 'express'
import { chain } from '../bootstrap/chain.ts'
import type { Env } from '../config/env.ts'
import { isError } from '../lib/errors.ts'

// A SECOND host, raw Express, WITHOUT any wire dialect — the host-agnosticism
// proof. The same chain.build() yields the Pub once at startup; routes consume
// it directly. The error convention meets HTTP here, by hand: a RETURNED
// domain error → 4xx; a THROWN infrastructure error bubbles to the error
// middleware → 5xx. (This previews the request-scope discussion, story 2;
// pelion itself is RR7-only, so this boundary is validation extra, not part of
// the fidelity claim.)
export const createServer = async (env: Env) => {
  const { app: wired, dispose } = await chain.build({ env })
  const server = express()
  server.use(express.json())

  server.get('/feed', async (_req, res, next) => {
    try {
      res.json(await wired.threads.listFeed('feed'))
    } catch (error) {
      next(error)
    }
  })

  server.post('/posts', async (req, res, next) => {
    try {
      const result = await wired.threads.publishPost(req.body)
      if (isError(result)) {
        res.status(400).json({ error: result._tag }) // domain → 4xx
        return
      }
      res.status(201).json(result)
    } catch (error) {
      next(error) // infrastructure → 5xx
    }
  })

  const onError: ErrorRequestHandler = (_error, _req, res, _next) => {
    res.status(500).json({ error: 'infrastructure' })
  }
  server.use(onError)

  return { server, dispose }
}
