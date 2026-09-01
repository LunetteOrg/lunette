import { describe, expect, expectTypeOf, it } from 'vitest'
import { scope } from './scope.ts'
import {
  code, fixture, gone, isWord, other, refused, served,
  type Refusal, type Served,
} from './fixture/carrier.ts'
import type { Word } from './step.ts'
import type { Next } from './step.ts'

// THE SHAPES A STEP TAKES — one per thing a step is for. There is no category
// here and no phase: every one is the same primitive, and each runs where it
// was written. What tells them apart is which of the five things it says, and
// that is visible in the signature every time.
//
// Read them for what is NOT in them. No step builds an outcome, none casts, and
// none mentions a brand: a step hands back the result of `next`, a WORD from
// the carrier, or a plain domain value, and the fold normalises whichever
// arrives. The words come from `fixture/carrier.ts`, exactly as a real scope
// imports `unauthorized`/`redirect` from `@lntt/scope/http` — and the scope is
// started with THAT carrier, `scope(fixture)`, which is what makes the words
// legal here: a carrier is chosen exactly once, and coining is its job.

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
// Enrich, or STOP WITH A WORD. The two exits are the whole shape, and the name
// is for the shape and not for authorization — one that never stops is the
// degenerate case of the same thing.
//
// Stopping is RETURNING THE WORD. Nothing is constructed and nothing is cast,
// so the word keeps its own type all the way out — which is where the builder
// reads the intents a scope can produce: off the return type, never from inside
// an outcome that already erased them.
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
// The leaf itself is ONLY a leaf: a value, or a word. That is the entire
// convention, the same one wire's leaves follow: a RETURNED error is domain, a
// THROWN one is infrastructure.
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

  it('the guard stops the fold WITH ITS WORD, and the wrap still sees it come back', async () => {
    log.length = 0
    const out = await noteScope(app, { token: null, params: {} })
    expect(isWord(out)).toBe(true)
    expect(out).toMatchObject({ kind: 'refused', intent: { why: 'no session' } })
    expect(log).toEqual(['in', 'out'])
  })

  it('a leaf returning a word stops on the word, not on a value', async () => {
    const empty: Repos = { ...app, notes: { byId: () => undefined } }
    const out = await noteScope(empty, { token: 'good', params: {} })
    expect(out).toMatchObject({ kind: 'gone', intent: { what: 'note' } })
  })

  it('is the function that runs it AND still a builder', async () => {
    const out = await noteScope(app, { token: 'good', params: {} })
    // What a run yields is EVERY type its steps hand back, words included:
    // with one channel there is nowhere else for them to be, and reading the
    // union is how a caller learns what this scope can say (§42).
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

// ── the word is the DECLARATION ──────────────────────────────────────────────
// A step's return type carries the word it can produce, so the builder reads
// what a scope may emit off the step itself — no second place to state it, and
// nothing to keep aligned. This is what a raw step could not do while it had to
// hand back a pre-built outcome: the word was cast away before the builder saw
// it, and a raw step contributed nothing at all.
describe('what a scope may say, read off the steps', () => {
  it('refuses a word the carrier does not coin, where the step is WRITTEN', () => {
    const refuse = () => {
      // @ts-expect-error ⛔ this scope does not coin the word: code
      scope(fixture).step(async (_app: {}, _ctx, _next: Next<{}>) => code(1))
    }
    expect(typeof refuse).toBe('function')
  })

  it('refuses it in a BASE too — not deferred to whichever file finally uses it', () => {
    const refuse = () => {
      const base = scope(fixture).step(authenticated)
      // @ts-expect-error ⛔ the gate rides the argument, so it fires here
      base.step(async (_app: {}, _ctx, _next: Next<{}>) => code(1))
    }
    expect(typeof refuse).toBe('function')
  })

  it('takes the word from a RAW step, not only from a leaf', () => {
    const refuse = () => {
      // the same word on the other carrier, which coins `code` and not `refusal`
      // @ts-expect-error ⛔ this scope does not coin the word: refusal
      scope(other).step(async (_app: {}, _ctx, _next: Next<{}>) => refused('no'))
    }
    expect(typeof refuse).toBe('function')
  })

  it('accepts two DIFFERENT words from one step — the union does not collapse', async () => {
    // Inferring from inside a union constituent makes TypeScript pick the
    // first candidate and reject the rest, so this is the case that shape exists
    // for. Both words are the carrier's, so both are legal.
    const h = scope(fixture)
      .step(async (_app: {}, ctx, next: Next<{}>) => {
        if (ctx.token === null) return refused('anonymous')
        if (ctx.token === 'gone') return gone('token')
        return next({})
      })
      .step(async (_app: {}, _ctx: {}) => 'ok')

    expect(isWord(await h({}, { token: null, params: {} }))).toBe(true)
    expect(isWord(await h({}, { token: 'gone', params: {} }))).toBe(true)
    expect(await h({}, { token: 'good', params: {} })).toBe('ok')
  })
})


// ── the SUCCESS side of a word ───────────────────────────────────────────────
// A leaf that succeeds AND has something to say about how the result should be
// rendered. It is the other half of the same mechanism the aborts use, and the
// half `response`/`json` will be built on — so the fold's `ok` normalisation is
// exercised here rather than waiting for its first real producer.
describe('a word on the success side', () => {
  const served3 = scope(fixture).step(async (_app: {}, _ctx: {}) => served(3, 'cache'))

  it('carries the intent while the VALUE stays the domain`s', async () => {
    const out = await served3({}, { token: null, params: {} })
    expect(out).toMatchObject({ kind: 'served', value: 3, intent: { at: 'cache' } })
  })

  it('DOES appear in what the scope yields — the price of one channel, in the open', () => {
    // `Served<number>`, not `number`. With no second branch a word has nowhere
    // to be but the value, so a caller reading the domain value goes through
    // the carrier first. That is the cost §42 accepted, and it is the same cost
    // that makes every refusal legible in the scope's own type.
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
    // Nothing was added on the way out — a plain value arrives as itself, so a
    // carrier asking whether this is one of its words gets a straight no and
    // the host's default applies.
    expect(isWord(out)).toBe(false)
  })
})

// ── forgetting to declare the name fails CLOSED ──────────────────────────────
// A carrier declares a word by writing its TYPE, and the name lives in `Word`'s
// parameter. Written WITHOUT it, `Word` means "an intent nobody declared": its
// key is `__unknown_intent`, which no carrier coins, so the gate refuses it.
// Left to the constraint instead the name would be `keyof object`, which is
// `never` — a word declaring nothing and therefore admitted by every gate,
// which is fail-OPEN.
describe('a word whose name was never declared', () => {
  const improvised = (): Word => ({ intent: { kind: 'improvised' } })
  const declared = (): Word<{ readonly refusal: true }> => ({ intent: { kind: 'improvised' } })

  it('is REFUSED by the carrier that does not coin it', () => {
    const refuse = () => {
      // @ts-expect-error ⛔ this scope does not coin the word: __unknown_intent
      scope(fixture).step(async (_app: {}, _ctx: {}) => improvised())
    }
    expect(typeof refuse).toBe('function')
  })

  it('and the same word DECLARED passes, so the gate is reading the name', () => {
    scope(fixture).step(async (_app: {}, _ctx: {}) => declared())
    expect(true).toBe(true)
  })
})

// ── a step that returns nothing ──────────────────────────────────────────────
// The silent one: forgetting `return` lets the inner steps run and throws their
// result away, and the run SUCCEEDS with `value: undefined`. Nothing is
// branded, nothing is a word, so the terminal branch reads it as a domain value.
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
