import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { scope } from '../index.ts'
import { fail, guards, type StandardSchemaV1 } from './index.ts'

// The three verbs are ONE machine at runtime, so what has to actually run is:
// the addition arrives, a failure hands back what `onError` built and the steps
// after it never run, and a refinement really replaces rather than merges.

describe('`guard`: adds an entry, or stops with what `onError` built', () => {
  it('adds what the check returned, and the step after it reads it', async () => {
    const h = scope<{ readonly token: string | null }>()
      .extend(guards)
      .guard(
        (_app: {}, { token }) => (token === null ? fail() : { actor: token }),
        () => 'refused' as const,
      )
      .step(async (_app: {}, { actor }) => `hello ${actor}`)

    expect(await h({}, { token: 'ada' })).toBe('hello ada')
  })

  it('hands back what `onError` built, and the steps after it never run', async () => {
    let reached = false

    const h = scope<{ readonly token: string | null }>()
      .extend(guards)
      .guard(
        (_app: {}, { token }) =>
          token === null ? fail([{ message: 'unauthorized' }]) : { actor: token },
        (issues) => ({ error: issues[0]?.message }),
      )
      .step(async (_app: {}, { actor }) => {
        reached = true
        return actor
      })

    expect(await h({}, { token: null })).toEqual({ error: 'unauthorized' })
    expect(reached).toBe(false)
  })

  it('hands `onError` the ctx, which is how it answers in the host\'s own door', async () => {
    const h = scope<{ readonly token: string | null; readonly route: string }>()
      .extend(guards)
      .guard(
        (_app: {}, { token }) => (token === null ? fail() : { actor: token }),
        (_issues, { route }) => `denied at ${route}`,
      )
      .step(async (_app: {}, { actor }) => actor)

    expect(await h({}, { token: null, route: '/posts' })).toBe('denied at /posts')
  })

  it('declares what it needs of the app, exactly as a step does', async () => {
    const h = scope<{ readonly id: string }>()
      .extend(guards)
      .guard(
        ({ users }: { readonly users: Record<string, string> }, { id }) =>
          users[id] === undefined ? fail() : { name: users[id] },
        () => null,
      )
      .step(async (_app: {}, { name }) => name)

    expect(await h({ users: { u1: 'Ada' } }, { id: 'u1' })).toBe('Ada')
  })
})

describe('`refine`: replaces an entry the ctx already holds', () => {
  it('replaces it, and the step after reads the new value', async () => {
    const h = scope<{ readonly raw: string }>()
      .extend(guards)
      .refine('raw', (_app: {}, { raw }) => raw.trim().toUpperCase(), () => null)
      .step(async (_app: {}, { raw }) => raw)

    expect(await h({}, { raw: '  ada  ' })).toBe('ADA')
  })

  it('replaces rather than merges — one key, the new value', async () => {
    const h = scope<{ readonly n: string }>()
      .extend(guards)
      .refine('n', (_app: {}, { n }) => Number(n), () => null)
      .step(async (_app: {}, ctx) => ctx)

    expect(await h({}, { n: '42' })).toEqual({ n: 42 })
  })

  it('stops with `onError` when the check fails', async () => {
    const h = scope<{ readonly n: string }>()
      .extend(guards)
      .refine(
        'n',
        (_app: {}, { n }) => (Number.isNaN(Number(n)) ? fail([{ message: 'not a number' }]) : Number(n)),
        (issues) => ({ error: issues[0]?.message }),
      )
      .step(async (_app: {}, { n }) => n)

    expect(await h({}, { n: 'nope' })).toEqual({ error: 'not a number' })
  })
})

describe('`validate`: `refine` with the check given by a schema', () => {
  const post = z.object({ title: z.string(), tags: z.array(z.string()) })

  it('refines the entry to the schema\'s output', async () => {
    const h = scope<{ readonly body: unknown }>()
      .extend(guards)
      .validate('body', post, (issues) => ({ error: 'invalid', issues }))
      .step(async (_app: {}, { body }) => body.title.toUpperCase())

    expect(await h({}, { body: { title: 'hello', tags: ['a'] } })).toBe('HELLO')
  })

  it('hands the schema\'s own issues to `onError`, and the leaf never runs', async () => {
    let reached = false

    const h = scope<{ readonly body: unknown }>()
      .extend(guards)
      .validate('body', post, (issues) => ({ error: 'invalid', count: issues.length }))
      .step(async (_app: {}, { body }) => {
        reached = true
        return body.title
      })

    expect(await h({}, { body: { title: 7 } })).toEqual({ error: 'invalid', count: 2 })
    expect(reached).toBe(false)
  })

  it('works against ANY implementation of the spec, not just zod', async () => {
    // The spec is inlined rather than imported, so what has to hold is that a
    // schema satisfies it STRUCTURALLY. A hand-written one proves the shape;
    // the zod cases above prove a real library still fits it.
    const evenNumber: StandardSchemaV1<unknown, number> = {
      '~standard': {
        version: 1,
        vendor: 'handwritten',
        validate: (value) =>
          typeof value === 'number' && value % 2 === 0
            ? { value }
            : { issues: [{ message: 'not an even number' }] },
      },
    }

    const h = scope<{ readonly n: unknown }>()
      .extend(guards)
      .validate('n', evenNumber, (issues) => issues[0]?.message)
      .step(async (_app: {}, { n }) => n * 2)

    expect(await h({}, { n: 4 })).toBe(8)
    expect(await h({}, { n: 3 })).toBe('not an even number')
  })
})

describe('a THROW is never caught: it stays infrastructure', () => {
  it('propagates out of the fold instead of reaching `onError`', async () => {
    let onErrorRan = false

    const h = scope<{}>()
      .extend(guards)
      .guard(
        () => {
          throw new Error('the connection died')
        },
        () => {
          onErrorRan = true
          return 'invalid'
        },
      )
      .step(async () => 'never')

    await expect(h({}, {})).rejects.toThrow('the connection died')
    expect(onErrorRan).toBe(false)
  })
})

describe('the extension adds no step of its own', () => {
  it('`.extend` grows the builder, and only a verb CALL grows the fold', () => {
    const bare = scope<{}>()
    const extended = bare.extend(guards)

    expect(extended.steps).toHaveLength(0)
    expect(extended.guard(() => ({}), () => null).steps).toHaveLength(1)
  })
})
