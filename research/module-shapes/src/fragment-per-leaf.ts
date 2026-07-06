import { bind, lunette } from '@lntt/wire'
import type { PostRepository } from './domain.ts'
import { publishPost } from './use-cases.ts'

// Experiment 2 — ONE use case as its own mountable fragment, pushed to the
// extreme to price the shape. The Seed is the leaf's requirement contract,
// checked at the mount point; standalone, run(fakes, …) reaches every dep —
// per-leaf fragments make the deep-substitution question moot (everything
// is a seed). The price: one wiring ceremony per leaf, one mount per leaf
// in the host, and onion machinery around a function that has no lifecycle.
export const publishPostFragment = lunette<{
  postRepo: Pick<PostRepository, 'create'>
  generateId: () => string
}>().expose(bind({ publishPost }))
