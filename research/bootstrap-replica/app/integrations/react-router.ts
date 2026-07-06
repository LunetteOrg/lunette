import type { App } from '../bootstrap/chain.ts'
import { chain } from '../bootstrap/chain.ts'
import type { Env } from '../config/env.ts'

// The React Router 7 server recipe (the story-15 adapter, in miniature).
// `build()` yields { app, dispose }; the app is exactly what RR7's
// getLoadContext hands to loaders/actions. In dev the bootstrap module is
// re-evaluated on every hot update, so we memoize the build PROMISE — the
// promise, not the app: concurrent first requests would otherwise each kick
// off their own boot (ADR #12). No dispose on the happy path: the dev server
// owns process lifetime; HMR teardown calls disposeApp explicitly.

type Booted = { app: App; dispose: () => Promise<void> }

const globalForApp = globalThis as typeof globalThis & {
  __replicaApp: Promise<Booted> | undefined
}

export const bootOnce = (env: Env): Promise<Booted> =>
  // Memoize the PROMISE, but clear it on failure — otherwise a boot error (db
  // connect/migrate) would stay cached forever and no request could ever
  // recover without a process restart. Same discipline as `lazyAsync`.
  (globalForApp.__replicaApp ??= chain.build({ env }).catch((error: unknown) => {
    globalForApp.__replicaApp = undefined
    throw error
  }))

// What a loader/action receives. RR7 spells this RouterContextProvider /
// AppLoadContext; here it is just the Pub surface under `app`.
export type LoadContext = { app: App }

export const getLoadContext = async (env: Env): Promise<LoadContext> => {
  const { app } = await bootOnce(env)
  return { app }
}

// Wire into the dev server's hot hook: import.meta.hot?.dispose(disposeApp)
export const disposeApp = async (): Promise<void> => {
  const booted = globalForApp.__replicaApp
  globalForApp.__replicaApp = undefined
  if (booted) await (await booted).dispose()
}
