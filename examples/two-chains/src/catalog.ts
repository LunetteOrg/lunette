import { layer, lunette } from '@lntt/wire'
import { z } from 'zod'
import { scope } from '@lntt/scope'
import { http, notFound } from '@lntt/scope/http'

// PRODUCT ONE: a public catalogue. Its own composition root — everything it
// depends on is in here, and nothing outside can reach in.
export interface CatalogEnv {
  readonly SOURCE: string
}

interface Item {
  readonly id: string
  readonly title: string
}

// A disposable resource, so the lifecycle is real: the "connection" is opened
// when the app is built and closed by its own `dispose`, independently of the
// other product's.
export const opened: string[] = []
export const closed: string[] = []

const withSource = layer<{ env: CatalogEnv }, { items: Item[] }>(async ({ env }, next) => {
  opened.push(env.SOURCE)
  try {
    return await next({
      items: [
        { id: 'a1', title: 'A catalogue item' },
        { id: 'a2', title: 'Another one' },
      ],
    })
  } finally {
    closed.push(env.SOURCE)
  }
})

export const catalogChain = lunette<{ env: CatalogEnv }>()
  .use(withSource)
  // private: the raw list never reaches a scope
  .provide('lookup', (ctx) => (id: string) => ctx.items.find((i) => i.id === id))
  .expose('catalog', (ctx) => ({
    list: () => ctx.items,
    byId: (id: string) => ctx.lookup(id),
  }))

// Its scopes declare what THEY need from this chain's public surface.
export const listScope = scope().handle((deps: { catalog: { list(): Item[] } }) => ({
  items: deps.catalog.list(),
}))

export const itemScope = scope()
  .extend(http)
  .params(z.object({ itemId: z.string() }))
  .handle((deps: { catalog: { byId(id: string): Item | undefined } }, ctx) => {
    const item = deps.catalog.byId(ctx.params.itemId)
    return item ? { item } : notFound()
  })
