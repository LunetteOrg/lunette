import { describe, expect, expectTypeOf, it } from 'vitest'
import { scope, type Next } from './index.ts'
import { fixture, gone, refused, served, type Refusal, type Served } from './fixture/carrier.ts'

// THE SHAPES A STEP TAKES — one per thing a step is for. There is no category
// here and no phase: every one is the same primitive, and each runs where it
// was written. What tells them apart is which of the five things it says, and
// that is visible in the signature every time.
//
// Read them for what is NOT in them. No step builds a result, none casts: a
// step hands back what `next` gave it, or a plain domain value, and the fold
// hands back whichever arrived, untouched. The domain shapes come from
// `fixture/carrier.ts`, and the scope is started with THAT carrier,
// `scope(fixture)`, which is what makes its run parameters (`token`, `params`)
// legal here: a carrier is chosen exactly once, and bringing them is its job.

interface Session {
  readonly userId: string
}
interface Repos {
  readonly sessions: { readonly of: (token: string | null) => Session | undefined }
  readonly notes: { readonly byId: (id: string) => { readonly text: string } | undefined }
}
const app: Repos = {
  sessions: { of: (t) => (t === 'good' ? { userId: 'u1' } : undefined) },
  notes: { byId: (id) => (id === 'n1' ? { text: 'hello' } : undefined) },
}

// ── 1. POPULATE ──────────────────────────────────────────────────────────────
// Derive an entry from what the run already brought, and hand it inward. This
// is what an extension is: `query` reading the URL, `cookies` reading the
// header. Says three of the five, declares neither of the other two — so it is
// a bare function, and nothing about writing one is ceremonial.
const withPage = async (
  _app: {},
  ctx: { readonly params: Readonly<Record<string, string>> },
  next: Next<{ page: number }>,
) => next({ page: Number(ctx.params.page ?? '1') })

// ── 2. GUARD ─────────────────────────────────────────────────────────────────
// Enrich, or STOP WITH A VALUE. The two exits are the whole shape, and the name
// is for the shape and not for authorization — one that never stops is the
// degenerate case of the same thing.
//
// Stopping is RETURNING the value. Nothing is constructed and nothing is cast,
// so it keeps its own type all the way out — which is where the builder reads
// what a scope can produce: off the return type, never from inside a result
// that already erased it.
//
// It ends the fold at runtime and still must NOT close the builder: the leaf
// has not been written yet. Ending a request and closing a scope are different
// claims, and only the second is declared.
const authenticated = async (
  deps: Pick<Repos, 'sessions'>,
  ctx: { readonly token: string | null },
  next: Next<{ session: Session }>,
) => {
  const session = deps.sessions.of(ctx.token)
  if (!session) return refused('no session')
  return next({ session })
}

// ── 3. REFINE ────────────────────────────────────────────────────────────────
// Populate a key the ctx ALREADY has, narrower. It is what a carrier's
// validation verb will do, and why `Ctx` is an override rather than the
// intersection it looks like:
// intersecting the old type with the new gives `never` in the ordinary case — a
// field nobody can use, and no error anywhere.
const refineToken = async (
  _app: {},
  ctx: { readonly token: string | null },
  next: Next<{ token: string }>,
) => (ctx.token === null ? next({ token: 'anonymous' }) : next({ token: ctx.token }))

// ── 4. WRAP ──────────────────────────────────────────────────────────────────
// Let the rest run and act on what came BACK. A step wraps `next`, so it has an
// after — where a span is closed, a metric flushed, a rolling session cookie
// attached to whatever the leaf decided. A pre-hook plus a collector could not
// express this, and it is the shape that replaced sinks: with the
// outbound side a RETURNED value, decorating it is ordinary code.
const timed = (log: string[]) => async (_app: {}, _ctx: {}, next: Next<{}>) => {
  log.push('in')
  const out = await next({})
  log.push('out')
  return out
}

// ── 5. TERMINATE ─────────────────────────────────────────────────────────────
// The step that does not call `next`. Being innermost is the whole of what
// makes it the leaf — no phase, no special casing.
//
// The leaf itself is ONLY a leaf: a value. That is the entire convention, the
// same one wire's leaves follow: a RETURNED error is domain, a THROWN one is
// infrastructure.
const readNote = async (deps: Pick<Repos, 'notes'>, ctx: { readonly session: Session }) => {
  const note = deps.notes.byId('n1')
  return note === undefined ? gone('note') : `${ctx.session.userId}:${note.text}`
}

// And that is all a leaf is. It DECLARES nothing: not calling `next` ends the
// fold at runtime, and what the scope yields is read off this function's own
// return type. There is no closing verb and no terminal marker, because there
// is nothing to close — a scope is the function that runs it from the first
// line.

