import { isAbort } from '@lntt/scope'
import { describe, expect, it } from 'vitest'
import type { User } from '../domain/access.ts'
import type { ProfileIdentity } from '../domain/profile.ts'
import type { Surface } from '../domain/render.ts'
import { identityHandler, preferenceHandler } from './profile.ts'
import { aSession, aUser, anIdentity } from './fixtures.ts'

// The profile handlers as PURE functions. The gate (anonymous → 401) is proven
// once on `authGuard` in guards.test.ts, so here the leaf assumes a present
// session and we prove only the no-row 404 and the surface normalisation.

describe('identityHandler: gated read leaf, no row → 404', () => {
  it('profile present → { identity }', async () => {
    const out = await identityHandler(
      { profile: { getIdentity: async (): Promise<ProfileIdentity | null> => anIdentity } },
      { session: aSession },
    )
    expect(out).toEqual({ identity: anIdentity })
  })

  it('no profile row → a 404 abort', async () => {
    const out = await identityHandler(
      { profile: { getIdentity: async (): Promise<ProfileIdentity | null> => null } },
      { session: aSession },
    )
    expect(isAbort(out)).toBe(true)
    if (isAbort(out)) expect(out.intent).toMatchObject({ kind: 'status', status: 404 })
  })
})

describe('preferenceHandler: out-of-range surface falls back before the write', () => {
  it('normalises a bogus surface to the fallback, returns { locale }', async () => {
    let written: Surface | null = null
    const out = await preferenceHandler(
      {
        profile: {
          resolveSurface: (raw: string | null | undefined, fallback: Surface): Surface =>
            (['web', 'feed', 'email'] as string[]).includes(raw ?? '') ? (raw as Surface) : fallback,
          setPreference: async (_id: string, surface: Surface): Promise<User> => {
            written = surface
            return { ...aUser, locale: surface }
          },
        },
      },
      'u1',
      'bogus',
    )
    expect(out).toEqual({ locale: 'web' }) // the bogus value normalised to the fallback
    expect(written).toBe('web')
  })

  it('a valid surface passes through', async () => {
    const out = await preferenceHandler(
      {
        profile: {
          resolveSurface: (raw: string | null | undefined, fallback: Surface): Surface =>
            (['web', 'feed', 'email'] as string[]).includes(raw ?? '') ? (raw as Surface) : fallback,
          setPreference: async (_id: string, surface: Surface): Promise<User> => ({
            ...aUser,
            locale: surface,
          }),
        },
      },
      'u1',
      'feed',
    )
    expect(out).toEqual({ locale: 'feed' })
  })
})
