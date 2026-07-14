import { initTRPC } from '@trpc/server'
import { chain, commentsFragment, feedFragment, identityFragment, postFragment } from '@lntt/example-app'
import type { App } from '@lntt/example-app'
import { toProcedure } from '@lntt/integration/trpc'

export { chain }

// The tRPC context: the built app singletons plus the carrier the fragments
// read (a `request` — natural for tRPC-over-HTTP). A RequestScope fragment
// consumed by tRPC needs its carrier fields present on the context.
export type Ctx = App & { request: Request }

const t = initTRPC.context<Ctx>().create()

// `toProcedure` consumes each fragment in ONE call — no per-guard annotations —
// into a native `.input(schema).query(...)`, so the typed `AppRouter` / caller /
// client is preserved. Only fragments whose input IS the RPC payload map here:
// the READS. The write/auth fragments read a form or JSON body off the HTTP
// request (`ctx.request`), an HTTP concern with no meaning over RPC, so they
// are NOT exposed here — exactly the feed/post/comments/me split.
export const appRouter = t.router({
  feed: toProcedure(t.procedure, feedFragment),
  post: toProcedure(t.procedure, postFragment),
  comments: toProcedure(t.procedure, commentsFragment),
  me: toProcedure(t.procedure, identityFragment),
})

export type AppRouter = typeof appRouter
export const createCaller = t.createCallerFactory(appRouter)
