import { type Abort, notFound } from '@lntt/scope'
import type { Session, User } from '../domain/access.ts'
import type { ProfileIdentity } from '../domain/profile.ts'
import type { Surface } from '../domain/render.ts'

// ── read path: GET /me (gated) ──────────────────────────────────────────────
// The identity read — a leaf: fetches the gated viewer's profile and either
// shapes `{ identity }` or ABORTS with `notFound()` when there is no row. Named
// + typed, so both branches are proven without the fold. Behind the gate the
// session is present, so `ctx.session` is a `Session`, not nullable.
export const identityHandler = async (
  deps: { profile: { getIdentity(userId: string): Promise<ProfileIdentity | null> } },
  ctx: { session: Session },
): Promise<{ identity: ProfileIdentity } | Abort> => {
  const identity = await deps.profile.getIdentity(ctx.session.userId)
  return identity ? { identity } : notFound()
}

// ── write path: POST /me/preference (gated) ─────────────────────────────────
// The body's raw surface is normalised through the empty-deps leaf before the
// write, so an out-of-range value falls back rather than reaching the repo.
export type PreferenceDeps = {
  profile: {
    resolveSurface(raw: string | null | undefined, fallback: Surface): Surface
    setPreference(userId: string, surface: Surface): Promise<User>
  }
}
export const preferenceHandler = (
  deps: PreferenceDeps,
  userId: string,
  rawSurface: string | null | undefined,
): Promise<{ locale: string | null }> => {
  const surface = deps.profile.resolveSurface(rawSurface, 'web')
  return deps.profile.setPreference(userId, surface).then((user) => ({ locale: user.locale }))
}
