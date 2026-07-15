import { initTRPC } from '@trpc/server'
import { scope } from '@lntt/scope'
import {
  chain,
  commentProcedure,
  commentsScope,
  identityScope,
  feedGuard,
  postScope,
  publishPostProcedure,
  setPreferenceProcedure,
  feedHandler,
} from '@lntt/example-app'
import type { App } from '@lntt/example-app'
import { toMutation, toProcedure } from '@lntt/integration/trpc'

export { chain }

// The tRPC context: the built app singletons plus the carrier the scopes
// read (a `request` — natural for tRPC-over-HTTP). A RequestCarrier scope
// consumed by tRPC needs its carrier fields present on the context.
export type Ctx = App & { request: Request }

const t = initTRPC.context<Ctx>().create()

// `toProcedure` consumes each scope in ONE call — no per-guard annotations —
// into a native `.input(schema).query(...)`, so the typed `AppRouter` / caller /
// client is preserved. Only scopes whose input IS the RPC payload map here:
// the READS. The write/auth scopes read a form or JSON body off the HTTP
// request (`ctx.request`), an HTTP concern with no meaning over RPC, so they
// are NOT exposed here — exactly the feed/post/comments/me split.
export const appRouter = t.router({
  // reads → queries
  // The feed is composed INLINE here to show the single-host idiom — a real app
  // has one host and composes at the wiring, so no shared-scope module is
  // needed. The shared `*Scope`/`*Procedure` imports below are the multi-host
  // portability device; `feedScope` still ships as their documented form.
  feed: toProcedure(t.procedure, scope().guard(feedGuard).handle(feedHandler)),
  post: toProcedure(t.procedure, postScope),
  comments: toProcedure(t.procedure, commentsScope),
  me: toProcedure(t.procedure, identityScope),
  // value-returning WRITES → mutations. Each RPC-shaped scope declares its
  // whole input as the payload (`.input`, not `.body`), so it clears the
  // capability gate and mounts here — the dedicated tRPC write path. The cookie/
  // redirect writes (login/verify/logout) stay HTTP-only: no RPC meaning.
  publishPost: toMutation(t.procedure, publishPostProcedure),
  comment: toMutation(t.procedure, commentProcedure),
  setPreference: toMutation(t.procedure, setPreferenceProcedure),
})

export type AppRouter = typeof appRouter
export const createCaller = t.createCallerFactory(appRouter)
