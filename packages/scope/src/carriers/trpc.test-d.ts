import { describe, expectTypeOf, it } from 'vitest'
import { scope, type IntentsOf, type Next, type ResultOf } from '../index.ts'
import { http, notFound as httpNotFound, redirect, response } from './http.ts'
import {
  answered,
  conflict,
  forbidden,
  notFound,
  tooManyRequests,
  trpc,
  unauthorized,
  unprocessableContent,
  type RequestHead,
  type RpcAbort,
  type RpcCode,
} from './trpc.ts'

describe('the ctx `scope(trpc)` hands a step', () => {
  it('carries the request and the call INPUT, which is its own way in', () => {
    scope(trpc).step(async (_app: {}, ctx, next: Next<{}>) => {
      expectTypeOf(ctx.request).toExtend<RequestHead>()
      // `unknown` until something narrows it: validation is per carrier and
      // arrives with #64, and a carrier that guessed a shape here would be
      // making a claim it cannot keep.
      expectTypeOf(ctx.input).toEqualTypeOf<unknown>()
      return next({})
    })
  })

  it('and the request is headless here too — the same type, a different owner', () => {
    expectTypeOf<'json'>().not.toExtend<keyof RequestHead>()
    expectTypeOf<'formData'>().not.toExtend<keyof RequestHead>()
    expectTypeOf<'clone'>().not.toExtend<keyof RequestHead>()
    // tRPC's body is the input envelope, and it belongs to the protocol rather
    // than to the app — so the headless request is not a restriction here, it
    // is a description.
    expectTypeOf<'url'>().toExtend<keyof RequestHead>()
  })
})

describe('the codes', () => {
  it('all six coin ONE name, because they all end at one translation point', () => {
    const s = scope(trpc)
      .step(async (_app: {}, ctx, next: Next<{ readonly who: string }>) =>
        ctx.request.headers.get('authorization') === null ? unauthorized() : next({ who: 'u' }),
      )
      .step(async (_app: {}, ctx, next: Next<{}>) => (ctx.who === 'banned' ? forbidden() : next({})))
      .step(async (_app: {}, ctx, next: Next<{}>) =>
        ctx.input === undefined ? unprocessableContent() : next({}),
      )
      .step(async (_app: {}, ctx, next: Next<{}>) => (ctx.who === 'busy' ? conflict() : next({})))
      .step(async (_app: {}, ctx, next: Next<{}>) =>
        ctx.who === 'noisy' ? tooManyRequests() : next({}),
      )
      .step(async (_app: {}, ctx) => (ctx.who === 'ghost' ? notFound() : ctx.who.length))

    // Unlike `http`, which splits `redirect` off: every word here becomes a
    // thrown `TRPCError` at the mount, so a host that renders one renders all.
    expectTypeOf<IntentsOf<typeof s>>().toEqualTypeOf<'code'>()
    expectTypeOf<ResultOf<typeof s>>().toEqualTypeOf<number | RpcAbort>()
    expectTypeOf<RpcAbort['intent']['code']>().toEqualTypeOf<RpcCode>()
  })
})

// ── across carriers, in BOTH directions ──────────────────────────────────────
describe('a word belongs to the carrier that coined it', () => {
  it("refuses http's refusal on an rpc scope", () => {
    const wrong = () => {
      // @ts-expect-error ⛔ this scope does not coin the word: status
      scope(trpc).step(async (_app: {}, _ctx: {}) => httpNotFound())
    }
    void wrong
  })

  it('refuses a redirect there, and that is the asymmetry itself', () => {
    // An RPC reply has nowhere to send the caller. This is why `http` gives
    // `redirect` its own name instead of folding it into `status`: the split
    // is what lets this refusal exist at all.
    const wrong = () => {
      // @ts-expect-error ⛔ this scope does not coin the word: redirect
      scope(trpc).step(async (_app: {}, _ctx: {}) => redirect('/elsewhere'))
    }
    void wrong
  })

  it('refuses an http success annotation there too', () => {
    // An RPC reply is the returned VALUE — there is no status line to annotate
    // and no headers to set, so this carrier coins no success word and this one
    // has nowhere to land.
    const wrong = () => {
      // @ts-expect-error ⛔ this scope does not coin the word: ok-status
      scope(trpc).step(async (_app: {}, _ctx: {}) => response({ n: 1 }))
    }
    void wrong
  })

  it("and refuses rpc's code on an http scope", () => {
    const wrong = () => {
      // @ts-expect-error ⛔ this scope does not coin the word: code
      scope(http).step(async (_app: {}, _ctx: {}) => notFound())
    }
    void wrong
  })
})

describe('`answered` hands back a read-only view', () => {
  interface Row {
    title: string
  }

  it('through the value, which is the only branch there is here', () => {
    // No success word on this carrier, so there is no domain object nested
    // inside one — the case `http`'s `answered` has to reach into does not
    // exist. What is left is the bare value and the codes.
    const write = () => {
      const seen = answered<Row>(null as never)
      if (typeof seen === 'object' && seen !== null && 'title' in seen) {
        // @ts-expect-error — the view is read-only
        seen.title = 'edited'
      }
    }
    void write
  })
})
