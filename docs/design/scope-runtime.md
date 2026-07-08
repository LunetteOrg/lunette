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
   per-host adapter (`toLoader`/`toAction`, Hono `wire`, an Express
   registrar) bolts them on. **This is the
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
meaningless). `guard` **enriches the handler `ctx`, typed** (adds `admin`, `event`) — the
next guard and the leaf read it back merged into `ctx`, so the cadence stays
invisible: a use case declares the deps it calls without knowing or caring
when the enrichments were born (still testable with flat fakes).

**Prototype finding — `guard` is a typed fold, not a wire layer.** Building
the prototype (below) sharpened this: the return-to-abort **cannot** be a wire
`use`/`expose` layer, because the onion *requires* calling `next` and an abort
is a RETURNED value (a throw would be infrastructure). So the scope tier runs
as a **typed imperative fold** — enrichments accumulate per step (typing like
the boot chain, fork 1), a returned abort short-circuits. This confirms the
(a)/(b) verdict from the other direction: `guard` is a dialect over wire that
needs no core "third slot", and the fold is lighter than a per-request wire
chain (so the re-seed spike measured the heavier road).

## No third slot — but the handler is `(deps, ctx)`

Two questions were resolved together. First, the scope tier needs **no
third axis** on `Provided`: `guard` runs as a typed fold beside wire, not
as a core onion return, so `Provided<All, Pub>` stays two-axis and the
request-time Response channel reserved in decision 3 is never spent here.

Second — and this REVERSED an earlier "everything is a dep, scope is a
namespace inside `deps`" sketch — the handler settled on **two arguments,
`(deps, ctx)`**:

- **`deps`** is the handler's OWN app requirement, in a DEDICATED first
  slot. Keeping it separate is not cosmetic: `Need` must stay recoverable
  at the adapter to be reconciled against the chain's `Pub`, and a bag
  merged with the carrier is not subtractable. Deps are declared inline and
  structural (`{ sessionRepo: SessionRepo }`, not a `Pick` from a global
  Services type) — lighter, and identical to a wire bare leaf's deps.
- **`ctx`** is the carrier (`request` + `cookies` for HTTP, `message` +
  `cookies` for the bus) MERGED with the validated `params` (at
  `ctx.params`) MERGED with every prior guard enrichment.

So the leaf reads `ctx.request` / `ctx.params.courseId`, never a `scope`
namespace. This lands issue #5's fork on **(a)/(b), not (c)** — `guard` is
the sole new surface, and two-tier typing is still **two ordinary two-axis
chains**, the scope one seeded by the first's `Pub`.

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

## The adapter surface

A per-host pack — `reactRouter(chain)` / `hono(chain)` / `express(chain)`,
plus the tRPC wrappers — takes the **chain** (App **inferred**, no manual
`typeof`), owns build-once, and hands back that host's surface. `mount` is
the framework middleware registered once: it seeds the memoized build from
the host context and stashes the built app there for the per-handler
functions to read back. The handler is an abstract **fragment** — it
declares its input with ONE `.input(schema)`, and each guard/leaf is
`(deps, ctx)`. The pack reconciles the handler's `deps` against the chain's
`Pub` and its params against the route, at compile time, at the adapter.

```ts
// example.ts — one handler, abstract (bound to NO app), reused by every host
export const courseSchema = z.object({ courseId: z.string() })

const authGuard = ({ sessionRepo }: { sessionRepo: SessionRepo }, ctx: RequestScope) =>
  authenticate(sessionRepo, ctx.request)                  // enrich { session } or return Abort

const adminGuard = ({ adminRepo }: { adminRepo: AdminRepo }, ctx: { session: Session }) =>
  resolveAdmin(adminRepo, ctx.session.userId)             // enrich { admin } or return Abort

const courseGuard = (
  { courseRepo }: { courseRepo: CourseRepo },
  ctx: { admin: Admin; params: { courseId: string } },   // params come from .input
) => resolveCourse(courseRepo, ctx.params.courseId, ctx.admin.id) // enrich { course } or Abort

// The leaf IS the use case: it declares the SERVICE it calls (a Need, like a
// guard), reads the prefetched enrichment from ctx, returns Result | Abort.
const courseLeaf = ({ courseView }: { courseView: CourseView }, ctx: { course: Course }) =>
  courseView.detail(ctx.course)

export const courseHandler = fragment()
  .input(courseSchema)
  .guard(authGuard)
  .guard(adminGuard)
  .guard(courseGuard)
  .handle(courseLeaf)

// scope.ts — one pack per host, taking the chain (App inferred)
const web = reactRouter(chain, seedFrom)   // { guard, handle, toLoader, toAction, mount, dispose }
const api = hono(chain, seedFrom)          // { mount, wire, dispose }

// root.tsx — register mount ONCE
export const middleware = [web.mount]

// routes/courses.tsx — the leaf never changes across hosts
export const loader = web.toLoader(courseHandler)

// api.ts (Hono) — native chaining keeps hc<typeof app>() typed (input + output)
app.get('/courses/:courseId', ...api.wire(courseHandler))
```