// ── the five, in one scope ───────────────────────────────────────────────────
describe('the five shapes, composed', () => {
  const log: string[] = []
  const noteScope = scope(fixture)
    .step(timed(log))
    .step(refineToken)
    .step(withPage)
    .step(authenticated)
    .step(readNote)

  it('runs every shape in the order it was written', async () => {
    log.length = 0
    const out = await noteScope(app, { token: 'good', params: { page: '3' } })
    expect(out).toBe('u1:hello')
    // the WRAP shape's after runs last, because it wraps the rest
    expect(log).toEqual(['in', 'out'])
  })

  it('the guard stops the fold with its value, and the wrap still sees it come back', async () => {
    log.length = 0
    const out = await noteScope(app, { token: null, params: {} })
    expect(out).toMatchObject({ kind: 'refused', why: 'no session' })
    expect(log).toEqual(['in', 'out'])
  })

  it('a leaf returning a value stops on it, not on the domain success value', async () => {
    const empty: Repos = { ...app, notes: { byId: () => undefined } }
    const out = await noteScope(empty, { token: 'good', params: {} })
    expect(out).toMatchObject({ kind: 'gone', why: 'note' })
  })

  it('is the function that runs it AND still a builder', async () => {
    const out = await noteScope(app, { token: 'good', params: {} })
    // What a run yields is EVERY type its steps hand back: reading the union
    // is how a caller learns what this scope can produce.
    expectTypeOf(out).toEqualTypeOf<string | Refusal>()
    // and there is nothing to close, so more steps can still be added
    expectTypeOf(noteScope).toHaveProperty('step')
  })

  it('an inline step needs no annotation to read what the scope holds', async () => {
    const h = scope(fixture)
      .step(async (_app: {}, ctx, next: Next<{ upper: string }>) =>
        next({ upper: (ctx.token ?? '').toUpperCase() }),
      )
      .step(async (_app: {}, ctx: { readonly upper: string }) => ctx.upper)

    expect(await h({}, { token: 'good', params: {} })).toBe('GOOD')
  })
})

// ── two different early values from one step ─────────────────────────────────
describe('a step that can stop two different ways', () => {
  it('accepts two DIFFERENT return values from one step — the union does not collapse', async () => {
    // Inferring from inside a union constituent makes TypeScript pick the
    // first candidate and reject the rest, so this is the case `Ret` being the
    // WHOLE return type exists for.
    const h = scope(fixture)
      .step(async (_app: {}, ctx, next: Next<{}>) => {
        if (ctx.token === null) return refused('anonymous')
        if (ctx.token === 'gone') return gone('token')
        return next({})
      })
      .step(async (_app: {}, _ctx: {}) => 'ok')

    expect(await h({}, { token: null, params: {} })).toMatchObject({ kind: 'refused' })
    expect(await h({}, { token: 'gone', params: {} })).toMatchObject({ kind: 'gone' })
    expect(await h({}, { token: 'good', params: {} })).toBe('ok')
  })
})

// ── a value on the success side ──────────────────────────────────────────────
// A leaf that succeeds AND has something to say about how the result should be
// rendered — the half `response`/`json` would be built on, on a real carrier.
// Worth its own block because it is where the price of ONE channel is visible:
// a value carrying its own domain value appears in what the scope yields, so a
// caller reads it directly rather than through a second branch.
describe('a value on the success side', () => {
  const served3 = scope(fixture).step(async (_app: {}, _ctx: {}) => served(3, 'cache'))

  it('carries the domain value alongside its own shape', async () => {
    const out = await served3({}, { token: null, params: {} })
    expect(out).toMatchObject({ kind: 'served', value: 3, at: 'cache' })
  })

  it('DOES appear in what the scope yields — the price of one channel, in the open', () => {
    // `Served<number>`, not `number`. With no second branch a value has
    // nowhere to be but the value itself, so a caller reading the domain value
    // goes through this shape first.
    const check = async () => {
      const out = await served3({}, { token: null, params: {} })
      expectTypeOf(out).toEqualTypeOf<Served<number>>()
    }
    expect(typeof check).toBe('function')
  })

  it('a plain value says nothing at all, which is the other case', async () => {
    const plain = scope(fixture).step(async (_app: {}, _ctx: {}) => 3)
    const out = await plain({}, { token: null, params: {} })
    expect(out).toBe(3)
  })
})

