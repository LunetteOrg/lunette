// @lntt/http — the engine-agnostic HTTP dialect for @lntt/wire, reached
// via pipe:
//
//   lunette().use('db', withDb).expose(postsModule)
//     .pipe(http)                          // from here the chain speaks http
//     .middleware(cors)                    // PER-REQUEST onion
//     .route('GET /posts', ({ posts }) => Response.json(posts.list()))
//     .serve(honoEngine(), seed, scope)    // or expressEngine(): swappable
//
// Three principles:
// - ROUTES ARE DATA (method + path + flat handler): no engine owns them,
//   so they are portable across Hono/Express/... by construction.
// - Handlers are flat use cases (deps, req) => Response, where deps is
//   the chain's public surface: the same contravariance as bind does the
//   checking.
// - `middleware` is the per-request onion. It lives HERE, in the dialect,
//   not in the wire layers (which run once, at boot).
//
// `serve` has run's shape: the server lives as long as the scope —
// chain boot → engine up → scope → engine down → chain teardown.

import type { Lunette } from '@lntt/wire'

type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
export type RouteSpec = `${HttpMethod} ${string}`

export type Handler<Deps> = (
  deps: Deps,
  req: Request,
) => Response | Promise<Response>

export type HttpMiddleware = (
  req: Request,
  next: (req: Request) => Promise<Response>,
) => Promise<Response>

// The engine-agnostic shape every engine receives.
export type BoundRoute = {
  method: HttpMethod
  path: string
  handle: (req: Request) => Promise<Response>
}

export type Engine = (routes: readonly BoundRoute[]) => Promise<{
  fetch: (req: Request) => Promise<Response>
  close: () => Promise<void>
}>

type RouteDef<Deps> = { method: HttpMethod; path: string; handler: Handler<Deps> }

export class Http<
  Ctx extends object,
  Pub extends object,
  Seed extends object,
> {
  constructor(
    private readonly chain: Lunette<Ctx, Pub, Seed>,
    private readonly routes: readonly RouteDef<Expand<Pub>>[],
    private readonly middlewares: readonly HttpMiddleware[],
  ) {}

  route(spec: RouteSpec, handler: Handler<Expand<Pub>>): Http<Ctx, Pub, Seed> {
    const [method, path] = spec.split(' ') as [HttpMethod, string]
    return new Http(
      this.chain,
      [...this.routes, { method, path, handler }],
      this.middlewares,
    )
  }

  middleware(mw: HttpMiddleware): Http<Ctx, Pub, Seed> {
    return new Http(this.chain, this.routes, [...this.middlewares, mw])
  }

  async serve<T>(
    engine: Engine,
    seed: Seed,
    scope: (server: { fetch: (req: Request) => Promise<Response> }) => T | Promise<T>,
  ): Promise<T> {
    const runChain = this.chain.run.bind(this.chain) as (
      seed: Seed,
      scope: (pub: Expand<Pub>) => Promise<T>,
    ) => Promise<T>

    return runChain(seed, async (pub) => {
      const server = await engine(this.bind(pub))
      try {
        return await scope({ fetch: server.fetch })
      } finally {
        await server.close()
      }
    })
  }

  // The export shape for Cloudflare Workers (and friends): there the env
  // arrives PER REQUEST and there is no boot. But the env is stable per
  // isolate, so: lazy boot on the first request, memoized — the lazyAsync
  // pattern applied to the chain. No dispose: the platform kills the
  // isolate, it never shuts down (that is the Workers model).
  worker<WorkerEnv>(
    engine: Engine,
    seedFrom: (env: WorkerEnv) => Seed,
  ): { fetch: (req: Request, env: WorkerEnv, ctx?: unknown) => Promise<Response> } {
    const buildChain = this.chain.build.bind(this.chain) as unknown as (
      seed: Seed,
    ) => Promise<{ app: Expand<Pub> }>

    let booted: Promise<(req: Request) => Promise<Response>> | undefined
    const boot = async (env: WorkerEnv) => {
      const { app } = await buildChain(seedFrom(env))
      const server = await engine(this.bind(app))
      return server.fetch
    }

    return {
      fetch: (req, env) => {
        booted ??= boot(env).catch((error) => {
          booted = undefined // a failed boot is not cached (retry possible)
          throw error
        })
        return booted.then((handle) => handle(req))
      },
    }
  }

  private bind(pub: Expand<Pub>): BoundRoute[] {
    return this.routes.map((r) => ({
      method: r.method,
      path: r.path,
      handle: this.onion(async (req) => r.handler(pub, req)),
    }))
  }

  // Composes the middlewares around the handler: per-request,
  // engine-agnostic.
  private onion(
    terminal: (req: Request) => Promise<Response>,
  ): (req: Request) => Promise<Response> {
    return this.middlewares.reduceRight<(req: Request) => Promise<Response>>(
      (next, mw) => (req) => mw(req, next),
      terminal,
    )
  }
}

export const http = <
  Ctx extends object,
  Pub extends object,
  Seed extends object,
>(
  chain: Lunette<Ctx, Pub, Seed>,
): Http<Ctx, Pub, Seed> => new Http(chain, [], [])
