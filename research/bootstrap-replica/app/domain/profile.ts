import type { Surface } from './render.ts'

export type ProfileIdentity = {
  name: string
  color: string
  surfaceOptions: readonly Surface[]
}

// A presentational author identity (display name + deterministic color),
// shared by the feed and the read screen.
export type AuthorIdentity = {
  name: string
  color: string
}
