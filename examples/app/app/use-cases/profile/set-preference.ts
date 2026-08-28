import type { User, UserRepository } from '../../domain/access.ts'
import type { Surface } from '../../domain/render.ts'

export const setPreference = async (
  deps: { userRepo: UserRepository },
  userId: string,
  surface: Surface,
): Promise<User> => deps.userRepo.update(userId, { locale: surface })
