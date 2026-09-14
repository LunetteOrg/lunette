---
title: "The scope builder: `scope(profile)` over an agnostic base; carriers are `*Carrier`"
area: scope-runtime
status: accepted
---

# The scope builder: `scope(profile)` over an agnostic base; carriers are `*Carrier`

**Decision.** The request-handler builder in `@lntt/scope` — previously
`fragment()` — is named `scope()`, aligning the abstraction with the package it
headlines: you declare a `scope` (an input contract + a guard chain + a leaf)
and mount it on a host. The runtime environment types it runs in — previously
`RequestScope` / `JobScope` — are renamed `RequestCarrier` / `JobCarrier`: they
are the host's transport (a `Request` + cookie sink, a `Message` + sink), the
thing prose already called "the carrier", NOT the DI scope. Freeing "scope" for
the builder and standardising the environment as `*Carrier` removes an existing
ambiguity rather than adding one.

Carriers are injected as EXTENSIONS through a fluent `.extend(ext)`, and no
carrier is the privileged default:

- **`scope()`** — the carrier-agnostic base (`.input`/`.guard`/`.handle`). `ctx`
  exposes only the validated `params` + guard enrichments — no `request`, no
  `cookies`, no `.body`/`.form`. A
  scope that stays within this surface is portable across ANY host (all four HTTP
  hosts today, the bus at #10). The moment a guard reaches for `ctx.request` it
  does not typecheck — the compiler steers you to `.extend(request)` (principle 1).
  SUPERSEDED on both counts by [the vocabulary a carrier owns](./carrier-owns-vocabulary-out-core-coins.md): `.input` is a carrier's verb, so the
  agnostic base has no input channel and no way to abort either, and `ctx.request`
  now comes from the carrier that has one rather than from a shared extension.
- Carriers are injected as THREE tree-shakable extensions, each mapping to a host
  boundary tRPC actually has (it reads headers, but has no readable body and drops
  `Set-Cookie`):
  - **`@lntt/scope/request`** — `ctx.request` (read headers/session). Read-only,
    NO capability → mounts everywhere, tRPC included.
  - **`@lntt/scope/body`** — `.body`/`.form` + the `body` capability → gated off
    tRPC ([the capability gate](./carrier-capabilities-gate-host-portability-body.md)).
  - **`@lntt/scope/cookies`** — the `Set-Cookie` sink `ctx.cookies` + the `cookies`
    capability → gated off tRPC.
  An app that only uses `scope()` imports none of them; each subpath bundles only
  when injected.

**Why three, not one bundle.** A scope authored for tRPC is `scope().extend(request)`
— it cannot call `.body` (the method is not on the builder) and has no `ctx.cookies`,
so a body/cookie mistake is IMPOSSIBLE by construction, not merely caught late at
the mount. Splitting `request` (read) from `body`/`cookies` (write, gated) puts the
protection at authoring. The `cookies` capability also fixes a pre-existing smell:
tRPC silently DROPPED `Set-Cookie`; now a cookie scope is a compile error there.

An extension is DEFINED BY FOUR DECLARATIVE AXES, none named by the core: fluent
`methods` (`body`'s `.body`/`.form`), `__ctx` (extra ctx fields — `request`,
`cookies`), `__need` (extra app deps), `__caps` (capabilities — `'body'`,
`'cookies'`, the [capability gate](./carrier-capabilities-gate-host-portability-body.md)). The core reads each axis back generically off the
builder and composes; nothing is baked into the base. Real apps compose several —
a login scope is `scope().extend(body).extend(cookies)` — exercising the very
multi-extension composition the array approach could not do (alternative (j)).

**No `guard` override, and multiple extensions COMPOSE.** The builder is
this-based: every method takes an explicit `this: Self` and returns `Self &
<delta>`, so `guard` (defined ONCE) preserves every injected extension's methods
through the chain — no per-carrier `guard` override. Two method-adding extensions
(`.extend(request).extend(sse)`) compose: both method-sets survive, `Acc`/`Need`
accumulate by intersection, `Cap` as a union (an object-map read with `keyof`),
and `.handle` extracts a CONCRETE `Handler` the adapters consume. The one idiom
the whole builder follows is `this: Self` (it sidesteps TypeScript's `this`-type
query restrictions); fluent method SIGNATURES stay hand-written interfaces
(TypeScript cannot synthesise a generic method like `body<B>` from data), while
ctx/deps/caps are pure phantom data.

**`.extend` also gates incompatibility, the way [key collisions are
forbidden](./key-collisions-forbidden-two-levels.md).** An extension lists its method
names in `__methods`; `.extend` rejects a second extension that redefines one
(`.extend(request).extend(evil)` where `evil` also declares `body`) as a COMPILE
ERROR at the `.extend` call, naming the method — the same "collisions are compile
errors naming the key" contract as the chain's key-collision guard.

A new carrier (the bus at #10) is a NEW SUBPATH — a value + its extension
interface — with ZERO change to the core `scope`, `Scope`, or `ScopeExtension`
(principle 6 / [dialects via `pipe`](./dialects-via-pipe-never-verbs-grafted.md), open-closed made literal). The agnostic base never sees the
request methods, in the types OR at runtime.

**Alternatives.** (a) `pipeline` — describes the guard→leaf mechanism but is
crowded (CI/data-eng) and undersells the input contract. (b) `handler` —
collides with the leaf-naming convention (`feedHandler`, `postHandler` are the
LEAVES) and with the adapters' `w.handler` mount factory. (c) Keep `fragment` —
neutral but not self-describing, collides for the web audience (React
`<Fragment>`, GraphQL fragment, URL fragment), AND overloads the wire
feature-module sense of "fragment"; the rename disambiguates both. (d) Keep
"scope" meaning the carrier (`RequestScope`) and name the builder otherwise —
rejected: `RequestScope` is the carrier/transport (prose already says
"carrier"), so `*Carrier` is the more accurate home and "scope" belongs to the
declared handler. (e) A bare `scope()` defaulting to `RequestCarrier` — rejected:
it privileges HTTP and limits extensibility; the profile must always be
explicit. (f) `scope(http)` as the label — rejected for `scope().extend(request)`: tRPC
(RPC, not "http") also rides the request carrier, so "http" is dissonant; the
label names the CARRIER, and the non-HTTP profile will be `scope(bus)`. (g) A
separate `scope(trpc)` profile — rejected: tRPC shares `RequestCarrier` with the
HTTP hosts and differs only by CAPABILITY (no readable body), which [the capability gate](./carrier-capabilities-gate-host-portability-body.md) already
gates at the mount site; it is not a distinct carrier or builder surface. (h) A
config-object `scope({ http })` injecting verbs — rejected as adjacent to
"verbs grafted into the core" ([dialects via `pipe`](./dialects-via-pipe-never-verbs-grafted.md)). (i) A per-carrier builder interface
(`RequestScope extends Scope<RequestCarrier>`) selected by the entry — rejected:
it forces a `guard` override in every method-adding carrier (to keep `.body`/
`.form` through the chain), and two such carriers do NOT compose (the return face
is a union, neither method callable). (j) A config-object entry
`scope({ exts: [request] })` deriving the face from the extension list — same
composition failure as (i) (`StartOf<E>` unions the faces), and no per-step hook
to detect incompatible extensions. Both (i) and (j) were built and measured
before `.extend`; the this-based `.extend` composes AND gates, the way [key collisions are
forbidden](./key-collisions-forbidden-two-levels.md). (k) A keyed
registry augmented via `declare module` — composes, but the global augmentation
is magic and its errors route through a registry indirection (worse than the
this-based idiom).

**Why.** `.extend` is the extensibility seam: fluent, composable, and the natural
per-step hook for the incompatibility gate ([key collisions forbidden on two
levels](./key-collisions-forbidden-two-levels.md)). `.body`/`.form` live exactly
where the carrier supports them (the `request` extension), answering "these
methods are HTTP-only" at the extension level instead of leaking onto a generic
surface. The [capability gate](./carrier-capabilities-gate-host-portability-body.md) stays intact and necessary: within the shared
`RequestCarrier`, it is what rejects a `.body` scope on tRPC at
`toProcedure`/`toMutation`. The removed `scopeFor` primitive (exported, unused —
YAGNI) and the carrier-parametrised `fragmentFor` are both absorbed by the
extension model. The accepted cost: the builder is this-based with phantom
accumulators (cleverer than plain type params), disciplined by the single
`this: Self` idiom.

**Open follow-up.** When the bus lands (#10), `.extend(bus)` joins as a
`JobCarrier` extension (its own subpath). A scope that reads `ctx.request` WITHOUT declaring `.body` carries no
capability, so a bus adapter cannot gate it by capability alone — decide there
whether the bus mount simply refuses request-carrier handlers, or whether
reading `request` needs its own capability. Left until the real case (principle
5).
