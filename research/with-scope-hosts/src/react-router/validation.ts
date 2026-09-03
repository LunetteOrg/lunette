import { data } from 'react-router'
import type { Next } from '@lntt/scope'
import type { ZodType } from 'zod'

// The raw read, kept apart from the schema check (trap 18, docs/design/
// scope-api.md): React Router has no framework-level body parser either, so
// a step reads the body itself — a genuine parse/IO failure here THROWS,
// unlike a well-formed-but-invalid body, which `validated` answers on its
// own by RETURNING (not throwing) a data() envelope — a 422 does not need
// an ErrorBoundary, `useActionData` reads it directly.
export const jsonBody = async (
  _app: {},
  { request }: { readonly request: Request },
  next: Next<{ raw: unknown }>,
) => next({ raw: await request.json() })

export const validated = <Body>(schema: ZodType<Body>) =>
  async (_app: {}, { raw }: { readonly raw: unknown }, next: Next<{ body: Body }>) => {
    const result = schema.safeParse(raw)
    if (!result.success) return data({ error: 'invalid', issues: result.error.issues }, { status: 422 })
    return next({ body: result.data })
  }
