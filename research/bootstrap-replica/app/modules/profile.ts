import { bind, lunette } from '@lntt/wire'
import type { UserRepository } from '../domain/access.ts'
import { getIdentity } from '../use-cases/profile/get-identity.ts'
import { resolveSurface } from '../use-cases/profile/resolve-surface.ts'
import { setPreference } from '../use-cases/profile/set-preference.ts'

export const profileModule = lunette<{ userRepo: UserRepository }>().expose(
  'profile',
  (ctx) => ({
    ...bind({ userRepo: ctx.userRepo }, { getIdentity, setPreference }),
    // The empty-deps case: a pure leaf bound with no dependencies.
    ...bind({}, { resolveSurface }),
  }),
)
