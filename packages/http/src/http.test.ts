// The interchangeability proof: the SAME routes and the SAME middleware
// run on two engines (Hono in-process, Express on a real network server).

import { lunette } from '@lntt/wire'
import { describe, expect, it } from 'vitest'
import { expressEngine } from './express.ts'
import { honoEngine } from './hono.ts'
import { http } from './index.ts'

type Post = { id: number; title: string }

const teardowns: string[] = []

const appChain = () =>
  lunette()
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

const buildApp = () =>
  appChain()
    .pipe(http)
    .middleware(async (req, next) => {
      const res = await next(req)
      const headers = new Headers(res.headers)
      headers.set('x-powered-by', 'lntt')
      return new Response(res.body, { status: res.status, headers })
    })
    .route('GET /posts', ({ posts }) => Response.json(posts.list()))
    .route('POST /posts', async ({ posts }, req) => {
      const { title } = (await req.json()) as { title: string }
      return Response.json(posts.add(title), { status: 201 })
    })

const engines = [
  ['hono', honoEngine()],
  ['express', expressEngine()],
] as const

for (const [name, engine] of engines) {
  describe(`http dialect on ${name}`, () => {
    it('serves the same routes with the same per-request onion', async () => {
      teardowns.length = 0

      await buildApp().serve(engine, {}, async ({ fetch }) => {
        const list = await fetch(new Request('http://app/posts'))
        expect(list.status).toBe(200)
        expect(await list.json()).toEqual([{ id: 1, title: 'first' }])
        expect(list.headers.get('x-powered-by')).toBe('lntt')

        const created = await fetch(
          new Request('http://app/posts', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ title: 'second' }),
          }),
        )
        expect(created.status).toBe(201)
        expect(await created.json()).toEqual({ id: 2, title: 'second' })
        expect(created.headers.get('x-powered-by')).toBe('lntt')

        const after = await fetch(new Request('http://app/posts'))
        expect(((await after.json()) as Post[]).length).toBe(2)
      })

      // the server lives as long as the scope: once serve returns, the
      // chain has already torn down
      expect(teardowns).toEqual(['store'])
    })
  })
}

describe('native engine middleware (via setup)', () => {
  it('hono: native cors(), confined to the engine config', async () => {
    const { cors } = await import('hono/cors')

    await buildApp().serve(
      honoEngine({ setup: (app) => app.use('*', cors()) }),
      {},
      async ({ fetch }) => {
        const res = await fetch(new Request('http://app/posts'))
        expect(res.headers.get('access-control-allow-origin')).toBe('*')
        expect(res.headers.get('x-powered-by')).toBe('lntt') // our onion coexists
      },
    )
  })

  it('express: native middleware in the engine config', async () => {
    await buildApp().serve(
      expressEngine({
        setup: (app) =>
          app.use((_req, res, nextFn) => {
            res.setHeader('x-engine', 'native-express')
            nextFn()
          }),
      }),
      {},
      async ({ fetch }) => {
        const res = await fetch(new Request('http://app/posts'))
        expect(res.headers.get('x-engine')).toBe('native-express')
        expect(await res.json()).toEqual([{ id: 1, title: 'first' }])
      },
    )
  })
})

describe('worker — the Cloudflare shape (env arrives per request)', () => {
  type CfEnv = { GREETING: string }

  const chainWithSeed = () => {
    let boots = 0
    const chain = lunette<{ env: { greeting: string } }>().expose(
      'hello',
      ({ env }) => {
        boots += 1
        return { say: () => env.greeting }
      },
    )
    return { chain, boots: () => boots }
  }

  it('lazy boot on the first request, memoized for the following ones', async () => {
    const { chain, boots } = chainWithSeed()
    const handler = chain
      .pipe(http)
      .route('GET /hello', ({ hello }) => new Response(hello.say()))
      .worker(honoEngine(), (env: CfEnv) => ({ env: { greeting: env.GREETING } }))

    expect(boots()).toBe(0) // no module-scope boot: on CF the env is not there yet

    const cfEnv: CfEnv = { GREETING: 'hello from cloudflare' }
    const first = await handler.fetch(new Request('http://app/hello'), cfEnv)
    expect(await first.text()).toBe('hello from cloudflare')

    await handler.fetch(new Request('http://app/hello'), cfEnv)
    expect(boots()).toBe(1) // one construction per isolate
  })
})

describe('pipe', () => {
  it('hands the chain to the dialect and returns what the dialect returns', () => {
    const out = lunette()
      .provide('n', () => 1)
      .pipe((chain) => ({ tag: 'dialect', chain }))

    expect(out.tag).toBe('dialect')
  })
})
