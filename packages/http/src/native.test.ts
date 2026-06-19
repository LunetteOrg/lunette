// The NATIVE dialects: wire's modularity (chain, layers, seed,
// visibility) AND the full API of the chosen framework. The declared
// price: routes written here are NOT portable across engines — the
// opposite trade-off of the engine-agnostic dialect, picked per project.

import { lunette } from '@lntt/wire'
import expressLib from 'express'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { describe, expect, it } from 'vitest'
import { express } from './express.ts'
import { hono } from './hono.ts'

type Post = { id: number; title: string }

const teardowns: string[] = []

const appChain = () => {
  teardowns.length = 0
  return lunette()
    .use('store', async (_ctx, next) => {
      const posts: Post[] = [{ id: 1, title: 'first' }]
      try {
        return await next(posts)
      } finally {
        teardowns.push('store')
      }
    })
    .expose('posts', (ctx) => ({
      list: () => ctx.store,
      add: (title: string) => {
        const post = { id: ctx.store.length + 1, title }
        ctx.store.push(post)
        return post
      },
    }))
}

describe('native hono dialect', () => {
  it('the full Hono app, deps by closure AND via c.var (typed)', async () => {
    await appChain()
      .pipe(hono)
      .app(({ posts }, app) => {
        app.use('*', cors()) // the native ecosystem, no adapters
        app.get('/posts', (c) => c.json(posts.list()))
        app.post('/posts', async (c) => {
          const { title } = (await c.req.json()) as { title: string }
          return c.json(posts.add(title), 201)
        })
        // the road for sub-routers in other files: deps from context, typed
        app.get('/via-var', (c) => c.json(c.var.deps.posts.list()))
      })
      .run({}, async ({ fetch }) => {
        const list = await fetch(new Request('http://app/posts'))
        expect(await list.json()).toEqual([{ id: 1, title: 'first' }])
        expect(list.headers.get('access-control-allow-origin')).toBe('*')

        const created = await fetch(
          new Request('http://app/posts', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ title: 'second' }),
          }),
        )
        expect(created.status).toBe(201)

        const viaVar = await fetch(new Request('http://app/via-var'))
        expect(((await viaVar.json()) as Post[]).length).toBe(2)
      })

    // the chain tore down when the scope exited, as always
    expect(teardowns).toEqual(['store'])
  })

  it('worker: lazy boot for Cloudflare with the native dialect too', async () => {
    let boots = 0
    const handler = lunette<{ env: { greeting: string } }>()
      .expose('hello', ({ env }) => {
        boots += 1
        return { say: () => env.greeting }
      })
      .pipe(hono)
      .app(({ hello }, app) => {
        app.get('/hello', (c) => c.text(hello.say()))
      })
      .worker((env: { GREETING: string }) => ({ env: { greeting: env.GREETING } }))

    expect(boots).toBe(0)

    const cfEnv = { GREETING: 'hello isolate' }
    const res = await handler.fetch(new Request('http://app/hello'), cfEnv)
    expect(await res.text()).toBe('hello isolate')

    await handler.fetch(new Request('http://app/hello'), cfEnv)
    expect(boots).toBe(1)
  })
})

// ── modular blocks: each block = its own wire chain + its own Hono ──────
// sub-app (a VALUE in the context), mounted with Hono's app.route.
// The db is shared through the Seed: one singleton for N blocks.

describe('modular hono blocks', () => {
  type Db = { users: string[]; posts: string[] }

  // users/block.ts — self-contained: requires the db, keeps its internals
  // private, exposes ONLY its sub-app
  const usersBlock = lunette<{ db: Db }>()
    .provide('repo', ({ db }) => ({ list: () => db.users }))
    .expose('usersApp', ({ repo }) => {
      const app = new Hono() // the naked Hono app, no dialect needed
      app.get('/', (c) => c.json(repo.list()))
      return app
    })

  // posts/block.ts
  const postsBlock = lunette<{ db: Db }>().expose('postsApp', ({ db }) => {
    const app = new Hono()
    app.get('/', (c) => c.json(db.posts))
    return app
  })

  it('blocks share the db (singleton) and mount with app.route', async () => {
    let creations = 0

    await lunette()
      .provide('db', () => {
        creations += 1
        return { users: ['ada'], posts: ['first'] } as Db
      })
      .expose(usersBlock) // wire mount: the { db } Seed is satisfied
      .expose(postsBlock)
      .pipe(hono)
      .app((deps, app) => {
        app.route('/users', deps.usersApp) // HONO mount: native composition
        app.route('/posts', deps.postsApp)
      })
      .run({}, async ({ fetch }) => {
        const users = await fetch(new Request('http://app/users'))
        expect(await users.json()).toEqual(['ada'])

        const posts = await fetch(new Request('http://app/posts'))
        expect(await posts.json()).toEqual(['first'])
      })

    expect(creations).toBe(1) // one db for two blocks
  })

  it("a block's internals stay private: only the sub-app crosses", async () => {
    await lunette()
      .provide('db', () => ({ users: [], posts: [] }) as Db)
      .expose(usersBlock)
      .run(async (pub) => {
        expect(Object.keys(pub)).toEqual(['usersApp'])
        expect('repo' in pub).toBe(false) // the block's repo does not exist here
      })
  })
})

describe('native express dialect', () => {
  it('the real Express app on a real server, deps by closure', async () => {
    await appChain()
      .pipe(express)
      .app(({ posts }, app) => {
        app.use(expressLib.json()) // native middleware
        app.get('/posts', (_req, res) => {
          res.json(posts.list())
        })
        app.post('/posts', (req, res) => {
          const { title } = req.body as { title: string }
          res.status(201).json(posts.add(title))
        })
      })
      .run({}, async ({ fetch }) => {
        const list = await fetch(new Request('http://app/posts'))
        expect(await list.json()).toEqual([{ id: 1, title: 'first' }])

        const created = await fetch(
          new Request('http://app/posts', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ title: 'second' }),
          }),
        )
        expect(created.status).toBe(201)
        expect(await created.json()).toEqual({ id: 2, title: 'second' })
      })

    expect(teardowns).toEqual(['store'])
  })
})
