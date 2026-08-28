import { initTRPC } from '@trpc/server'
import { scope } from '@lntt/scope'
import {
  commentProcedure,
  commentsProcedure,
  identityProcedure,
  feedGuard,
  postProcedure,
  publishPostProcedure,
  setPreferenceProcedure,
  feedHandler,
} from '@lntt/example-app'
import { toMutation, toProcedure } from '@lntt/integration/trpc'
import type { Ctx } from './bootstrap/index.ts'

// The ROUTER, and nothing else: the procedure table. The chain, the build-once
// handle and the context shape live in `bootstrap/`, so what is left on this
// page is exactly what is about tRPC.
export type { Ctx }

const t = initTRPC.context<Ctx>().create()

// `toProcedure` consumes each scope in ONE call — no per-guard annotations —
// into a native `.input(schema).query(...)`, so the typed `AppRouter` / caller /
// client is preserved. Only scopes whose input IS the RPC payload map here:
// the READS. The write/auth scopes read a form or JSON body off the HTTP
// request (`ctx.request`), an HTTP concern with no meaning over RPC, so they
// are NOT exposed here — exactly the feed/post/comments/me split.
//
// `post`/`comments`/`me` take the `*Procedure` twin, not the `*Scope` a Hono/
// Express/RR7 host mounts: each carrier owns its own input verb (`.params` vs
// `.input`) and its own abort words (`notFound()` renders a `status` on HTTP,
// a `code` here), so a scope that reads/aborts is authored once per carrier
// family (`examples/app`'s `handlers.ts` and its README explain the split).
// `feed` needs no twin — `feedGuard`/`feedHandler` never abort and never read
// `ctx.request`, so the SAME composition mounts on every host.
export const appRouter = t.router({
  // reads → queries
  // The feed is composed INLINE here to show the single-host idiom — a real app
  // has one host and composes at the wiring, so no shared-scope module is
  // needed. The shared `*Scope`/`*Procedure` imports below are the multi-host
  // portability device; `feedScope` still ships as their documented form.
  feed: toProcedure(t.procedure, scope().guard(feedGuard).handle(feedHandler)),
  post: toProcedure(t.procedure, postProcedure),
  comments: toProcedure(t.procedure, commentsProcedure),
  me: toProcedure(t.procedure, identityProcedure),
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
