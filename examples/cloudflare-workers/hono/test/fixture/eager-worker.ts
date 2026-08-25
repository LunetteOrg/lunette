import { Hono } from 'hono'
import { hono } from '@lntt/integration/hono'
import { chain, listScope } from '../../src/chain.ts'
import { hostEnv } from '../../src/config/env.ts'

// Deliberately WRONG, and the only thing in this package that is. It is
// `src/bootstrap/index.ts` with ONE change — the build moved out of the thunk
// and into module scope — so that `module-scope.node.test.ts` can assert the
// runtime refuses to start it. The store layer reads KV, and a KV read outside
// a request is disallowed I/O.
//
// On Node this same line works and laziness is a preference. Here it is the
// difference between a worker that serves and one that never boots.
export const built = await chain.build({ env: hostEnv() })

const pack = hono(chain, () => ({ env: hostEnv() }))

export default new Hono().get('/links', ...pack.handler(listScope))
