import { env } from 'cloudflare:workers'
import { z } from 'zod'

// The ONE host-specific file, and on Workers it is the whole point of the
// arrangement: the Node entries read `process.env` here, this one reads the
// Workers binding namespace, and NOTHING downstream changes — the chain, the
// scopes and the mount take `Env` as a value and never ask where it was read.
//
// `import { env } from 'cloudflare:workers'` is available at MODULE SCOPE, and
// that is the claim the Node entries could only write in a comment: reading
// vars, secrets and binding OBJECTS while this module is evaluated is allowed.
// What is not allowed is USING a binding here — a KV read outside a request is
// asynchronous I/O, which the runtime refuses. Hence the split this file makes
// visible: the environment is read eagerly, the app is built lazily (§36), and
// `test/module-scope.node.test.ts` holds the runtime to it.
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
// `raw` is `unknown` because `safeParse` takes `unknown` — so neither caller
// casts. The typed `env` from `cloudflare:workers` goes in as it is, and so does
// the genuinely untyped `c.env` of `./env-from-host.ts`.
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
