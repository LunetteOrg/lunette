# Scope runtime — design exploration

**Status:** open design exploration, *not* a decision. Feeds the umbrella
epic [#30 — Scope runtime: wire as a guest](https://github.com/LunetteOrg/lunette/issues/30),
which unifies request scope ([#5](https://github.com/LunetteOrg/lunette/issues/5))
and framework adapters ([#15](https://github.com/LunetteOrg/lunette/issues/15)).

Captured from a design session sparked by a real case: an auth flow where a
per-request guard (`requireAdmin(app, request)`) is repeated across ~20 route
loaders (forgetting it once is a security hole). This is the reasoning, not
a verdict — it reframes issue #5's open fork and leans it toward (a)/(b).

## Three postures

How does wire relate to the framework that holds the request?

1. **Wire `pipe`s and *owns the server*** — `@lntt/http` today:
   `chain.pipe(http).serve(honoEngine())`. Wire is the host.
2. **Wire is a *guest* that hands over ingredients** — bare leaves called by
   the framework's own middleware; wire stops at boot.
3. **Wire *grafts onto* the framework and owns a generic scope runtime** —
   the framework middleware is only the power socket. You no longer write
   RR7/Express middleware; you write handlers against our model, and a
   `toLoader`/`toAction`/`toExpress` adapter bolts them on. **This is the
   posture the exploration develops.**

## Not HTTP-specific — an *invocation* runtime, with the codec as a facet

The mechanism is not HTTP-shaped; it is **invocation-shaped**. Every scope is
one invocation carrying two independent facets:

- **deps DOWN** — typed per-invocation injection (session, current user,
  parsed event) layered over the build-tier singletons. *Always present.*
- **outcome UP** — a value that rises through an **outcome codec**: HTTP
  `return→200/4xx`, `throw→5xx`. *Optional.*

Making the codec a **pluggable facet** rather than a built-in Response shape
is what lets the same runtime serve more than HTTP — and designing for that
now keeps the HTTP kit from baking the Response assumption into the core.

The kinds, and how much of the mechanism each exercises:

| kind | host that hands over the invocation | deps DOWN | outcome codec |
|---|---|---|---|
| **request** (#5) | RR7 / Express middleware (`(args, next)`) | ✅ | HTTP `200/4xx/5xx` |
| **message** (#10) | a bus consumer with a handshake (Kafka `eachMessage`, a queue worker) | ✅ | `return→ack`, `throw→nack` |
| **fire-and-forget** | Node `EventEmitter` (`(payload) ⇒ void`) | ✅ | none — the degenerate kind |

Two things this table pins down:

- **Fire-and-forget is the degenerate kind**: it uses only the deps-down half
  (typed injection, `guard` short-circuit, per-invocation teardown) and has
  no codec, because nothing rises and no host awaits an outcome. Legitimate,
  and useful as a design constraint — it *forces* the codec to be optional.
- **`EventEmitter` is not the #10 host.** #10 needs a host that hands over the
  invocation *with an outcome handshake* (ack/nack); Node's fire-and-forget
  emitter gives no `next` to borrow and no outcome to map. A bus consumer is
  the real #10 host.

**Orchestration is a layer above, not inside.** An n8n-style flow — a DAG of
nodes, per-node retry, fan-out, data passed downstream — is *orchestration of
invocations*, which is [#11 (`@lntt/flow`)](https://github.com/LunetteOrg/lunette/issues/11).
The scope runtime executes **one** node (typed DI + `guard` + codec); the
flow wires nodes together. Keeping these separate stops the scope runtime
from growing a workflow engine it does not need.

**Discipline.** That request / message / fire-and-forget / flow all *rhyme*
is evidence the abstraction is sound — **not** a mandate to build them.
Commit **HTTP-first**; each new kind earns its code only with its own real
case (principle 5). The non-HTTP kinds here serve as proof the shape
generalizes and as the constraint that the codec must be pluggable.

## Two tiers, one accumulation model

The framing: *some deps are alive from build time, others are set at
runtime.* They are not two mechanisms — two **cadences** of the same
intersection accumulation, distinguished by lifetime:

| | tier 1 — build | tier 2 — scope |
|---|---|---|
| **seed** | `env` | the built app **+** the invocation (request/message) |
| **Ctx accumulated** | repos, services (singletons) | session, current user, parsed event |
| **lives** | until `dispose()` | one invocation, then teardown |
| **types** | intersection (today) | intersection (identical) |

The tier-2 chain reads tier 1 (to resolve `admin` you need
`adminSessionRepo`, a singleton). The handler sees the **typed union** of
both.

## The reduction: a scope *is* a chain

Reuses the documented "pass one chain's built app as another chain's seed"
pattern. The scope chain's `Seed = App & Invocation`; it `run`s once per
invocation (layers resolve per request, teardown per request); the app
singleton arrives as seed, not rebuilt. So Ctx-accumulation, seed-as-input,
and run-per-invocation all already exist.

## The one genuinely new verb: `guard`

A scope-tier layer that may **return a domain error to abort the scope** —
the codec maps it (401/redirect/dead-letter). This is the "middleware
pre-usecase". The boot chain has no need for it (a domain error at boot is
meaningless). `guard` **enriches `deps`, typed** (adds `admin`, `event`),
NOT a separate bag — so cadence stays invisible to the leaf, preserving the
principle that a use case declares deps without knowing or caring when they
were born (still testable with flat fakes).

**Prototype finding — `guard` is a typed fold, not a wire layer.** Building
the prototype (below) sharpened this: the return-to-abort **cannot** be a wire
`use`/`expose` layer, because the onion *requires* calling `next` and an abort
is a RETURNED value (a throw would be infrastructure). So the scope tier runs
as a **typed imperative fold** — enrichments accumulate per step (typing like
the boot chain, fork 1), a returned abort short-circuits. This confirms the
(a)/(b) verdict from the other direction: `guard` is a dialect over wire that
needs no core "third slot", and the fold is lighter than a per-request wire
chain (so the re-seed spike measured the heavier road).

## `scope` collapses to a namespace — retiring the third slot

The dead end that killed the two-argument handler: *everything can be a
dep*, including the raw request and the mutable output sink (`cookies.set`
is a value). So there is no structural second argument; `scope` is just a
namespace **inside `deps`** (project convention: "namespace = the patch's
shape"). Consequences:

- the leaf keeps the bare-leaf shape `(deps, ...args)` untouched;
- `Provided<All, Pub>` grows **no** third axis;
- two-tier typing is just **two ordinary two-axis chains**, the scope one
  seeded by the first's `Pub`.

This lands issue #5's fork on **(a)/(b), not (c)** — with `guard` as the
sole new surface. Transport coupling stays visible not by argument position
but by the destructured key: `({ scope }) => …` is as loud a signal as a
second argument.

## Frictions examined and cleared (no (c) trigger surfaced)

- **Who owns the call site.** A window presumes WE invoke `use`. Own-server
  (`@lntt/http`, worker): wire owns the loop, native fit. Guest with its own
  onion: **RR7 v7 middleware IS `(args, next) => …`** — already a window
  opener; `next` is the innermost `use`, the Response rises through its
  return. So `mount`/`to*` are thin — the host's onion is *borrowed*, not
  duplicated. Open edge: frameworks whose middleware is NOT an onion
  (Next.js route handlers, server components) have no `next` to borrow.
- **Commit/rollback gated on HTTP outcome.** Maps onto the error convention
  with no new mechanism: a returned domain `4xx` commits (validation writes
  stand), a thrown infra `5xx` rolls back. A returned `4xx` that must NOT
  commit would be the middleware a window cannot express — the (c) trigger —
  but none appeared in the admin flow.
- **`waitUntil`/deferred work.** Not a Response-up transform: a dep-DOWN
  handle in the `scope` namespace (`scope.waitUntil(...)`), used inside the
  leaf.

## The adapter surface (simulated)

`scopeFor(chain)` returns the kit bound once to the chain's `Pub` — App
**inferred**, no manual `typeof`. `mount` is the framework middleware: build
once (HMR promise-memo), hook `dispose` to shutdown, put the `Pub` in the
host context. `to*` translate the host's calling convention ↔ `(deps)`, run
the scope chain, and map the outcome through the kind's codec. The route
leaf is `(deps) => Response` with **no extra positional args** — route
params ride in the `scope` namespace.

```ts
// scope.ts — kit bound once to the chain's Pub (App inferred, no manual typeof)
export const { mount, guard, toLoader, toAction } = scopeFor(chain)

// root.tsx — build 1×, hook dispose, put the Pub in the host context
export const middleware = [mount]

// guards/admin.ts — the "middleware pre-usecase": enrich deps, or short-circuit
export const withAdmin = guard(async ({ adminUserRepo, scope }) => {
  const session = await readSession(scope.request)
  if (!session) return redirect('/auth/login')            // returned ⇒ 0 runs, leaf skipped
  const admin = await adminUserRepo.findById(session.adminUserId)
  return isError(admin) || !admin
    ? redirect('/auth/login')
    : { admin }                                           // typed enrichment: adds admin:AdminUser
})

// routes/courses.tsx — leaf is (deps) ⇒ Response; params ride in scope
export const loader = toLoader(withAdmin, ({ courses, admin, scope }) =>
  courses.list({ authorId: scope.params.author }))

// Express — SAME leaf, different adapter + codec:
// app.get('/courses', toExpress(withAdmin, ({ courses }) => Response.json(courses.list())))
```

The ~20 repeated `requireAdmin(app, request)` calls collapse: the guard is
IN the route signature, not forgettable. `toLoader` internals are
mechanical — read the built `Pub` from host context, build `scope =
{ request, params, cookies }`, run the scope chain (guards accumulate deps
or return-to-abort), call the leaf, map the outcome via the HTTP codec
(`return→200` +Set-Cookie · domain error→redirect/4xx · throw→5xx).

## Prototype: proven across three real hosts

A live prototype (`research/scope-runtime/`) implements this against **three
real hosts** — React Router 7, Hono, Express — with **one** guard/leaf model
carried unchanged by per-host adapters (`toLoader`/`toAction`, `toHono`,
`toExpress`) and a per-host outcome codec. Driven for real: an RR7 loader
invoked with a `Request`, a Hono `app.request()`, an Express server over a
socket + `fetch`. The central case is the ownership + prefetch guard
(`ownedCourse`): authenticate → resolve admin → prefetch the course and check
ownership, enriching `deps` (reused by the leaf, no refetch) or short-circuiting
`401/403/404`. It validates: the fluent stack (fork 1), the mutable
`scope.cookies` sink (fork 2), `guard` as a dialect fold (no core change,
fork 3), and the leaf seeing enrichments + scope but never the repos.

## Sub-decisions this opened (deferred)

- **`to*` handler surface.** Variadic `toLoader(g1, g2, leaf)` reads best,
  but accumulating types over a guard *tuple* is hard; fluent
  `scope().guard(g1).guard(g2).handle(leaf)` types like the boot chain (one
  intersection per step). **Owner's lean: variadic, but with fluent
  composition of the first argument** (compose the guard stack fluently,
  pass it as one argument to a variadic `to*`).
- **Output channel.** Mutable `scope.cookies` sink (read back by the codec)
  vs a richer `return { data, cookies }` that keeps `deps` immutable.
- **`guard` scope.** A core verb usable at BOTH cadences (a boot-time guard
  — "required env var missing" — may also make sense) or scope-tier only.
- **Perf: measured, gate cleared.** Feeding the whole app `Pub` as the scope
  chain's seed, once per route, was the one untested assumption. Spike
  (`test/limits/scope-reseed.spike.*`, a ~15-layer app):
  - **Type-level is linear at ~650 tsc instantiations per route.** K routes
    of 0 → 10 → 20 → 40 gave 121.7k → 132.7k → 139.3k → 152.4k instantiations;
    check time 0.31s → 0.35s. No super-linear blow-up — the cost is
    O(routes × app-size), not O(routes²).
  - **Runtime is ~1.2µs per invocation** — 20k build+run cycles of the
    re-seeded scope chain in 23ms.

  Both clear the gate: the strong-typed version is safe to pursue. The one
  remaining variable is **app size** — a larger `Pub` raises the per-route
  constant — so re-measure under a realistic app in the load tests (issue
  #12) before calling it settled at scale.
