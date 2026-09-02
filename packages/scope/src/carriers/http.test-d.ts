import { describe, expectTypeOf, it } from 'vitest'
import { scope, type IntentsOf, type Next, type ResultOf } from '../index.ts'
import { fixture, refused } from '../fixture/carrier.ts'
import {
  answered,
  forbidden,
  html,
  http,
  httpError,
  json,
  notFound,
  redirect,
  response,
  text,
  unauthorized,
  type HttpResponse,
  type HttpStatus,
  type Redirect,
  type RequestHead,
} from './http.ts'

// ── what a run on this carrier brings ────────────────────────────────────────
describe('the ctx `scope(http)` hands a step', () => {
  it('carries the request and the matched params, and both read-only', () => {
    scope(http).step(async (_app: {}, ctx, next: Next<{}>) => {
      expectTypeOf(ctx.request).toExtend<RequestHead>()
      expectTypeOf(ctx.params).toEqualTypeOf<Readonly<Record<string, string>>>()
      return next({})
    })
  })

  it('the request is HEADLESS — the body is not reachable from it', () => {
    scope(http).step(async (_app: {}, ctx, next: Next<{}>) => {
      // What survives: everything that is not the body.
      expectTypeOf(ctx.request.url).toEqualTypeOf<string>()
      expectTypeOf(ctx.request.method).toEqualTypeOf<string>()
      expectTypeOf(ctx.request.headers).toEqualTypeOf<Headers>()
      // What does not. The body reaches a scope only through a declared
      // extension (#62), and this is what makes that the ONLY way in.
      //
      // Written with the NAME on the left. The other way round —
      // `keyof RequestHead` not extending `'json'` — is true of any union with
      // more than one member, so it passes whether or not the body is still
      // reachable: coverage that reads right and checks nothing.
      expectTypeOf<'json'>().not.toExtend<keyof RequestHead>()
      expectTypeOf<'text'>().not.toExtend<keyof RequestHead>()
      expectTypeOf<'formData'>().not.toExtend<keyof RequestHead>()
      expectTypeOf<'arrayBuffer'>().not.toExtend<keyof RequestHead>()
      expectTypeOf<'blob'>().not.toExtend<keyof RequestHead>()
      expectTypeOf<'bytes'>().not.toExtend<keyof RequestHead>()
      expectTypeOf<'body'>().not.toExtend<keyof RequestHead>()
      expectTypeOf<'bodyUsed'>().not.toExtend<keyof RequestHead>()
      // `clone` returns a FULL request, so it is a body accessor by another
      // name and goes with them.
      expectTypeOf<'clone'>().not.toExtend<keyof RequestHead>()
      return next({})
    })
  })
})

// ── the words this carrier coins ─────────────────────────────────────────────
describe('every word `http` coins is accepted where it is written', () => {
  it('the refusals, which share one intent name', () => {
    const s = scope(http)
      .step(async (_app: {}, ctx, next: Next<{ readonly id: string }>) =>
        ctx.params['id'] === undefined ? notFound() : next({ id: ctx.params['id'] }),
      )
      .step(async (_app: {}, ctx, next: Next<{ readonly who: string }>) =>
        ctx.request.headers.get('authorization') === null ? unauthorized() : next({ who: 'u' }),
      )
      .step(async (_app: {}, ctx, next: Next<{}>) => (ctx.who === 'banned' ? forbidden() : next({})))
      .step(async (_app: {}, ctx) => (ctx.id === 'boom' ? httpError(503) : ctx.id.length))

    // FOUR constructors, ONE name: what a host must know how to render is a
    // status, and these differ in the number they carry.
    expectTypeOf<IntentsOf<typeof s>>().toEqualTypeOf<'status'>()
    expectTypeOf<ResultOf<typeof s>>().toEqualTypeOf<number | HttpStatus>()
  })

  it('the redirect, which carries its OWN name', () => {
    const s = scope(http)
      .step(async (_app: {}, ctx, next: Next<{}>) =>
        ctx.params['old'] === undefined ? next({}) : redirect('/new'),
      )
      .step(async (_app: {}, _ctx) => notFound())

    // Not folded into `status`: a host that renders status refusals may have
    // nowhere to send the caller, and a shared name would let it accept a
    // redirect it cannot express.
    expectTypeOf<IntentsOf<typeof s>>().toEqualTypeOf<'status' | 'redirect'>()
  })

  it('the success side, whose name is its own too', () => {
    const s = scope(http).step(async (_app: {}, _ctx) => json({ ok: true }, { status: 201 }))
    expectTypeOf<IntentsOf<typeof s>>().toEqualTypeOf<'ok-status'>()
    expectTypeOf<ResultOf<typeof s>>().toEqualTypeOf<HttpResponse<{ ok: boolean }>>()
  })

  it('and the sugar coins the same name the plain one does', () => {
    const s = scope(http).step(async (_app: {}, ctx) =>
      ctx.params['as'] === 'html' ? html('<p/>') : text('plain'),
    )
    expectTypeOf<IntentsOf<typeof s>>().toEqualTypeOf<'ok-status'>()
  })
})

// ── the gate, in both directions ─────────────────────────────────────────────
describe('a word belongs to the carrier that coined it', () => {
  it("refuses another carrier's word on an http scope", () => {
    const wrong = () => {
      // @ts-expect-error ⛔ this scope does not coin the word: refusal
      scope(http).step(async (_app: {}, _ctx: {}) => refused('not http'))
    }
    void wrong
  })

  it("refuses http's word on another carrier's scope", () => {
    const wrong = () => {
      // @ts-expect-error ⛔ this scope does not coin the word: status
      scope(fixture).step(async (_app: {}, _ctx: {}) => notFound())
    }
    void wrong
  })

  it('and a carrier-free scope coins nothing, so it refuses them all', () => {
    const wrong = () => {
      // @ts-expect-error ⛔ this scope does not coin the word: redirect
      scope().step(async (_app: {}, _ctx: {}) => redirect('/'))
    }
    void wrong
  })
})

// ── reading what came back ───────────────────────────────────────────────────
// The carrier's one assertion. What it must get right is the SUCCESS branch:
// the domain object lives INSIDE the success word, and that is where a
// decorator writing through what came back edits the app's own state.
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

  it('and through the domain object INSIDE the success word', () => {
    const write = () => {
      const seen = answered<Post>(null as never)
      if (typeof seen === 'object' && seen !== null && 'kind' in seen && seen.kind === 'response') {
        // @ts-expect-error — the view reaches the app's own object, not just the wrapper
        seen.value.title = 'edited'
      }
    }
    void write
  })

  it('and it names every word this carrier can have put in there', () => {
    expectTypeOf<ReturnType<typeof answered<Post>>>().toEqualTypeOf<
      Readonly<HttpStatus | Redirect | HttpResponse<Readonly<Post>> | Post>
    >()
  })
})

// A test that `scope(http).step(http)` is refused stood here and was removed:
// no mutation of this file could make it pass. It reads as pinning "a carrier
// is not a step" and pins nothing — `.step` wants a function, `HttpCarrier` is
// an object with two optional members, and even given a call signature the
// carrier is refused for RETURNING NOTHING rather than for being a carrier.
// What this carrier can actually get wrong on that axis is a runtime value,
// and that is pinned in `http.test.ts`.
describe('the words as values', () => {
  it('`response` carries the value it was given', () => {
    const r = response({ n: 1 })
    expectTypeOf(r.value).toEqualTypeOf<{ n: number }>()
  })
})
