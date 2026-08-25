import expressApp, { type Express } from 'express'
import { express } from '@lntt/integration/express'
import { adminChain, auditScope, recordScope, type AdminEnv } from './admin.ts'
import { catalogChain, itemScope, listScope, type CatalogEnv } from './catalog.ts'

// TWO PRODUCTS, ONE PROCESS. Each pack takes its OWN chain, builds it once, and
// serves its own routes on the same Express app. Nothing is shared: not the
// seed, not the services, not the lifecycle.
//
// This works because a handler reads the app from the pack it came from — not
// from a slot on the request that a second pack could overwrite (§33). Registering
// `mount()` is optional here and only matters if you want to reach an app from
// outside a scope; when two packs both do, they take different `contextKey`s.
export function makeApp(env: { catalog: CatalogEnv; admin: AdminEnv }): {
  app: Express
  dispose: () => Promise<void>
} {
  const shop = express(catalogChain, () => ({ env: env.catalog }))
  const back = express(adminChain, () => ({ env: env.admin }))

  const app = expressApp()
  // the catalogue's routes, served by the catalogue's chain
  app.get('/items', shop.handler(listScope))
  app.get('/items/:itemId', shop.handler(itemScope))
  // the admin's routes, served by the admin's chain, on the same server
  app.get('/admin/audit', back.handler(auditScope))
  app.post('/admin/audit', back.handler(recordScope))

  return {
    app,
    // Independent teardown: closing one product does not touch the other.
    dispose: async () => {
      await shop.dispose()
      await back.dispose()
    },
  }
}
