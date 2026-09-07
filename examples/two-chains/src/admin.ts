import { layer, lunette, type PubOf } from '@lntt/wire'
import { scope } from '@lntt/scope'
import { expressCarrier } from '@lntt/scope/express'
import { fail, guards } from '@lntt/scope/guard'
import type { Request, Response } from 'express'

// PRODUCT TWO: an admin area. A DIFFERENT composition root, with a different
// seed, different services and its own lifecycle — not a slice of the
// catalogue.
export interface AdminEnv {
  readonly TOKEN: string
}

export const opened: string[] = []
export const closed: string[] = []

const withAudit = layer<{ env: AdminEnv }, { entries: string[] }>(async (_ctx, next) => {
  opened.push('audit')
  const entries: string[] = []
  try {
    return await next({ entries })
  } finally {
    closed.push('audit')
  }
})

export const adminChain = lunette<{ env: AdminEnv }>()
  .use(withAudit)
  .expose('audit', (ctx) => ({
    record: (what: string) => ctx.entries.push(what),
    all: () => [...ctx.entries],
  }))
  // Exposed so the guard below can check the token; the env itself, and the
  // constant it carries, stay out of a scope's reach.
  .expose('auth', (ctx) => ({ accepts: (token: string | null) => token === ctx.env.TOKEN }))

export type AdminApp = PubOf<typeof adminChain>

// The gate: an admin scope is useless without it. `guard`'s check DERIVES and
// is carrier-free in spirit — it reads only the `deps`/`req` shape it
// declares — while `onError` STOPS and is Express's own answer.
const findAuth = (
  deps: { auth: { accepts(token: string | null): boolean } },
  { req }: { readonly req: Request },
) => (deps.auth.accepts(req.header('authorization') ?? null) ? {} : fail([{ message: 'unauthorized' }]))

// A SCOPE VALUE IS THE RECYCLABLE UNIT (decision in docs/design/scope-api.md,
// #67): `gated` is built once, and both routes below branch from it — no
// mechanism beyond what `.guard()` and `.step()` already are.
const gated = scope(expressCarrier())
  .extend(guards)
  .guard(findAuth, (issues, { res }: { readonly res: Response }) => res.status(401).json({ issues }))

export const auditScope = gated.step(async (deps: { audit: { all(): string[] } }, { res }) =>
  res.json({ entries: deps.audit.all() }),
)

export const recordScope = gated.step(
  async (deps: { audit: { record(what: string): void; all(): string[] } }, { res }) => {
    deps.audit.record('someone looked')
    return res.json({ recorded: deps.audit.all().length })
  },
)
