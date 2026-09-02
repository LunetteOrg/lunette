import { describe, expectTypeOf, it } from 'vitest'
import { scope, type IntentsOf, type Next, type ResultOf } from '../index.ts'
import { http, json, notFound, redirect, type HttpResponse, type HttpStatus } from './http.ts'
import { notFound as rpcNotFound, trpc } from './trpc.ts'
import {
  answered,
  data,
  reactRouter,
  type RequestHead,
  type Redirect,
  type RouterData,
} from './react-router.ts'

describe('the ctx `scope(reactRouter)` hands a step', () => {
  it('is HTTP’s — a loader reads a request and the route params', () => {
    scope(reactRouter).step(async (_app: {}, ctx, next: Next<{}>) => {
      expectTypeOf(ctx.request).toExtend<RequestHead>()
      expectTypeOf(ctx.params).toEqualTypeOf<Readonly<Record<string, string>>>()
      return next({})
    })
  })

  it('and the request is headless here too', () => {
    expectTypeOf<'json'>().not.toExtend<keyof RequestHead>()
    expectTypeOf<'formData'>().not.toExtend<keyof RequestHead>()
  })
})

// ── it speaks HTTP, and one word more ────────────────────────────────────────
describe('the vocabulary', () => {
  it('coins every word `http` does — a 404 is a 404 here too', () => {
    const s = scope(reactRouter)
      .step(async (_app: {}, ctx, next: Next<{}>) =>
        ctx.params['old'] === undefined ? next({}) : redirect('/new'),
      )
      .step(async (_app: {}, ctx, next: Next<{ readonly id: string }>) =>
        ctx.params['id'] === undefined ? notFound() : next({ id: ctx.params['id'] }),
      )
      .step(async (_app: {}, ctx) => json({ id: ctx.id }))

    expectTypeOf<IntentsOf<typeof s>>().toEqualTypeOf<'redirect' | 'status' | 'ok-status'>()
  })

  it('and ONE of its own, which is why it is a carrier at all', () => {
    const s = scope(reactRouter).step(async (_app: {}, _ctx) => data({ title: 'a post' }, 200))
    expectTypeOf<IntentsOf<typeof s>>().toEqualTypeOf<'rr-data'>()
    expectTypeOf<ResultOf<typeof s>>().toEqualTypeOf<RouterData<{ title: string }>>()
  })
})

// ── the refusal that earns the carrier ───────────────────────────────────────
describe('a word belongs to the carrier that coined it', () => {
  it('refuses `data` on a plain http scope, and THAT is the whole reason', () => {
    // React Router earns its own carrier not because a 404 differs there, but
    // because this value goes back through RR7's own data pipeline, which no
    // other host can render. Said as a WORD, a host that cannot render it fails
    // to mount; said as a plain return value it would carry no intent, mount
    // clean on Hono, and break at runtime.
    const wrong = () => {
      // @ts-expect-error ⛔ this scope does not coin the word: rr-data
      scope(http).step(async (_app: {}, _ctx: {}) => data({ title: 'a post' }))
    }
    void wrong
  })

  it('and refuses it on an rpc scope for the same reason', () => {
    const wrong = () => {
      // @ts-expect-error ⛔ this scope does not coin the word: rr-data
      scope(trpc).step(async (_app: {}, _ctx: {}) => data({ title: 'a post' }))
    }
    void wrong
  })

  it("while rpc's own code is refused HERE", () => {
    const wrong = () => {
      // @ts-expect-error ⛔ this scope does not coin the word: code
      scope(reactRouter).step(async (_app: {}, _ctx: {}) => rpcNotFound())
    }
    void wrong
  })
})

// ── reaching what came back ──────────────────────────────────────────────────
// This carrier has TWO words carrying a domain object, so the read-only view
// has two places to reach into rather than one.
describe('`answered` hands back a read-only view', () => {
  interface Post {
    title: string
  }

  it('through the bare value', () => {
    const write = () => {
      const seen = answered<Post>(null as never)
      if (typeof seen === 'object' && seen !== null && 'title' in seen) {
        // @ts-expect-error — the view is read-only
        seen.title = 'edited'
      }
    }
    void write
  })

  it("through the domain object inside http's success word", () => {
    const write = () => {
      const seen = answered<Post>(null as never)
      if (typeof seen === 'object' && seen !== null && 'kind' in seen && seen.kind === 'response') {
        // @ts-expect-error — the view reaches the app's own object
        seen.value.title = 'edited'
      }
    }
    void write
  })

  it('and through the one inside `data`, which is the branch a loader takes', () => {
    const write = () => {
      const seen = answered<Post>(null as never)
      if (typeof seen === 'object' && seen !== null && 'kind' in seen && seen.kind === 'rr-data') {
        // @ts-expect-error — the view reaches the app's own object here too
        seen.value.title = 'edited'
      }
    }
    void write
  })

  it('and it names every word this carrier can have put in there', () => {
    expectTypeOf<ReturnType<typeof answered<Post>>>().toEqualTypeOf<
      Readonly<
        HttpStatus | Redirect | HttpResponse<Readonly<Post>> | RouterData<Readonly<Post>> | Post
      >
    >()
  })
})
