import { parseEnv, type Env } from '@lntt/example-app'

// The ONE host-specific file: where the environment comes from. Everything
// downstream takes `Env` as a value and never asks where it was read, which is
// what keeps the rest of the app portable.
//
// This entry is a NODE entry: `process.env`. The Cloudflare Workers variant of
// the same file — `import { env } from 'cloudflare:workers'`, same shape, same
// `Env` downstream — lives in `examples/cloudflare-workers/*`, where it runs and
// where the rule that comes with it (no I/O outside a request, which is why the
// build is lazy, §36) is enforced by the runtime rather than described here.
export type { Env }

export const hostEnv = (): Env => parseEnv(process.env)
