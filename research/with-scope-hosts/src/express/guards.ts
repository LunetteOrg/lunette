import type { Next } from '@lntt/scope'

export const requireActor = async (
  _app: {},
  {
    req,
    res,
  }: {
    readonly req: { header(name: string): string | undefined }
    readonly res: { status(code: number): { json(body: unknown): unknown } }
  },
  next: Next<{ actor: string }>,
) => {
  const actor = req.header('x-actor-id')
  if (!actor) return res.status(401).json({ error: 'unauthorized' })
  return next({ actor })
}
