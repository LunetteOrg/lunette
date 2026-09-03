import type { Next } from '@lntt/scope'
import type { ZodType } from 'zod'

// The raw read, kept apart from the schema check (trap 18, docs/design/
// scope-api.md): Hono has no framework-level body parser the way Express's
// `express.json()` is, so a step has to do the read itself — but a genuine
// parse/IO failure here still only THROWS, unlike a well-formed-but-invalid
// body, which `validated` answers on its own. Populates `raw`, not `body`:
// a step may only ADD a ctx key, never re-populate one — `validated` is the
// one that turns `raw` into the parsed, narrowed `body`.
export const jsonBody = async (
  _app: {},
  { c }: { readonly c: { req: { json(): Promise<unknown> } } },
  next: Next<{ raw: unknown }>,
) => next({ raw: await c.req.json() })

export const validated = <Body>(schema: ZodType<Body>) =>
  async (
    _app: {},
    {
      c,
      raw,
    }: {
      readonly c: { json(body: unknown, status: number): unknown }
      readonly raw: unknown
    },
    next: Next<{ body: Body }>,
  ) => {
    const result = schema.safeParse(raw)
    if (!result.success) return c.json({ error: 'invalid', issues: result.error.issues }, 422)
    return next({ body: result.data })
  }
