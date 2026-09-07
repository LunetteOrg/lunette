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
  // Built independently, and torn down independently below if either build
  // fails: a `Promise.allSettled` rather than two sequential `await`s, so the
  // catalogue's resource is not left open forever because the admin chain's
  // build rejected after it.
  const [shopResult, backResult] = await Promise.allSettled([
    catalogChain.build({ env: env.catalog }),
    adminChain.build({ env: env.admin }),
  ])
  if (shopResult.status === 'rejected' || backResult.status === 'rejected') {
    if (shopResult.status === 'fulfilled') await shopResult.value.dispose()
    if (backResult.status === 'fulfilled') await backResult.value.dispose()
    throw shopResult.status === 'rejected' ? shopResult.reason : (backResult as PromiseRejectedResult).reason
  }
  const shopBuild = shopResult.value
  const backBuild = backResult.value

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
    // INDEPENDENT teardown: closing one product does not touch the other, and
    // `allSettled` means a failure disposing one does not skip the other's.
    dispose: async () => {
      const [shop, back] = await Promise.allSettled([shopBuild.dispose(), backBuild.dispose()])
      if (shop.status === 'rejected') throw shop.reason
      if (back.status === 'rejected') throw back.reason
    },
  }
}
