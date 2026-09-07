import { describe, it } from 'vitest'
import { express } from '@lntt/scope/express'
import { auditScope, type AdminApp } from '../src/admin.ts'
import { listScope, type CatalogApp } from '../src/catalog.ts'

// THE COMPILE-TIME HALF of the isolation: each mount is curried with ONE
// chain's own public surface, so a scope needing the OTHER'S cannot be
// mounted on it — refused STRUCTURALLY, by `DepGuard`, with no brand of our
// own to maintain. Nothing here runs (`*.test-d.ts` is typechecked only).
const shop = express({} as CatalogApp)
const back = express({} as AdminApp)

describe('a scope mounts only where its deps are satisfied', () => {
  it('mounts on its own product', () => {
    shop.route('/items', listScope)
    back.route('/admin/audit', auditScope)
  })

  it('refuses an admin scope on the catalogue mount', () => {
    // @ts-expect-error the catalogue chain exposes no `audit`
    shop.route('/admin/audit', auditScope)
  })

  it('refuses a catalogue scope on the admin mount', () => {
    // @ts-expect-error the admin chain exposes no `catalog`
    back.route('/items', listScope)
  })
})
