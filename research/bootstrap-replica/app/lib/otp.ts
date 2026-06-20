import { createHash, randomInt } from 'node:crypto'

export const MAX_OTP_ATTEMPTS = 3
export const OTP_TTL_MS = 10 * 60 * 1000
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

export const generateCode = (): string => String(randomInt(0, 1_000_000)).padStart(6, '0')

export const hashCode = (code: string): string =>
  createHash('sha256').update(code).digest('hex')

export const verifyHash = (code: string, hash: string): boolean =>
  hashCode(code) === hash
