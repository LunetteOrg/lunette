import { describe, expect, it } from 'vitest'
import { scope } from './base.ts'
import { outcomeOf, type Next, type Outcome } from './primitive.ts'

// The base builder has ONE verb, so every one of these is written with nothing
// but `.step()`. What the sugar will buy later is not power — it is not having
// to call `next` correctly.

// Declaring termination, written out. `handle` will be sugar for exactly this
// one line, and for nothing else: the leaf itself needs no wrapping, because
// the fold normalises whatever any step hands back.
interface Repos {
  readonly users: { readonly byId: (id: string) => { readonly name: string } | undefined }
}
const app: Repos = { users: { byId: (id) => (id === 'u1' ? { name: 'Ada' } : undefined) } }

describe('the step primitive, folded', () => {
  it('runs steps in the order they were written and threads what each populates', async () => {
    const seen: string[] = []
    const h = scope()
      .step(async (_app: {}, _ctx, next: Next<{ one: number }>) => {
        seen.push('a')
        const out = await next({ one: 1 })
        seen.push('a-out')
        return out
      })
      .step(async (_app: {}, ctx, next: Next<{ two: number }>) => {
        seen.push('b')
        return next({ two: ctx.one + 1 })
      })
      .step(async (_app: {}, ctx: { one: number; two: number }) => {
        seen.push('leaf')
        return { sum: ctx.one + ctx.two }
      })

    const out = await h(app, {})
    expect(out.ok && out.value).toEqual({ sum: 3 })
    // The AFTER exists because a step wraps `next` — which a pre-hook plus a
    // collector could not express (#55).
    expect(seen).toEqual(['a', 'b', 'leaf', 'a-out'])
  })

  it('a step that does not call next stops the fold — no later step runs', async () => {
    const seen: string[] = []
    const h = scope()
      .step(async (_app: {}, _ctx, _next: Next<{}>) => {
        seen.push('stopped here')
        // Not calling `next` is the whole of stopping. What comes back is a
        // plain domain value — the fold turns it into the outcome.
        return 'early'
      })
      .step(async (_app: {}, _ctx: {}) => {
        seen.push('never')
        return 'unreachable'
      })

    const out = await h(app, {})
    expect(out.ok && out.value).toBe('early')
    expect(seen).toEqual(['stopped here'])
  })

  it('a step wraps the rest, so it can change what came back', async () => {
    const h = scope()
      .step(async (_app: {}, _ctx, next: Next<{}>) => {
        const out = await next({})
        return out.ok ? { ...out, value: `wrapped(${String(out.value)})` } : out
      })
      .step(async (_app: {}, _ctx: {}) => 'inner')

    const out = await h(app, {})
    expect(out.ok && out.value).toBe('wrapped(inner)')
  })

  it('reads the scope execution parameters as the ctx it starts from', async () => {
    const h = scope<{ readonly id: string }>()
      .step(async (deps: Repos, ctx, next: Next<{ name: string }>) => {
        const user = deps.users.byId(ctx.id)
        if (!user) return 'anonymous'
        return next({ name: user.name })
      })
      .step(async (_app: {}, ctx: { name: string }) => ctx.name)

    expect((await h(app, { id: 'u1' })).ok).toBe(true)
    expect(await h(app, { id: 'u1' }).then((o) => o.ok && o.value)).toBe('Ada')
    expect(await h(app, { id: 'nope' }).then((o) => o.ok && o.value)).toBe('anonymous')
  })

  it('normalises whatever a step handed back, in one place', () => {
    expect(outcomeOf('plain')).toMatchObject({ ok: true, value: 'plain' })
  })
})
