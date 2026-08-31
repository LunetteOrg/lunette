import { parseEnv, type Env } from '@lntt/example-app'

// The ONE host-specific file: where the environment comes from. Everything
// downstream takes `Env` as a value and never asks where it was read, which is
// what keeps the rest of the app portable — the same chain, the same scopes and
// the same mount run on a runtime that reads its configuration elsewhere.
//
// This entry is a NODE entry: `process.env`. The Cloudflare Workers variant of
// the same file lives in `examples/cloudflare-workers/hono`, where it can be run.
export type { Env }

export const hostEnv = (): Env => parseEnv(process.env)
