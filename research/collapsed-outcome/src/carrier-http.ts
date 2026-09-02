// A CARRIER OF REALISTIC SIZE, written against the transparent kernel — the
// measurement the research deferred: how much of a real carrier is a WRAP that
// DECORATES, and therefore pays transparency's one cost.
//
// Not a shipped carrier. It has the STEPS a real one has, in the proportions a
// real one has them, and nothing else: no schema engine, no cookie parser, no
// Fetch types. What is being counted is the SHAPE of each step, and for that
// the bodies can be stubs.

import type { Coined, Next } from './kernel-transparent.ts'

// ── the carrier's outbound envelope ──────────────────────────────────────────
// One word covers every response the host has to build: `response(body, init)`,
// with the sugars over it. The intent names what RENDERING it takes, and the
// payload is that rendering's parameters — so 404 and 401 share `status` rather
// than coining a name each.
export interface Res extends Coined<{ readonly status: true }> {
  readonly kind: 'res'
  readonly intent: unknown
  readonly status: number
  readonly headers: Readonly<Record<string, string>>
  readonly body: unknown
}

export const res = (body: unknown, init?: { status?: number }): Res => ({
  kind: 'res',
  intent: { status: init?.status ?? 200 },
  status: init?.status ?? 200,
  headers: {},
  body,
})

export const notFound = (body: unknown): Res => res(body, { status: 404 })
export const unauthorized = (body: unknown): Res => res(body, { status: 401 })

export interface Redirect extends Coined<{ readonly redirect: true }> {
  readonly kind: 'redirect'
  readonly intent: unknown
  readonly to: string
  readonly headers: Readonly<Record<string, string>>
}

export const redirect = (to: string): Redirect => ({
  kind: 'redirect',
  intent: { to },
  to,
  headers: {},
})

// What ANY step on this carrier can hand back: one of its words, or a plain
// domain value the host renders with its default.
export type HttpWord = Res | Redirect
export type HttpBack<R = unknown> = HttpWord | R

export const isHttpWord = (x: unknown): x is HttpWord =>
  typeof x === 'object' && x !== null && 'kind' in x && (x.kind === 'res' || x.kind === 'redirect')

// ── THE ONE CAST IN THE WHOLE CARRIER ────────────────────────────────────────
// Transparency's cost, and the hypothesis this file exists to test: a decorating
// wrap is handed a `Passed` the type system declines to describe, so SOMETHING
// has to say what came back. That something is the carrier — it coined the
// words — and it says it ONCE, here, not at every wrap.
//
// Everything below is written against `HttpBack` and never sees `Passed`. Nor
// does this file IMPORT it: the cast is `as unknown as HttpBack`, which names
// only the carrier's own type. `noUnusedLocals` proved that by refusing the
// import — the marker is machinery the core never makes a carrier say.
// It also NORMALISES, and that is not a convenience — it is what makes a
// decorating step position-independent. Steps unwind innermost-first, so a
// decorator written before the leaf sees the leaf's raw value and would have
// nothing to attach a header to; a separate `normalise()` step would fix that
// only if the composer put it in exactly the right place, which is a rule
// nobody should have to know. Normalising HERE means every decorator is handed
// a word, wherever it sits, and none of them has to check.
export const decorating =
  (f: (out: HttpWord) => HttpWord) =>
  async (_app: {}, _ctx: {}, next: Next<{}>) => {
    const out = (await next({})) as unknown as HttpBack
    return f(isHttpWord(out) ? out : res(out))
  }

// ── the steps a carrier of this kind ships ───────────────────────────────────

// POPULATE — reads the run's arguments, adds an entry, calls `next`. Never sees
// what comes back.
export const params = (_names: readonly string[]) =>
  async (_app: {}, ctx: { readonly url: string }, next: Next<{ params: Readonly<Record<string, string>> }>) =>
    next({ params: { id: ctx.url.slice(1) } })

export const body = () =>
  async (_app: {}, _ctx: {}, next: Next<{ body: unknown }>) => next({ body: {} })

export const cookies = () =>
  async (_app: {}, ctx: { readonly cookie: string }, next: Next<{ cookies: Readonly<Record<string, string>> }>) =>
    next({ cookies: ctx.cookie === '' ? {} : { sid: ctx.cookie } })

// GUARD — enriches, or stops with one of the carrier's words. Also never sees
// what comes back.
export const authenticated = () =>
  async (_app: {}, ctx: { readonly cookies: Readonly<Record<string, string>> }, next: Next<{ user: string }>) =>
    ctx.cookies['sid'] === undefined ? unauthorized({ error: 'no session' }) : next({ user: ctx.cookies['sid'] })

// OBSERVE — wraps, and hands back exactly what it was given. Pays NOTHING:
// `Passed` travels through untouched, and the step never has to know what it is.
export const timed = (log: string[]) =>
  async (_app: {}, _ctx: {}, next: Next<{}>) => {
    const t = Date.now()
    const out = await next({})
    log.push(`${Date.now() - t}ms`)
    return out
  }

export const traced = (spans: string[]) =>
  async (_app: {}, _ctx: {}, next: Next<{}>) => {
    spans.push('open')
    const out = await next({})
    spans.push('close')
    return out
  }

// DECORATE — wraps and MODIFIES the outbound side. These are the ones that pay,
// and each is written against `HttpBack` because `decorating` already paid.
export const withHeader = (name: string, value: string) =>
  decorating((out) => ({ ...out, headers: { ...out.headers, [name]: value } }))

export const cors = (origin: string) =>
  decorating((out) => ({
    ...out,
    headers: { ...out.headers, 'access-control-allow-origin': origin },
  }))

export const setCookie = (c: string) =>
  decorating((out) => ({ ...out, headers: { ...out.headers, 'set-cookie': c } }))

// ── the carrier declaration ──────────────────────────────────────────────────
export interface HttpArgs {
  readonly url: string
  readonly cookie: string
}

export const http = {} as {
  readonly __args?: HttpArgs
  readonly __vocabulary?: { readonly status: true; readonly redirect: true }
}
