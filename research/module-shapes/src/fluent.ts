import { bind, lunette } from '@lntt/wire'
import type { ThreadsSeed } from './code-oriented.ts'
import { getAuthor, getPostForReading, listFeed, publishPost } from './use-cases.ts'

// Experiment 1 — the FLUENT shape: one chain step per wiring statement, the
// namespace via .as() at the boundary, records bound point-free. The binder
// returned by bind(record) IS a provider, so it plugs into expose directly;
// expose(fn) puts each bound record in Ctx AND Pub, so the read step sees
// `getAuthor` as an ordinary ctx key: the composition edge is the ORDER of
// the steps, not a local const.
export const threadsFluent = lunette<ThreadsSeed>()
  .expose(bind({ getAuthor }))
  .expose(bind({ publishPost }))
  .expose(bind({ getPostForReading, listFeed }))
  .as('threads')
