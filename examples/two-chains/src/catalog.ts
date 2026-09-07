import { layer, lunette, type PubOf } from '@lntt/wire'
import { scope } from '@lntt/scope'
import { expressCarrier } from '@lntt/scope/express'

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
// when this product's chain is built and closed by its own `dispose`,
// independently of the other product's.
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
  // PRIVATE: this accessor itself, `ctx.lookup`, never reaches a scope by that
  // name — only `catalog.byId` below, which wraps it, does. `catalog.list`
  // hands back the live array as it stands, since nothing here writes through
  // it; a chain whose scopes could mutate the list would expose a copy.
  .provide('lookup', (ctx) => (id: string) => ctx.items.find((i) => i.id === id))
  .expose('catalog', (ctx) => ({
    list: () => ctx.items,
    byId: (id: string) => ctx.lookup(id),
  }))

// The chain's PUBLIC surface, once built — what a scope reads as its `app`.
export type CatalogApp = PubOf<typeof catalogChain>

// Its scopes declare what THEY need from this chain's public surface, and
// nothing else — no carrier extension, since this product has no gate.
export const listScope = scope(expressCarrier()).step(
  async (deps: { catalog: { list(): Item[] } }, { res }) => res.json({ items: deps.catalog.list() }),
)

// `req.params` is Express's own dictionary, so `itemId` arrives as
// `string | string[] | undefined` — a repeated param, or a pattern that never
// carried the name. The carrier declares nothing about it (§53), and where the
// FORMAT matters the answer is `.step(params).validate('params', schema, …)`,
// which `examples/express` shows. Here the id is a lookup key and nothing more,
// so the narrowing is a `typeof` and the miss is the 404 this route already has.
export const itemScope = scope(expressCarrier()).step(
  async (deps: { catalog: { byId(id: string): Item | undefined } }, { req, res }) => {
    const itemId = req.params.itemId
    const item = typeof itemId === 'string' ? deps.catalog.byId(itemId) : undefined
    return item ? res.json({ item }) : res.status(404).json({ error: 'not found' })
  },
)
