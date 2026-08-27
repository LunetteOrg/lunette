import { describe, it } from 'vitest'
import { createScope, linkScope } from './chain.ts'
import { handler } from './server.ts'

// The gate survives with no pack in the picture. `server.ts` names
// `DepGuard` and `CarrierGuard` itself, and its carrier declares `cookies` and
// `headers` but not `body` — nothing there reads a request body. So the write
// scope, which declares a `.body` channel, cannot be mounted on it (§34).
describe('the hand-written Workers mount', () => {
  it('takes the reads its carrier can serve', () => {
    handler(linkScope)
  })

  it('refuses the body-reading write its carrier cannot', () => {
    // @ts-expect-error CarrierGuard: this carrier provides no `body` capability
    handler(createScope)
  })
})