The ~20 repeated `requireAdmin(app, request)` calls collapse: the guard is
IN the route signature, not forgettable. The `to*` internals are mechanical
— read the built `Pub` from the host context, build the carrier + validated
`params` + cookie sink, run the fold (guards accumulate enrichments or
return-to-abort), call the leaf, map the outcome via the host's codec
(`return→200` +Set-Cookie · domain abort→redirect/4xx · throw→5xx).

## Prototype: proven across four real hosts

A live prototype (`research/scope-runtime/`) implements this against **four
real hosts** — React Router 7, Hono, Express, and tRPC — with **one**
guard/leaf model carried unchanged by per-host adapters and a per-host
outcome codec. Driven for real: an RR7 loader invoked with a `Request`, a
Hono `app.request()`, an Express server over a socket + `fetch`, and a tRPC
`createCaller`. The central case is the ownership + prefetch stack
(`courseHandler`): authenticate → resolve admin → prefetch the course and
check ownership, enriching `ctx` (reused by the leaf, no refetch) or
short-circuiting `401/403/404`. It validates: the fluent stack (fork 1), the
mutable `ctx.cookies` sink (fork 2), `guard` as a dialect fold (no core
change, fork 3), the `(deps, ctx)` split with the leaf declaring its own
`Need`, the `.input` schema feeding every host's native validator, and — the
adversarial crux — that both `hc<typeof app>()` (Hono) and the tRPC typed
client survive the model end to end, input AND output.

## Sub-decisions — settled

Sparred out and then verified against the prototype (`research/scope-runtime/`,
four real hosts). These are the verdicts the real packages implement.

- **`.input(schema)` — the fragment's ONE input contract.** A fragment
  declares its input with a single Standard Schema
  ([standardschema.dev](https://standardschema.dev) v1 — zod, Valibot and
  ArkType all implement it; the core types depend only on
  `@standard-schema/spec`, type-only, with NO hard zod dependency). From that
  one schema flow three things: (a) the params type `OutputOf<schema>` that
  every guard and the leaf read as `ctx.params`; (b) the native validator each
  host registers (Hono's `sValidator`, tRPC's `.input`, our own RR7/Express/bus
  runtime validation); (c) runtime coercion + validation → a RETURNED **422
  domain abort** on failure, never a throw (a bad input is a domain outcome,
  decision 14). `.input` is reachable only as the FIRST call and fixes the
  schema once — "one input contract per fragment", enforced at the type level.
  This REPLACES the earlier "params typed by per-guard annotation": one schema
  is the single source of truth, and it is the same object the native
  validators consume, so the fragment and the host's validator cannot diverge.
- **Handlers are `(deps, ctx)`; the leaf declares its own deps.** Both guard
  and leaf take two arguments. `deps` is the handler's OWN app requirement,
  declared inline and structural (`{ sessionRepo: SessionRepo }`, not a `Pick`
  from a global) in a DEDICATED first slot — so `Need` stays recoverable at the
  adapter (a merged bag is not subtractable). `ctx` is the carrier + validated
  `params` + prior enrichments, merged. The LEAF now declares its own deps too
  (new): the leaf IS the use case — it declares the services it calls (e.g.
  `{ courseView }`), which accumulate into `Need` and reconcile against the
  chain's `Pub` exactly like a guard. This dissolves the earlier "leaf never
  sees the app → trivial leaf / forced abort" seam. Guards stay for
  cross-cutting concerns (authentication, authorization, resource
  extraction/prefetch); the leaf calls use cases. `guard` returns
  `Enrich | Abort`; the leaf returns `Result | Abort`.
- **Handler = fragment, checked at the adapter.** The handler is kept ABSTRACT
  (a fragment bound to NO concrete app). Its requirement kinds are checked when
  it meets the adapter: app **deps** against the chain's `Pub` (by a brand,
  `DepGuard`), and route **params** against the host's own route type. A
  missing dep or a wrong param name is a compile error AT the adapter, not at
  runtime — the type contract (principle 1) extended to the scope tier,
  mirroring wire's Seed-vs-Ctx mount check (decisions 7/8). Abstract handlers
  are testable with flat fakes, no app (principle 4).
