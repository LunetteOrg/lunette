import express from 'express'
import { express as expressPack } from '@lntt/integration/express'
import { chain, type Env } from './chain.ts'
import { courseHandler, loginHandler } from './handlers.ts'

// The Express pack takes the CHAIN and owns build-once. Node has no per-request
// env — the seed is static, so `seedFrom` takes no argument. `mount` is
// registered ONCE; `handler(frag)` returns a plain Express RequestHandler.
const pack = expressPack(chain, () => ({ env: { label: 'express' } satisfies Env }))

export const app = express()
app.use(pack.mount())
app.get('/courses/:courseId', pack.handler(courseHandler))
app.post('/login', pack.handler(loginHandler))

export const dispose = pack.dispose
