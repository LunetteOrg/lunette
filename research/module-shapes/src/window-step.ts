import { bind, lunette, window } from '@lntt/wire'
import type { Post, PostRepository } from './domain.ts'

// Experiment 3 — the WINDOW as a NAMED CHAIN STEP: the opener/bridge pair is
// provided once under a name that says what it guards; the expose line binds
// leaves to `ctx.publishWindow` like any other value. Transactionality reads
// as one line of the chain instead of an inline block (compare the replica's
// access module, where the window(...) sits inside the expose callback).

export type MemDb = {
  rows: Post[]
  transaction: <T>(fn: (tx: { rows: Post[] }) => Promise<T>) => Promise<T>
}

// An in-memory transactional store: fn runs against a snapshot; a THROW
// discards it (rollback), a RETURN publishes it (commit) — domain error
// values included, per the error convention.
export const memDb = (): MemDb => ({
  rows: [],
  async transaction(fn) {
    const staged = { rows: [...this.rows] }
    const result = await fn(staged)
    this.rows = staged.rows
    return result
  },
})

const stagedPostRepo = (tx: { rows: Post[] }): Pick<PostRepository, 'create'> => ({
  create: async (post) => {
    tx.rows.push(post)
    return post
  },
})

// A leaf exercising both convention paths: a RETURNED domain error after the
// first insert (→ that insert commits), a THROW on infrastructure (→ every
// insert in the window vanishes).
export const publishPair = async (
  deps: { postRepo: Pick<PostRepository, 'create'>; generateId: () => string },
  first: { authorId: string; title: string; body: string },
  second: { authorId: string; title: string; body: string },
): Promise<2 | { kind: 'duplicate-title' }> => {
  await deps.postRepo.create({ id: deps.generateId(), ...first })
  if (second.title === first.title) return { kind: 'duplicate-title' }
  if (second.body === 'boom') throw new Error('storage exploded')
  await deps.postRepo.create({ id: deps.generateId(), ...second })
  return 2
}

export const windowModule = lunette<{ db: MemDb; generateId: () => string }>()
  .provide('publishWindow', (ctx) =>
    window(ctx.db.transaction.bind(ctx.db), (tx) => ({
      postRepo: stagedPostRepo(tx),
      generateId: ctx.generateId,
    })),
  )
  .expose('threads', (ctx) => bind({ publishPair }).with(ctx.publishWindow))
