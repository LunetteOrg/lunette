import type { User } from '../domain/access.ts'

export const displayName = (user: User): string =>
  user.displayName ?? user.email.split('@')[0] ?? user.email

// A deterministic color from the id — same input, same hue, no storage.
export const colorFromId = (id: string): string => {
  let hash = 0
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  return `hsl(${Math.abs(hash) % 360}, 70%, 50%)`
}
