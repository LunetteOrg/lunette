import { lunette, type PubOf } from '@lntt/wire'
import { makeRepos } from './domain.ts'

export interface Env {
  readonly label: string
}

// The build-tier app: singletons wired once. In the scope-runtime posture
// the Pub is the SCOPE-TIER surface — the guards read these repos. Route
// leaves never touch them: the guard fold hands a leaf only the request
// scope plus the guards' typed enrichments (see scope/kit.ts).
export const chain = lunette<{ env: Env }>().expose(() => makeRepos())

// The app Pub, inferred — what a scope's Need is reconciled against at the mount.
export type App = PubOf<typeof chain>
