import { Hono } from 'hono'
import { aboutScope, createScope, linkScope, listScope } from './chain.ts'
import { handler } from './bootstrap/from-host-env.ts'

// `server.ts` verbatim — the same route table, against the OTHER composition
// root. Kept as a whole file
// rather than parameterising the one next door: the two ways to reach the
// environment are the subject here, and a flag would hide exactly the line the
// reader came to compare.
const app = new Hono()
  .get('/links', ...handler(listScope))
  .get('/links/:slug', ...handler(linkScope))
  .get('/about', ...handler(aboutScope))
  .post('/links', ...handler(createScope))

export default app
