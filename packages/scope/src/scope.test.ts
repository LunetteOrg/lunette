import { describe, expect, it } from 'vitest'
import { scope } from './scope.ts'
import type { Next } from './step.ts'

// The base builder has ONE verb, so every one of these is written with nothing
// but `.step()`. What the sugar will buy later is not power — it is not having
// to call `next` correctly.

// Declaring termination, written out. `handle` will be sugar for exactly this
// one line, and for nothing else: the leaf itself needs no wrapping, because
// the fold hands back whatever any step returned, untouched.
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
    expect(out).toEqual({ sum: 3 })
    // The AFTER exists because a step wraps `next` — which a pre-hook plus a
    // collector could not express.
    expect(seen).toEqual(['a', 'b', 'leaf', 'a-out'])
  })

  it('a step that does not call next stops the fold — no later step runs', async () => {
    const seen: string[] = []
    const h = scope()
      .step(async (_app: {}, _ctx, _next: Next<{}>) => {
        seen.push('stopped here')
        // Not calling `next` is the whole of stopping, and what the caller
        // gets is this string — the fold adds nothing on the way out.
        return 'early'
      })
      .step(async (_app: {}, _ctx: {}) => {
        seen.push('never')
        return 'unreachable'
      })

    const out = await h(app, {})
    expect(out).toBe('early')
    expect(seen).toEqual(['stopped here'])
  })

  it('a step wraps the rest, so it can change what came back', async () => {
    const h = scope()
      .step(async (_app: {}, _ctx, next: Next<{}>) => {
        // What `next` hands back declines to say what it is (`Passed`), so a
        // step that DECORATES has to state what it expects. That is the whole
        // cost of the fold producing nothing of its own, and it lands on the
        // only shape that reads the way back. Here the scope is agnostic, so
        // what comes back is the domain value; on a carrier it is that
        // carrier's union, asserted once in a helper it ships (§42).
        const inner = (await next({})) as unknown as string
        return `wrapped(${inner})`
      })
      .step(async (_app: {}, _ctx: {}) => 'inner')

    const out = await h(app, {})
    expect(out).toBe('wrapped(inner)')
  })

  it('reads the scope execution parameters as the ctx it starts from', async () => {
    const h = scope<{ readonly id: string }>()
      .step(async (deps: Repos, ctx, next: Next<{ name: string }>) => {
        const user = deps.users.byId(ctx.id)
        if (!user) return 'anonymous'
        return next({ name: user.name })
      })
      .step(async (_app: {}, ctx: { name: string }) => ctx.name)

    expect(await h(app, { id: 'u1' })).toBe('Ada')
    expect(await h(app, { id: 'nope' })).toBe('anonymous')
  })
})
