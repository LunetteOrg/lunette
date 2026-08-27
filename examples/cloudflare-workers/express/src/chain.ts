import { layer, lunette } from '@lntt/wire'
import { z } from 'zod'
import { httpError, notFound, scope } from '@lntt/scope'
import { body } from '@lntt/scope/body'
import type { Env } from './config/env.ts'

// A chain of its own: nothing here comes from `@lntt/example-app`, which cannot
// run on Workers (PGlite). What this example is about is the RUNTIME — where the
// environment comes from, when the app may be built, and whether a pack written
// for Node runs unchanged.

export interface Link {
  readonly slug: string
  readonly url: string
}

// The layer that OPENS something, and on this runtime that is not a figure of
// speech: reading KV is asynchronous I/O, and Workers allow none outside a
// request. So this layer is the reason the build MUST be lazy — turn
// `bootstrap/index.ts` eager and the runtime refuses to start the worker at all.
// `test/module-scope.node.test.ts` runs that experiment against a fixture worker
// instead of describing it.
//
// It also derives a key from the secret, which is CPU rather than I/O — allowed
// at module scope, and left here as the contrast: it is not "async work" the
// runtime objects to, it is TOUCHING A BINDING.
const withStore = layer<{ env: Env }, { store: Map<string, string>; keyId: string }>(
  async ({ env }, next) => {
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(env.SIGNING_SECRET),
    )
    const keyId = [...new Uint8Array(digest).slice(0, 4)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    // The read that makes the laziness mandatory. Done ONCE per isolate, which
    // is exactly what build-once buys on a runtime billed per request.
    const listed = await env.LINKS.list()
    const entries = await Promise.all(
      listed.keys.map(async ({ name }) => [name, (await env.LINKS.get(name)) ?? ''] as const),
    )

    return next({ store: new Map(entries.filter(([, url]) => url !== '')), keyId })
  },
)

export const chain = lunette<{ env: Env }>()
  .use(withStore)
  // private: the raw map never reaches a scope
  .provide('lookup', (ctx) => (slug: string) => ctx.store.get(slug))
  .expose('links', (ctx) => ({
    all: (): Link[] => [...ctx.store].map(([slug, url]) => ({ slug, url })),
    bySlug: (slug: string): Link | undefined => {
      const url = ctx.lookup(slug)
      return url ? { slug, url } : undefined
    },
    // The WRITE, and it writes to both: KV so the value outlives this isolate,
    // and the in-memory store so THIS app sees its own write. They are two
    // stores and the app owns the reconciliation — the store was read once at
    // build (§36), so a write that only touched KV would be invisible here until
    // an isolate started fresh. That is the same property #39 is about, seen
    // from the inside.
    //
    // The taken-slug check is NOT ATOMIC, and this example does not pretend
    // otherwise. `has` reads the in-memory snapshot rather than KV, and the
    // `await` on `put` yields control: two concurrent creates of the same slug
    // both pass the check, both answer 200, and the later write wins. The
    // answer for a write that must be atomic on this runtime is a Durable
    // Object — one single-threaded owner per slug — not a check-then-write
    // inside a Worker. Copy the SHAPE of the dual write, not this check.
    create: async (slug: string, url: string): Promise<Link | 'slug-taken'> => {
      if (ctx.store.has(slug)) return 'slug-taken'
      await ctx.env.LINKS.put(slug, url)
      ctx.store.set(slug, url)
      return { slug, url }
    },
  }))
  .expose('about', (ctx) => ({
    label: ctx.env.LABEL,
    keyId: ctx.keyId,
  }))

// The scopes: host-agnostic, declaring what THEY need from the public surface.
export const listScope = scope().handle((deps: { links: { all(): Link[] } }) => ({
  links: deps.links.all(),
}))

export const linkScope = scope()
  .input(z.object({ slug: z.string() }))
  .handle((deps: { links: { bySlug(slug: string): Link | undefined } }, ctx) => {
    const link = deps.links.bySlug(ctx.params.slug)
    return link ? { link } : notFound()
  })

// The WRITE scope, and the reason both Workers entries have one: `.body(schema)`
// is a DECLARED channel, so this scope carries the `body` capability (§34) and
// the mount gate has something to check. On Express it is also the only thing
// that exercises `toWebRequest`'s streaming branch (`init.body = req`,
// `duplex: 'half'`) against a `node:http` server the runtime EMULATES — the
// least-verified path of the Node pack on this runtime.
export const createScope = scope()
  .extend(body)
  .body(z.object({ slug: z.string().min(1), url: z.string().url() }))
  .handle(
    async (
      deps: { links: { create(slug: string, url: string): Promise<Link | 'slug-taken'> } },
      ctx,
    ) => {
      const created = await deps.links.create(ctx.body.slug, ctx.body.url)
      // A RETURNED domain error: the slug is taken. Commit, no retry (principle 3).
      return created === 'slug-taken' ? httpError(409, { error: 'slug-taken' }) : { link: created }
    },
  )

// Reads the env back out through the chain, which is what proves the values the
// config module read at module scope reached the app.
export const aboutScope = scope().handle(
  (deps: { about: { label: string; keyId: string } }) => deps.about,
)
