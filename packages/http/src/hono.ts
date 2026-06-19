// @lntt/http/hono — two ways to use Hono with a wire chain:
//
// 1. `honoEngine(options?)` — an Engine for the engine-agnostic dialect
//    (`@lntt/http`): your routes stay portable, Hono runs them
//    in-process (a Hono app IS a fetch function). The optional `setup`
//    hands you the naked Hono app for NATIVE middleware (cors, logger,
//    ...): the framework coupling is confined to that one block.
//
// 2. `hono(chain)` — the NATIVE dialect: the full Hono app (groups,
//    validators, RPC, native middleware) wired with the chain's deps,
//    available two ways:
//    - by closure: setup(deps, app)
//    - from context: c.var.deps, TYPED through Hono's Variables — so
//      sub-routers defined in other files see them too.
//
//   lunette().use('db', withDb).expose(postsModule)
//     .pipe(hono)
//     .app(({ posts }, app) => {
//       app.use('*', cors())
//       app.get('/posts', (c) => c.json(posts.list()))
//     })
//     .run(seed, async ({ fetch, app }) => { ... })   // or .worker(seedFrom)

import { Hono } from 'hono'
import type { Lunette } from '@lntt/wire'
import type { Engine } from './index.ts'

type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never

export const honoEngine =
  (options: { setup?: (app: Hono) => void } = {}): Engine =>
  async (routes) => {
    const app = new Hono()
    options.setup?.(app) // native middleware BEFORE the routes
    for (const r of routes) {
      app.on(r.method, r.path, (c) => r.handle(c.req.raw))
    }
    return {
      fetch: async (req) => app.fetch(req),
      close: async () => {},
    }
  }

export type HonoEnvOf<Deps> = { Variables: { deps: Deps } }

export const hono = <
  Ctx extends object,
  Pub extends object,
  Seed extends object,
>(
  chain: Lunette<Ctx, Pub, Seed>,
) => ({
  app(
    setup: (deps: Expand<Pub>, app: Hono<HonoEnvOf<Expand<Pub>>>) => void,
  ) {
    const boot = (pub: Expand<Pub>) => {
      const app = new Hono<HonoEnvOf<Expand<Pub>>>()
      app.use(async (c, next) => {
        c.set('deps', pub)
        await next()
      })
      setup(pub, app)
      return app
    }

    const runChain = chain.run.bind(chain) as (
      seed: Seed,
      scope: (pub: Expand<Pub>) => Promise<unknown>,
    ) => Promise<unknown>
    const buildChain = chain.build.bind(chain) as unknown as (
      seed: Seed,
    ) => Promise<{ app: Expand<Pub> }>

    return {
      // The server lives as long as the scope, like run/serve.
      run: <T>(
        seed: Seed,
        scope: (server: {
          app: Hono<HonoEnvOf<Expand<Pub>>>
          fetch: (req: Request) => Promise<Response>
        }) => T | Promise<T>,
      ): Promise<T> =>
        runChain(seed, async (pub) => {
          const app = boot(pub)
          return scope({ app, fetch: async (req) => app.fetch(req) })
        }) as Promise<T>,

      // The Cloudflare export: lazy memoized boot per isolate.
      worker: <WorkerEnv>(seedFrom: (env: WorkerEnv) => Seed) => {
        let booted: Promise<Hono<HonoEnvOf<Expand<Pub>>>> | undefined
        const start = async (env: WorkerEnv) =>
          boot((await buildChain(seedFrom(env))).app)
        return {
          fetch: (req: Request, env: WorkerEnv): Promise<Response> => {
            booted ??= start(env).catch((error) => {
              booted = undefined
              throw error
            })
            return booted.then((app) => app.fetch(req))
          },
        }
      },
    }
  },
})
