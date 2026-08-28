import expressApp, { type Express, type RequestHandler } from 'express'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { z } from 'zod'
import { runScope, scope } from '@lntt/scope'
import type { Capability, CarrierGuard, DepGuard, Handler, IntentGuard, Outcome, RequestCarrier } from '@lntt/scope'
import { http, notFound } from '@lntt/scope/http'
import type { HttpIntent } from '@lntt/scope/http'
import { cookies, readCookies, type SetCookie } from '@lntt/scope/cookies'
import { readHeaders } from '@lntt/scope/headers'
import { app } from './bootstrap.ts'

// LEVEL TWO — @lntt/scope on top, with NO @lntt/integration anywhere. The
// package is not a dependency of this example at all, so the claim is checkable
// and not merely stated: a host lunette ships no adapter for is wired like this.
//
// Everything an adapter would give you is below, and it is about forty lines:
// lift the request into the carrier, call `runScope`, render the `Outcome`. The
// chain is already built (see `bootstrap.ts`), so there is not even a memo to
// keep — that part is the ES module's job here.

// ── the scopes ───────────────────────────────────────────────────────────────
// What level one did by hand, now declared: the input schema validates the
// route param (a bad one is a RETURNED 422), the missing note is a RETURNED
// abort rather than an `res.status(404)` buried in a handler, and the leaf is a
// plain function of its deps that no longer knows it is on the web.
type Notes = {
  list(): { id: string; text: string }[]
  byId(id: string): { id: string; text: string } | undefined
  add(text: string): { id: string; text: string }
}

export const listScope = scope().handle((deps: { notes: Notes }) => ({
  notes: deps.notes.list(),
}))

export const noteScope = scope()
  .extend(http)
  .params(z.object({ noteId: z.string().min(2) }))
  .handle((deps: { notes: Notes }, ctx) => {
    const note = deps.notes.byId(ctx.params.noteId)
    return note ? { note } : notFound({ missing: ctx.params.noteId })
  })

// A write that also sets a cookie — so the sink, and the capability that gates
// it, are part of what this hand-wired host has to render.
export const addScope = scope()
  .extend(http)
  .extend(cookies)
  .params(z.object({ text: z.string().min(1) }))
  .handle((deps: { notes: Notes }, ctx) => {
    const note = deps.notes.add(ctx.params.text)
    ctx.cookies.set('last-note', note.id, { path: '/', httpOnly: true })
    return { note }
  })

// ── the four things a host owes a scope ──────────────────────────────────────

// 1. the carrier: Express is not Fetch-based, so its request is lifted.
const toWebRequest = (req: expressApp.Request): Request => {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) for (const v of value) headers.append(key, v)
    else if (value !== undefined) headers.set(key, value)
  }
  const init: RequestInit & { duplex?: 'half' } = { method: req.method, headers }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    ;(init as { body?: unknown }).body = req
    init.duplex = 'half'
  }
  // `Host` is a client header; an app whose scopes read `ctx.request.url` beyond
  // its path should check it against the hosts it answers to.
  return new Request(new URL(req.originalUrl, `http://${req.headers.host ?? 'localhost'}`), init)
}

// 2. the cookie codec — eight lines over the shape the sink collects.
const serializeCookie = ({ name, value, options }: SetCookie): string => {
  const parts = [`${name}=${value}`]
  if (options.path !== undefined) parts.push(`Path=${options.path}`)
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`)
  if (options.httpOnly === true) parts.push('HttpOnly')
  return parts.join('; ')
}

// 3. the render: the whole host-facing contract of a scope. THREE branches,
// matching `Outcome` — the `invalid` case (a schema failure `runScope` itself
// caught, before any guard ran) is not optional: drop it and this stops being
// exhaustive over what a hand-wired host owes a scope.
const render = (res: expressApp.Response, outcome: Outcome<unknown, object>): void => {
  for (const [name, value] of readHeaders(outcome)) res.setHeader(name, value)
  for (const cookie of readCookies(outcome)) res.append('Set-Cookie', serializeCookie(cookie))

  if (outcome.ok) {
    res.status(200).json(outcome.value)
    return
  }
  if ('invalid' in outcome) {
    res.status(422).json({ issues: outcome.invalid.issues })
    return
  }
  const intent = outcome.abort.intent as HttpIntent
  if (intent.kind === 'redirect') {
    res.redirect(intent.status, intent.location)
    return
  }
  // `intent.kind === 'ok'` never reaches an ABORT (only `Ok`'s own success
  // side coins it) — what remains here is `status`.
  if (intent.kind === 'status' && intent.body !== undefined) res.status(intent.status).json(intent.body)
  else res.status(intent.status).end()
}

// 4. the mount, with the THREE brands — they ship from @lntt/scope, so a
// hand-wired host keeps its compile-time gates. `runFold`/`runScope` gate only
// capabilities (`CarrierGuard`); the intent gate is a MOUNT concern, the same
// as `@lntt/integration`'s hosts name their own (`IntentGuard`, `hono.ts`) —
// this host renders http's whole vocabulary, the same set an
// `@lntt/integration` HTTP mount would name.
type HostCaps = 'body' | 'cookies' | 'headers'
type HttpIntents = 'status' | 'redirect' | 'ok-status'
type App = typeof app

const handler =
  <Need extends object, S extends StandardSchemaV1, R, Cap extends Capability, Int extends PropertyKey>(
    h: Handler<Need, S, R, Cap, Int, {}> &
      DepGuard<App, Need> &
      CarrierGuard<Cap, HostCaps> &
      IntentGuard<Int, HttpIntents>,
  ): RequestHandler =>
  async (req, res): Promise<void> =>
    render(res, await runScope<RequestCarrier, S, R, HostCaps, {}, Cap>(h, app, { request: toWebRequest(req) }, {
      ...req.params,
      ...req.query,
    }))

export function makeApp(): Express {
  const server = expressApp()
  server.get('/notes', handler(listScope))
  server.get('/notes/:noteId', handler(noteScope))
  server.post('/notes', handler(addScope))
  return server
}
