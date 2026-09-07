import expressApp, { type Express } from 'express'
import { express } from '@lntt/scope/express'
import { adminChain, auditScope, recordScope, type AdminEnv } from './admin.ts'
import { catalogChain, itemScope, listScope, type CatalogEnv } from './catalog.ts'

// TWO PRODUCTS, ONE PROCESS. Each is its own composition root, built once,
// serving its own routes on the same Express app. Nothing is shared: not the
// seed, not the services, not the lifecycle.
//
// This works because a route's deps are curried from ITS OWN chain's build —
// `express(shop.app)` and `express(back.app)` are two independent mounts, so
// nothing lets a catalogue route reach the admin chain's surface or the other
// way around (checked at compile time in `test/isolation.test-d.ts`).
export async function makeApp(env: { catalog: CatalogEnv; admin: AdminEnv }): Promise<{
  app: Express
  dispose: () => Promise<void>
}> {
  const shopBuild = await catalogChain.build({ env: env.catalog })
  const backBuild = await adminChain.build({ env: env.admin })

  const shop = express(shopBuild.app)
  const back = express(backBuild.app)

  const app = expressApp()
  // the catalogue's routes, served by the catalogue's chain
  app.get(...shop.route('/items', listScope))
  app.get(...shop.route('/items/:itemId', itemScope))
  // the admin's routes, served by the admin's chain, on the same server
  app.get(...back.route('/admin/audit', auditScope))
  app.post(...back.route('/admin/audit', recordScope))

  return {
    app,
    // Independent teardown: closing one product does not touch the other.
    dispose: async () => {
      await shopBuild.dispose()
      await backBuild.dispose()
    },
  }
}
