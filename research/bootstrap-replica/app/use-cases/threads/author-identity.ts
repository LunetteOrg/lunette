import type { UserRepository } from '../../domain/access.ts'
import type { AuthorIdentity } from '../../domain/profile.ts'
import { colorFromId, displayName } from '../../lib/identity.ts'

export const getAuthor = async (
  deps: { userRepo: UserRepository },
  id: string,
): Promise<AuthorIdentity | null> => {
  const user = await deps.userRepo.findById(id)
  return user ? { name: displayName(user), color: colorFromId(user.id) } : null
}

export const getAuthors = async (
  deps: { userRepo: UserRepository },
  ids: readonly string[],
): Promise<Map<string, AuthorIdentity>> => {
  const users = await deps.userRepo.findByIds([...new Set(ids)])
  return new Map(
    users.map((user) => [user.id, { name: displayName(user), color: colorFromId(user.id) }]),
  )
}
