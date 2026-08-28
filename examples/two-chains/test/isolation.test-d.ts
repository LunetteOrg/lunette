import { describe, it } from 'vitest'
import express from 'express'
import { express as pack } from '@lntt/integration/express'
import { adminChain, auditScope } from '../src/admin.ts'
import { catalogChain, listScope } from '../src/catalog.ts'

// The compile-time half of the isolation: each pack brands its mount with the
// public surface of ITS chain, so a scope cannot be served by the wrong product
// even though both are plain Express handlers of the same type.
const shop = pack(catalogChain, () => ({ env: { SOURCE: 'x' } }))
const back = pack(adminChain, () => ({ env: { TOKEN: 't' } }))

describe('a scope belongs to the chain that satisfies it', () => {
  it('mounts on its own pack', () => {
    const app = express()
    app.get(...shop.handler('/items', listScope))
    app.get(...back.handler('/admin/audit', auditScope))
  })

  it('refuses an admin scope on the catalogue pack', () => {
    // @ts-expect-error the catalogue chain exposes no `audit`
    shop.handler('/admin/audit', auditScope)
  })

  it('refuses a catalogue scope on the admin pack', () => {
    // @ts-expect-error the admin chain exposes no `catalog`
    back.handler('/items', listScope)
  })
})
