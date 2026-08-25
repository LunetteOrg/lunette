import { httpServerHandler } from 'cloudflare:node'
import expressApp from 'express'
import { chain, listScope } from '../../src/chain.ts'
import { hostEnv } from '../../src/config/env.ts'
import { express } from '@lntt/integration/express'

// Deliberately WRONG, and the only thing in this package that is: this is
// `src/bootstrap/index.ts` + `src/server.ts` with ONE change — the build moved
// out of the thunk and into module scope. The store layer reads KV, and a KV
// read outside a request is disallowed I/O, so the runtime refuses to start it.
//
// Worth noting what this fixture ALSO shows by still being here: `app.listen`
// and `httpServerHandler` at module scope are fine. The refusal names the KV
// read, not the emulated server.
export const built = await chain.build({ env: hostEnv() })

const pack = express(chain, () => ({ env: hostEnv() }))
const app = expressApp()
app.get('/links', pack.handler(listScope))

const port = 8788
app.listen(port)

export default httpServerHandler({ port })