// ── a step that returns nothing ──────────────────────────────────────────────
// The silent one: forgetting `return` lets the inner steps run and throws their
// result away, and the run SUCCEEDS with `value: undefined`. Nothing is
// branded, so the terminal branch reads it as a domain value.
describe('a step that hands back nothing', () => {
  it('is REFUSED where it was written', () => {
    const refuse = () => {
      scope(fixture).step(
        // @ts-expect-error ⛔ this step returns nothing — did you forget `return`?
        async (_app: {}, _ctx: {}, next: Next<{ x: number }>) => {
          next({ x: 1 })
        },
      )
    }
    expect(typeof refuse).toBe('function')
  })

  it('and the mistake it prevents is a SUCCESS, which is why it is worth a gate', async () => {
    // the same step, forced past the gate the way plain JS would reach it
    const forgot = (async (_app: {}, _ctx: {}, next: Next<{ x: number }>) => {
      next({ x: 1 })
    }) as unknown as (app: {}, ctx: {}, next: Next<{ x: number }>) => Promise<number>

    const h = scope(fixture)
      .step(forgot)
      .step(async (_app: {}, ctx: { readonly x: number }) => `leaf saw ${ctx.x}`)

    const out = await h({}, { token: null, params: {} })
    // the leaf really ran and really produced a value — and it is gone
    expect(out).toBeUndefined()
  })

  it('lets a leaf with nothing to hand back say so DELIBERATELY', async () => {
    const h = scope(fixture).step(async (_app: {}, _ctx: {}) => undefined)
    const out = await h({}, { token: null, params: {} })
    expect(out).toBeUndefined()
  })

  it('and `null` is an ordinary domain value, not the mistake', async () => {
    const h = scope(fixture).step(async (_app: {}, _ctx: {}) => null)
    const out = await h({}, { token: null, params: {} })
    expect(out).toBeNull()
  })
})

// ── a step may not re-populate a ctx key ─────────────────────────────────────
// The types intersected where the runtime overwrote, and `never` made the
// disagreement silent: assignable to everything, so every later use compiled
// while the run handed back the second step's value. Refused now, because the
// difference between a refinement and a collision is intent and no type can
// read it — and because under parallel steps last-writer-wins is not even
// deterministic.
describe('two steps populating the same ctx key', () => {
  it('is REFUSED at the step that wrote the second, with the key named', () => {
    const refused = () => {
      scope(fixture)
        .step(async (_a: {}, _c: {}, next: Next<{ user: string }>) => next({ user: 'ada' }))
        // @ts-expect-error ⛔ this ctx key is already populated: user
        .step(async (_a: {}, _c: {}, next: Next<{ user: number }>) => next({ user: 42 }))
    }
    expect(typeof refused).toBe('function')
  })

  it('refuses a NARROWING too, which is the case an extension exists for', () => {
    // `{ id: string }` is a subtype of `unknown`, so this is a refinement and
    // not a collision — but the primitive cannot tell, and guessing is what the
    // gate refuses to do. The way to say it deliberately is a verb.
    const refused = () => {
      scope(fixture)
        .step(async (_a: {}, _c: {}, next: Next<{ body: unknown }>) => next({ body: {} }))
        // @ts-expect-error ⛔ this ctx key is already populated: body
        .step(async (_a: {}, _c: {}, next: Next<{ body: { id: string } }>) =>
          next({ body: { id: 'p1' } }),
        )
    }
    expect(typeof refused).toBe('function')
  })

  it('refuses the SAME step added twice, because the gate reads names and not types', () => {
    // The one case the gate refuses that was not broken: same key, same type,
    // so the second write is harmless. Refused anyway — adding a populating
    // step twice is a composition mistake either way (it runs for nothing), and
    // admitting it would mean comparing TYPES as well as names, which is the
    // more expensive machine this shape was chosen over.
    const withPage = async (_a: {}, _c: {}, next: Next<{ page: number }>) => next({ page: 3 })
    const refused = () => {
      // @ts-expect-error ⛔ this ctx key is already populated: page
      scope(fixture).step(withPage).step(withPage)
    }
    expect(typeof refused).toBe('function')
  })

  it('does NOT touch refining what the carrier brought, which `Ctx` already decides', async () => {
    // `token` is an ARGS key, not an acc one, so the gate never sees it and the
    // REFINE shape above is unaffected — pinned because it is the case that
    // would break if the gate read the wrong axis.
    const h = scope(fixture)
      .step(refineToken)
      .step(async (_a: {}, ctx: { readonly token: string }) => ctx.token)

    expect(await h({}, { token: null, params: {} })).toBe('anonymous')
  })
})

// ── the runtime halves of what `contract.test-d.ts` states as types ──────────
// They lived there as `expect(...)` calls, which never ran: a `*.test-d.ts` is
// typechecked and never executed. The TYPE claims stay there, where they
// belong; these are the halves that have to actually happen, because a type
// says nothing about what the runtime does when it gets there.
describe('what the type contract claims, happening', () => {
  it('a base that stops early hands its value back, rather than reaching the no-leaf throw', async () => {
    const base = scope(fixture).step(async (_app: {}, ctx, next: Next<{}>) =>
      ctx.token === null ? refused('anonymous') : next({}),
    )
    const out = await base({}, { token: null, params: {} })
    expect(out).toMatchObject({ kind: 'refused', why: 'anonymous' })
  })

  it('a leaf whose value has an index signature really hands that value back', async () => {
    // The other half of the `Passed` weak-type regression: the type side pins
    // that `ResultOf` is `Record<string, number>` and not `never`, and this
    // pins that the value arrives — which is what made the old bug a lie rather
    // than merely a wrong type.
    const tally = scope(fixture).step(
      async (_app: {}, _ctx: {}) => ({ hits: 1 }) as Record<string, number>,
    )
    expect(await tally({}, { token: null, params: {} })).toEqual({ hits: 1 })
  })
})
