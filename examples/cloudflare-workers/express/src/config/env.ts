import { env } from 'cloudflare:workers'
import { z } from 'zod'

// The ONE host-specific file: where the environment comes from. Everything
// downstream takes `Env` as a value and never asks where it was read, which is
// what keeps the rest of the app portable.
//
// `import { env } from 'cloudflare:workers'` is available at MODULE SCOPE, and
// on THIS entry it is not one way to reach the bindings but the ONLY one. The
// Hono pack can thread a per-request host env (`c.env`); a node:http server has
// no such channel — Express hands its handlers a `req`, not a platform env. So
// the claim that a config module is all it takes to move runtimes is not a
// convenience here, it is what makes the example possible at all.
//
// What is NOT allowed here is USING a binding — a KV read outside a request is
// asynchronous I/O, which the runtime refuses. The environment is read eagerly,
// the app is built lazily (§36), and `test/module-scope.node.test.ts` holds the
// runtime to it.
//
// Same shape as `examples/app/app/config/env.ts`: a schema, one parse, an
// aggregated throw. Only the SOURCE differs, which is the claim §37 makes.
const EnvSchema = z.object({
  LABEL: z.string().min(1),
  SIGNING_SECRET: z.string().min(1),
  // A binding is environment too — it just arrives as an opaque object rather
  // than a string. `z.custom` is an ASSERTION, not a proof: nothing structural
  // distinguishes a KV namespace from a D1 database, so all that can be checked
  // is that the platform put something there. That is worth checking anyway —
  // the generated types describe the LOCAL wrangler.jsonc, while a deployment
  // (a `--env` that forgot the binding, one removed in the dashboard) can hand
  // over `undefined`. Without this the failure surfaces three frames down a
  // layer as "Cannot read properties of undefined".
  LINKS: z.custom<KVNamespace>((v) => v != null && typeof v === 'object', {
    message: 'the binding is missing — declare it in wrangler.jsonc',
  }),
})

// Inferred from the schema, so the shape has ONE source and the keys cannot
// drift from what is validated.
export type Env = z.infer<typeof EnvSchema>

// A bad config is infrastructure → throw and fail loud (§17). The aggregated
// message names every offending key at once, which matters more here than on
// Node: this runs on the first REQUEST, not at boot, so there is no startup log
// to go back to.
//
// `raw` is `unknown` because `safeParse` takes `unknown`, so the typed `env`
// from `cloudflare:workers` goes in exactly as it is — no cast anywhere.
export const readEnv = (raw: unknown): Env => {
  const result = EnvSchema.safeParse(raw)
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n')
    throw new Error(`Invalid environment:\n${issues}`)
  }
  return result.data
}

export const hostEnv = (): Env => readEnv(env)
