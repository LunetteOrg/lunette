import { type Abort, unauthorized } from '@lntt/scope'
import type { RequestHead } from '@lntt/scope'
import type { Session } from '../domain/access.ts'
import type { PendingAuth, PendingCookie } from '../lib/cookies.ts'

// Each guard declares its OWN dependencies as an explicit, self-contained
// structural type — the exact function shapes it calls, NOT a `Pick` from the
// whole `App`. A handler thus knows only the slice of the world it touches;
// the structural type still reconciles against the chain's Pub at the adapter
// (DepGuard) in the entry package, so a guard reaching for a repo the chain
// does not expose is a compile error there, on the argument.

// The session read that a hand-rolled loader would repeat — `const session =
// await context.app.getSession(request)` at the top of every loader/action —
// is ONE reusable guard here. It declares only `getSession`, reads the request
// off the carrier, and enriches the bag with `{ session }`. Every scope
// below opens with it; none rewrites the session read.
export const sessionGuard = (
  deps: { getSession: (request: RequestHead) => Promise<Session | null> },
  ctx: { request: RequestHead },
): Promise<{ session: Session | null }> =>
  deps.getSession(ctx.request).then((session) => ({ session }))

// The session gate every authenticated action shares: `sessionGuard` enriches
// `{ session }` (possibly null); `authGuard` narrows it to a present
// `Session` or short-circuits with a 401. Splitting the two keeps the read
// reusable by anonymous-friendly loaders (the feed) AND by gated ones.
// Deps typed as `Record<never, never>` (empty, NO index signature) — NOT
// `Record<string, never>`, whose `{ [k: string]: never }` index signature would
// intersect into the scope's `Need` and collapse every real dep to `never`,
// making the chain's Pub unable to satisfy it (a silent adapter-side break).
export const authGuard = (
  _deps: Record<never, never>,
  ctx: { session: Session | null },
): { session: Session } | Abort => (ctx.session ? { session: ctx.session } : unauthorized())

// `pendingGuard` reads the signed pending cookie login set (email + nonce +
// optional registration); no cookie → 401. It gates the verify path, where the
// pending state — not a session — identifies the caller mid-sign-in.
export const pendingGuard = (
  deps: { pendingCookie: Pick<PendingCookie, 'read'> },
  ctx: { request: RequestHead },
): Promise<{ pending: PendingAuth } | Abort> =>
  deps.pendingCookie.read(ctx.request).then((pending) => (pending ? { pending } : unauthorized()))
