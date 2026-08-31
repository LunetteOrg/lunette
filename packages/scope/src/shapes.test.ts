import { describe, expect, expectTypeOf, it } from 'vitest'
import { scope } from './scope.ts'
import { code, fixture, gone, other, refused } from './fixture/carrier.ts'
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
// Populate a key the ctx ALREADY has, narrower. This is what `validate` is, and
// it is why `Ctx` is an override and not the intersection it looks like (§9):
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
// express this (#55), and it is the shape that replaced sinks: with the
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
// convention (principle 4), the same one wire's leaves follow.
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
    expect(out.ok && out.value).toBe('u1:hello')
    // the WRAP shape's after runs last, because it wraps the rest
    expect(log).toEqual(['in', 'out'])
  })

  it('the guard stops the fold WITH ITS WORD, and the wrap still sees it come back', async () => {
    log.length = 0
    const out = await noteScope(app, { token: null, params: {} })
    expect(out.ok).toBe(false)
    expect(!out.ok && 'abort' in out && out.abort.intent).toEqual({
      kind: 'refused',
      why: 'no session',
    })
    expect(log).toEqual(['in', 'out'])
  })

  it('a leaf returning a word stops on the word, not on a value', async () => {
    const empty: Repos = { ...app, notes: { byId: () => undefined } }
    const out = await noteScope(empty, { token: 'good', params: {} })
    expect(out.ok).toBe(false)
    expect(!out.ok && 'abort' in out && out.abort.intent).toEqual({ kind: 'gone', what: 'note' })
  })

  it('is the function that runs it AND still a builder', async () => {
    const out = await noteScope(app, { token: 'good', params: {} })
    // the words contribute no value: what a run YIELDS is the domain side only
    if (out.ok) expectTypeOf(out.value).toEqualTypeOf<string>()
    // and there is nothing to close, so more steps can still be added
    expectTypeOf(noteScope).toHaveProperty('step')
  })

  it('an inline step needs no annotation to read what the scope holds', async () => {
    const h = scope(fixture)
      .step(async (_app: {}, ctx, next: Next<{ upper: string }>) =>
        next({ upper: (ctx.token ?? '').toUpperCase() }),
      )
      .step(async (_app: {}, ctx: { readonly upper: string }) => ctx.upper)

    expect(await h({}, { token: 'good', params: {} }).then((o) => o.ok && o.value)).toBe('GOOD')
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
    // §1: inferring from inside a union constituent makes TypeScript pick the
    // first candidate and reject the rest, so this is the case that shape exists
    // for. Both words are the carrier's, so both are legal.
    const h = scope(fixture)
      .step(async (_app: {}, ctx, next: Next<{}>) => {
        if (ctx.token === null) return refused('anonymous')
        if (ctx.token === 'gone') return gone('token')
        return next({})
      })
      .step(async (_app: {}, _ctx: {}) => 'ok')

    expect((await h({}, { token: null, params: {} })).ok).toBe(false)
    expect((await h({}, { token: 'good', params: {} })).ok).toBe(true)
  })
})
