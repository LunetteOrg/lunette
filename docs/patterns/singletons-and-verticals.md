# Singletons and vertical chains

A layer runs **once per run**: within a single chain, singletons are
structural — no memoization, no container bookkeeping. The real question
appears when an app splits into *verticals* (route blocks, feature areas)
that must share infrastructure: **who owns the instance?** Two variants,
and in both the owner is readable in the code.

## Variant 1 — verticals as fragments of one root (the common case)

The database is born once in the composition root; verticals **require**
it through their Seed — they never embed it:

```ts
// verticals/posts.ts — requires the db, does not create it
export const posts = lunette<{ db: Db }>()
  .provide('repo', ({ db }) => makePostRepo(db))
  .expose('posts', (ctx) => ({
    routes: [
      get('/posts', bindHandler(ctx, listPosts)),
      post('/posts', bindHandler(ctx, createPost)),
    ],
  }))

// verticals/auth.ts — same shape
export const auth = lunette<{ db: Db }>()
  .provide('repos', ({ db }) => makeAuthRepos(db))
  .expose('auth', (ctx) => bind(ctx.repos, { requestOtp, verifyOtp }))

// bootstrap — the ONLY place where the db exists
const chain = lunette<{ env: Env }>()
  .use('db', withDb)        // singleton: one creation, one teardown
  .expose(posts)            // every vertical reuses the same instance
  .expose(auth)
```

Mounting `withDb` *inside* each vertical would create N pools (every
mount gets its own bag): the Seed exists precisely so you never have to.
Requirement and visibility are independent axes — the verticals' Seed is
satisfied by the host's **private** `db`.

## Variant 2 — truly independent verticals (separate processes/servers)

Build the infrastructure once; its public surface becomes the **seed** of
every other chain. The lifecycle owner is whoever built the
infrastructure:

```ts
// shared infra, built once — db is THE singleton
const infraChain = lunette<{ env: Env }>()
  .use('db', withDb)
  .expose('db', ({ db }) => db)          // its contract: the handle

const { app: infra, dispose } = await infraChain.build({ env })

// each vertical is an independent top-level chain seeded with it
const postsApp = await postsChain.build(infra)
const adminApp = await adminChain.build(infra)

// shutdown: verticals first, then the infrastructure owner
await postsApp.dispose()
await adminApp.dispose()
await dispose()
```

## What was rejected, and why

Effect-style **layer memoization** (same layer reference ⇒ same instance
everywhere, refcounted teardown) was considered and rejected: it makes
lifecycle ownership *implicit*, and "who owns this instance / when does
it close" is the question a dispose must always be able to answer by
reading the code. In both variants above, the answer is one line away.

## The dev/HMR corollary

"Once per run" holds inside a process run. In dev, the bundler may
re-evaluate the bootstrap module — creating a *new* run and a new pool.
The fix is host-level: memoize the build **promise** (the promise, not
the app: two concurrent evaluations would race):

```ts
const g = globalThis as { __app?: ReturnType<typeof boot> }
const boot = () => chain.build({ env })
const { app, dispose } = await (g.__app ??= boot())

// or, fresh code on every hot update (teardown included):
import.meta.hot?.dispose(() => dispose())
```
