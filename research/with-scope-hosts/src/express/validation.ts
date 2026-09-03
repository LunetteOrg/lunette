import type { Next } from '@lntt/scope'
import type { ZodType } from 'zod'

export const validated = <Body>(schema: ZodType<Body>) =>
  async (
    _app: {},
    {
      req,
      res,
    }: {
      readonly req: { body: unknown }
      readonly res: { status(code: number): { json(body: unknown): unknown } }
    },
    next: Next<{ body: Body }>,
  ) => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      return res.status(422).json({ error: 'invalid', issues: result.error.issues })
    }
    return next({ body: result.data })
  }
