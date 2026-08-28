// THE FOUR MISTAKES, and what the compiler says about each. This file is the
// point of the prototype: read the `@ts-expect-error` comments as the messages
// a user would see. Remove one and the build fails — which is how each of these
// was verified rather than assumed.
import { describe, it } from 'vitest'
import { scope } from './scope.ts'
import { http, json, notFound, redirect } from './http.ts'
import { rpc } from './rpc.ts'
import * as api from './rpc.ts'
import { route, toProcedure } from './mounts.ts'
import { FakeRouter } from './router.ts'
import { postIdSchema } from './app.ts'

// ── mistake 1: using a verb the scope never declared ─────────────────────────
// You imported `notFound` and never extended the carrier that coins it. The
// error names the intent and lands on THE GUARD ITSELF:
//
//   ⛔ this scope does not declare the intent: status —
//      did you forget to .extend() the carrier that coins it?
//
const m1 = scope()
  // @ts-expect-error the scope never extended a carrier coining 'status'
  .guard(() => notFound())
  .handle(() => ({ ok: true }))

// ── mistake 1b: the same, in a BASE that never calls .handle ─────────────────
// This is why the gate rides the argument and not the return type. A base —
// extends and guards, reused by many routes, which is the shape `gated()` has
// in a real app — is a perfectly ordinary thing to export. With the check on
// the return type this line compiles clean and the mistake resurfaces later, in
// whichever file finally calls `.handle`, pointing at a guard its author never
// wrote. Here it fires where the wrong verb was actually used.
const m1b = scope()
  // @ts-expect-error a base swallows nothing: the guard is wrong right here
  .guard(() => notFound())

// The cure is the extend, and nothing else changes.
const fixed1 = scope()
  .extend(http)
  .guard(() => notFound())
  .handle(() => ({ ok: true }))

// ── mistake 2: mounting a scope on a host that cannot render its intent ──────
// Here the scope is RIGHT: it declared what it uses, and on HTTP it is correct.
// Only the pairing is wrong, so the error is at the mount and cannot be earlier.
//
//   ⛔ this host cannot render the intent: redirect
//
const redirecting = scope()
  .extend(http)
  .params(postIdSchema)
  .guard(() => redirect('/login'))
  .handle(() => ({ ok: true }))

const m2ok = route('/posts/:postId', redirecting)
// @ts-expect-error an RPC reply has nowhere to redirect to
const m2 = toProcedure(redirecting)

// ── mistake 3: a success status on a host with no status line ────────────────
// `json(v, 201)` coins its OWN intent rather than reusing the abort side's
// 'status'. Sharing them would have let RPC — which does translate status
// aborts into codes — silently accept a 201 it cannot express.
//
//   ⛔ this host cannot render the intent: ok-status
//
const created = scope()
  .extend(http)
  .params(postIdSchema)
  .handle(() => json({ id: '1' }, 201))

const m3ok = route('/posts/:postId', created)
// @ts-expect-error an RPC reply carries no status
const m3 = toProcedure(created)

// ── mistake 4: the wrong carrier's word ──────────────────────────────────────
// `notFound` exists in both vocabularies and means the same thing to a reader —
// but they are different words, and mixing them is caught.
const mixed = scope()
  .extend(rpc)
  .input(postIdSchema)
  // @ts-expect-error this scope extended `rpc`, so HTTP's 'status' is undeclared
  .guard(() => notFound())
  .handle(() => ({ ok: true }))

// The rpc word on the rpc scope mounts, as it should.
const m4fixed = toProcedure(
  scope()
    .extend(rpc)
    .input(postIdSchema)
    .guard(() => api.notFound())
    .handle(() => ({ ok: true })),
)

// ── mistake 5: declaring the gate away by naming the type arguments ──────────
// Decision 34 had to close exactly this hole on the capability axis: a caller
// who names a mount's type arguments by hand must not be able to satisfy a
// brand the inferred call would have failed. The same applies here, and it is
// why the gate's internals live on type-alias defaults rather than on the
// method's own parameter list — a defaulted parameter there IS overridable.
const m5 = scope()
  .extend(rpc)
  .input(postIdSchema)
  // @ts-expect-error naming the parameters does not make HTTP's word declared
  .guard<ReturnType<typeof notFound>>(() => notFound())

// ── mistake 6: the route pattern and the schema disagree ─────────────────────
// Two independent declarations that nothing kept aligned. Today renaming the
// route param compiles on EVERY host and fails at runtime with a 422 — verified
// by renaming `:postId` to `:wrongName` in examples/hono and getting no error
// at the mount at all.
const forRoute = scope()
  .extend(http)
  .params(postIdSchema)
  .handle((ctx) => ({ echo: ctx.params.postId }))

const r6ok = route('/posts/:postId', forRoute)

// @ts-expect-error ⛔ this route has a param the schema does not declare: wrongName
const r6a = route('/posts/:wrongName', forRoute)

// @ts-expect-error ⛔ the schema declares a param this route does not have: postId
const r6b = route('/feed', forRoute)

// Both directions again, on a two-param route.
// @ts-expect-error the schema knows nothing about `commentId`
const r6c = route('/posts/:postId/comments/:commentId', forRoute)

// ── and it must survive the SPREAD, which is how it is actually written ──────
// `app.get(...route(path, scope))` is the whole ergonomic claim: one pattern,
// handed to the framework to match AND to the gate to check. If the gate only
// fired on a bare `route(...)` call and went quiet once spread into a
// registration, it would be checking a shape nobody writes.
const goodApp = new FakeRouter().get(...route('/posts/:postId', forRoute))

const badApp = new FakeRouter().get(
  // @ts-expect-error ⛔ this route has a param the schema does not declare: nope
  ...route('/posts/:nope', forRoute),
)

// ── and what it must NEVER do: reject a route it cannot read ─────────────────
// A pattern using a construct the reader does not model goes OPAQUE, and an
// opaque pattern is not checked at all. Catching less is fine; rejecting a
// valid route is not — two of the three bugs found writing this were exactly
// that, so these are the cases that keep it honest.
const w1 = route('/wild/*', forRoute) //            Hono wildcard
const w2 = route('/files/*path', forRoute) //       Express 5 wildcard
const w3 = route('/users{/:id}', forRoute) //       Express 5 optional group
const w4 = route('/x/:id(\\d+)', forRoute) //        an inline regex group
declare const dynamicPath: string
const w5 = route(dynamicPath, forRoute) //          not a literal at all

// ── what still works, unchanged ──────────────────────────────────────────────
// A scope that never aborts declares nothing and mounts everywhere.
const agnostic = scope()
  .extend(http)
  .params(postIdSchema)
  .handle((ctx) => ({ echo: ctx.params.postId }))
const anywhere = route('/posts/:postId', agnostic)

describe('the four mistakes', () => {
  it('are all compile errors', () => {
    void m1
    void m1b
    void m2
    void m3
    void m4fixed
    void m5
    void fixed1
    void mixed
    void m2ok
    void m3ok
    void anywhere
    void r6ok
    void r6a
    void r6b
    void r6c
    void w1
    void w2
    void w3
    void w4
    void w5
    void goodApp
    void badApp
  })
})
