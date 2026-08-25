import { layer, lunette } from '@lntt/wire'
import { z } from 'zod'
import { notFound, scope } from '@lntt/scope'
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

// Reads the env back out through the chain, which is what proves the values the
// config module read at module scope reached the app.
export const aboutScope = scope().handle(
  (deps: { about: { label: string; keyId: string } }) => deps.about,
)
