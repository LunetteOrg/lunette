import { parseEnv, type Env } from '@lntt/example-app'

// The ONE host-specific file: where the environment comes from. Everything
// downstream takes `Env` as a value and never asks where it was read, which is
// what keeps the rest of the app portable — the same chain and the same scopes
// run on a runtime that reads its configuration elsewhere.
//
// This entry is a NODE entry: `process.env`. tRPC is transport-agnostic, so
// which runtime that is depends on the adapter this router is served through;
// the file is the one place that changes when it is not Node.
export type { Env }

export const hostEnv = (): Env => parseEnv(process.env)
