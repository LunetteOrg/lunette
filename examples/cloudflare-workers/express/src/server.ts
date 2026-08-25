import { httpServerHandler } from 'cloudflare:node'
import expressApp, { type Express } from 'express'
import { aboutScope, linkScope, listScope } from './chain.ts'
import { handler } from './bootstrap/index.ts'

// The MOUNT — the same route table as `examples/cloudflare-workers/hono`, on
// Express's native `app.get`, and the same shape as `examples/express` (§37).
// Nothing here is Workers-specific except the last two lines.
export const app: Express = expressApp()

app.get('/links', handler(listScope))
app.get('/links/:slug', handler(linkScope))
app.get('/about', handler(aboutScope))

// Cloudflare has supported node:http servers since August 2025: `app.listen`
// runs against an EMULATED server, and `httpServerHandler` turns the port it
// bound into the Worker's fetch handler. Both run at module scope — allowed,
// because neither performs real I/O; nothing is opened, a port is registered.
// (`test/module-scope.node.test.ts` is what turns "allowed" into something
// checked: it starts this worker for real.)
//
// This is the entire adaptation. The pack above it, and every scope under it,
// are the Node ones untouched.
const port = 8787
app.listen(port)

export default httpServerHandler({ port })