- **The seeding cadences collapse to two; the request window nests the
  transaction window.** `mount` does first-request build-once EVERYWHERE
  (Node, Bun/Elysia, Cloudflare Workers): `seedFrom(hostContext)` reads
  `process.env` on Node or `c.env` on a Worker, and the build is memoized per
  isolate (Node may warm it eagerly at boot — opt-in, not a separate cadence).
  The second tier is per-request: the scope window (the guard/leaf fold). The
  request window (outer) and a transaction window (inner) compose only through
  the error convention. This is **decision 33**.
- **Per-handler model EVERYWHERE — no central registrar.** Each host has ONE
  function that consumes a fragment, used with the host's NATIVE routing. This
  is what lets DIFFERENT CHAINS coexist in one app: each pack's `mount` stashes
  its built app under a distinct context key, and each route picks its chain
  via the per-handler function. The forms differ per host by necessity (each
  framework's type-level routing differs):
  - **Hono** — `app.get(path, ...w.wire(handler))`: native chaining, a native
    validator (from the fragment's schema) and `c.json`, which preserves
    `hc<typeof app>()` fully typed (input + output). The spread injects
    `[validator, terminalHandler]`.
  - **Express** — `app.get(path, w.handler(handler))`: a per-handler
    `RequestHandler` on native `app.get`. No registrar (so different chains can
    serve routes on one app) and no compile-time path check — params are
    validated at RUNTIME (a returned 422 on failure). The deps-vs-Pub brand
    still fires at the `w.handler(...)` call site.
  - **React Router 7** — `web.toLoader(handler)` / `web.toAction(handler)` in
    the route module; routing is external (file-based, RR7 typegen types the
    params); runtime validation via the schema.
  - **tRPC** — `toProcedure(t.procedure, handler)`: ONE call, NO annotations. It
    consumes the whole fragment into a native `t.procedure.input(schema)
    .query(resolver)`, where the resolver runs OUR fold (guards inside), throws
    `TRPCError` on abort, and returns `R`. tRPC infers input from `.input` and
    output from the resolver's `R`, so the typed `AppRouter` / caller / client
    is preserved — VERIFIED (type-level load-bearing + runtime). The lower-level
    `guard` / `leaf` wrappers stay exported for hand-assembled procedures.
    Honest caveat: a RequestScope fragment consumed by tRPC needs the tRPC
    context to provide the carrier's fields (e.g. a `request`) — natural for
    tRPC-over-HTTP.
- **RPC preservation is the crux.** Both `hc<typeof app>()` (Hono) and the tRPC
  typed client survive the model end to end (input AND output), verified
  adversarially with degrade checks. The mechanism: NEVER wrap the router;
  contribute only the terminal handler / procedure into the host's native
  assembly, sharing ONE schema (from the fragment) so the native validator and
  the fragment cannot diverge.
- **`to*` handler surface — fluent stack.** `guard` composes a stack fluently
  (one intersection per step, like the boot chain — the tuple-accumulation of a
  pure variadic is the hard, costly path); the composed fragment passes as ONE
  argument to the per-handler function. Proven in the prototype.
- **Output channel — mutable `ctx.cookies` sink.** The leaf's RETURN stays the
  domain result; cookies ride an opt-in sink the codec reads back (not a
  `return { data, cookies }` envelope that would pollute every handler's return
  type). Proven in the prototype.
- **`guard` scope — dialect, scope-tier only.** Return-to-abort has meaning
  only where a codec maps it; a boot-time domain error is meaningless (a
  missing env is infra → throw). No core verb, no third slot. Confirmed by the
  prototype finding: `guard` is a typed fold over wire, not a wire layer.
- **Packaging — `@lntt/scope` + `@lntt/integration/*`.** The plan for the real
  packages: `@lntt/scope` is the framework-free core (fragment, `.input`,
  guard/handle, `runFold`/`runScope`, abort, `Outcome`, `DepGuard`; only the
  `@standard-schema/spec` type-dep). `@lntt/integration` is ONE package with
  tree-shakable SUBPATHS — `@lntt/integration/hono`, `/express`,
  `/react-router`, `/trpc` — with optional peer deps per framework. The old
  `@lntt/http` pipe-based pattern (decision 11) is retired/superseded. The
  bus/listener is out of scope here — it goes to `@lntt/listener` (issue #10).
  Naming note: the Hono pack's `wire` method name is flagged for a later rename
  (it is ambiguous with the library name `@lntt/wire`) — an open naming choice,
  not urgent.
- **Non-HTTP — HTTP-first, generalizes, build at #10.** The output codec is a
  proven facet (message-bus `ack/nack/dead-letter`); the design position is
  closed. Building a listener adapter waits for #10's real bus case
  (principle 5); the remaining work is the input-payload generalization
  (`Request` → `Message`), for which `fragmentFor` already swaps the carrier
  (`JobScope`) and `runJob` reruns the same `runFold`.
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
