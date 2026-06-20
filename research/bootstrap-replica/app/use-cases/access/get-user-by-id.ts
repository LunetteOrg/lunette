import type { User, UserRepository } from '../../domain/access.ts'

export const getUserById = async (
  deps: { userRepo: UserRepository },
  userId: string,
): Promise<User | null> => deps.userRepo.findById(userId)
