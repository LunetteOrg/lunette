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

| kind | host that hands over the invocation | deps DOWN | outcome codec (error convention §3) |
|---|---|---|---|
| **request** (#5) | RR7 / Express middleware (`(args, next)`) | ✅ | result→`2xx` · abort→`redirect/4xx` · throw→`5xx` |
| **message** (#10) | a bus consumer with a handshake (Kafka `eachMessage`, a queue worker) | ✅ | result→`ack` · abort→`ack + dead-letter` · throw→`nack` |
| **fire-and-forget** | Node `EventEmitter` (`(payload) ⇒ void`) | ✅ | none — the degenerate kind |

The message codec's **abort→ack+dead-letter** is the subtle one: a returned
domain rejection means the message *was* processed and must NOT be retried
(retrying a domain failure cannot help — same as an HTTP `4xx` committing),
but it is flagged to a dead-letter for inspection; only a THROWN infra error
nacks for retry. This output codec is proven in the prototype
(`integrations/job-codec.*`): the same host-agnostic `Outcome` the HTTP codec
renders is mapped to a bus ack — evidence the codec is a swappable facet. What
remains for #10 is generalizing the INPUT payload (an HTTP `Request` → a bus
`Message`); the request-shaped scope is the one HTTP assumption still baked in.

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

## Sub-decisions — resolved

Sparred out after the prototype; these are the verdicts to implement next
round (with the bootstrap replica as the real-chain proving ground). The
current prototype demonstrates the core (fold, three hosts, codec facet); the
typed-params / fragment / host-context refinements below are the target it
evolves toward.

- **Packaging — `scopeFor` + per-host packs.** `scopeFor(chain)` stays the
  host-agnostic primitive (`{ guard, handle }`) where shared handlers are
  defined once. Each host pack — `reactRouter(chain)` / `hono(chain)` /
  `express(chain)`, imported from `@lntt/http/*` — wraps it with that host's
  codec and lifecycle. The core never imports a framework (principle 6); the
  `to*` "come from scope" via the per-host pack, not a free function.
- **Lifecycle — `mount` via the host context.** The host pack takes the
  **chain** and owns build-once (promise-memo per isolate, ADR #12). `mount`
  is the framework middleware you register once; it reads the **host context**
  (`c.env` on Cloudflare, a preceding middleware, static `env` on node),
  seeds the build from it, and puts the built app in the host context; the
  `to*` read it back. This unifies static-env (seed at build) and dynamic-env
  (seed at first request from `c.env`) under one path — exactly the
  boot / first-request / per-request cadence split this doc asks decision 7 to
  make.
- **Handler = fragment, adapter = mount.** The handler is kept ABSTRACT (a
  fragment declaring its requirements), not bound to a concrete app up front.
  Its two requirement kinds are checked when it is mounted at the adapter:
  app **deps** against the chain's `Pub`, and **params** against the route.
  So a missing dep or a wrong param name is a compile error AT `toHono` /
  `toLoader`, not at runtime — the type contract (principle 1) extended to the
  scope tier, mirroring wire's Seed-vs-Ctx mount check (decision 31). Bonus:
  abstract handlers are testable with flat fakes, no app (principle 4).
- **`to*` handler surface — fluent stack, variadic-2 adapter.** `guard`
  composes a stack fluently (one intersection per step, like the boot chain —
  the tuple-accumulation of a pure variadic is the hard, costly path); the
  composed stack passes as ONE argument to a 2-arg `to*`. Proven in the
  prototype.
- **Params — the bare-leaf's second arg, typed by annotation.** Not a
  separate `kit.params<P>()`: params ARE the `(deps, params)` args, declared by
  annotation like a layer's `ctx`, unified across the stack into `P`. Guards
  and leaf both read them (the ownership guard needs `courseId`). Params are
  the handler's **Seed**; deps are its requirement — same two-axis shape as a
  chain. Per host:
  - **Hono** — inherit Hono's own path-param types (`Handler`'s path generic);
    Hono owns the routing, we reconcile the declared params against it.
  - **Express** — Express types params as `Record<string,string>`, so we parse
    the path ourselves via template-literal types: a typed-params feature
    Express does not natively have (or plain routing if they skip the types).
  - **RR7** — routing is external (typegen `Route.LoaderArgs`); the handler
    declares required params and we reconcile against `Route.LoaderArgs` at the
    route module. Same error-at-binding, different source of truth.
- **Output channel — mutable `scope.cookies` sink.** The leaf's RETURN stays
  the domain result; cookies ride an opt-in sink the codec reads back (not a
  `return { data, cookies }` envelope that would pollute every handler's return
  type). Proven in the prototype.
- **`guard` scope — dialect, scope-tier only.** Return-to-abort has meaning
  only where a codec maps it; a boot-time domain error is meaningless (a
  missing env is infra → throw). No core verb, no third slot. Confirmed by the
  prototype finding: `guard` is a typed fold over wire, not a wire layer.
- **Non-HTTP — HTTP-first, generalizes, build at #10.** The output codec is a
  proven facet (message-bus `ack/nack/dead-letter` above); the design position
  is closed. Building a listener adapter waits for #10's real bus case
  (principle 5); the remaining work is the input-payload generalization
  (`Request` → `Message`).
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
