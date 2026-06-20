import type { User, UserRepository } from '../../domain/access.ts'

export const findUserByEmail = async (
  deps: { userRepo: UserRepository },
  email: string,
): Promise<User | null> => deps.userRepo.findByEmail(email)
