import type { UserRepository } from '../../domain/access.ts'
import type { ProfileIdentity } from '../../domain/profile.ts'
import { SURFACES } from '../../domain/render.ts'
import { colorFromId, displayName } from '../../lib/identity.ts'

export const getIdentity = async (
  deps: { userRepo: UserRepository },
  userId: string,
): Promise<ProfileIdentity | null> => {
  const user = await deps.userRepo.findById(userId)
  if (!user) return null
  return { name: displayName(user), color: colorFromId(user.id), surfaceOptions: SURFACES }
}
