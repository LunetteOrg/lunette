import type { PubOf } from '@lntt/wire'
import type { chain } from './chain.ts'

// What a scope reads: the chain's public surface, once built. Every per-host
// entry's routes annotate `deps: Deps` and nothing wider.
export type Deps = PubOf<typeof chain>
