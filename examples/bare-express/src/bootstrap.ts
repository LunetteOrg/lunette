import { layer, lunette } from '@lntt/wire'

// The composition root, and the whole of level one: a chain, built ONCE at
// module scope. An ES module is already a singleton, so there is no memo to
// keep — `await` here runs at import, and every importer gets the same app.
//
// This is the shape to prefer on Node. It does NOT transfer to Cloudflare
// Workers: there the bindings only exist inside a request, and I/O at module
// scope is forbidden — a layer that opens something would fail at import. That
// is what `buildOnce` in @lntt/wire is for (§36), and it is the only reason the
// host packs build lazily.
export interface Env {
  readonly GREETING: string
}

interface Note {
  readonly id: string
  readonly text: string
}

export const opened: string[] = []
export const closed: string[] = []

const withStore = layer<{ env: Env }, { store: Note[] }>(async ({ env }, next) => {
  opened.push(env.GREETING)
  try {
    return await next({ store: [{ id: 'n1', text: 'the first note' }] })
  } finally {
    closed.push(env.GREETING)
  }
})

export const chain = lunette<{ env: Env }>()
  .use(withStore)
  // private: the array itself never leaves the chain
  .provide('find', (ctx) => (id: string) => ctx.store.find((n) => n.id === id))
  .expose('notes', (ctx) => ({
    list: () => [...ctx.store],
    byId: (id: string) => ctx.find(id),
    add: (text: string) => {
      const note = { id: `n${ctx.store.length + 1}`, text }
      ctx.store.push(note)
      return note
    },
  }))

// Built at import. `app` is the chain's PUBLIC surface — `find` is not on it.
export const { app, dispose } = await chain.build({ env: { GREETING: 'hello' } })
