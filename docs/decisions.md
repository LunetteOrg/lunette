# Design decisions

The record of every significant decision, the alternatives considered,
and why they were discarded. The "why nots" matter as much as the "whys":
they are the defense against re-proposing the same ideas later. Format:
**Decision · Alternatives · Why**.

---

## The core shape

### 1. The core is a builder chain

**Decision.** Dependencies compose through a chained builder
(`lunette().use(...).provide(...).expose(...)`).

**Alternatives.** (a) A functional pipe — `compose(layer1, layer2, ...)`
in a single call: proven viable (inference holds), but it requires one
overload per arity, a permanent structural cost. (b) Order-free layers
with runtime `requires` keys and topological resolution: order
independence, but requirements end up declared twice (runtime key list +
type annotation) with no way to enforce consistency — kept alive as
[`research/order-free-layers/`](../research/order-free-layers/), prior
art for parallel boot. (c) An Effect-style tag registry: exactly the
ceremony this project exists to avoid.

**Why.** The chain has the best inference ergonomics, the simplest
internal types, and its linear order doubles as the topological sort —
checked by the compiler, performed by the human.

### 2. Patch types flow through `next`'s return

**Decision.** `next` is itself generic and returns the patch it receives;
the patch type P surfaces in the layer's **return type**.

**Alternatives.** Typing the patch as a parameter of `next` declared in
the layer signature — the patch then sits in a contravariant position
where TypeScript's inference degrades to `unknown`.

**Why.** Return-position inference is reliable. This one trick is the
foundation of the whole API's "no annotations needed" property.

### 3. `next` returns an opaque token and is mandatory

**Decision.** `next` returns `Provided<P>`, an opaque branded token; a
layer can only produce one by calling `next`.

**Why.** Forgetting to call `next` becomes a compile error instead of a
silently broken chain. The token is also the natural passage point for a
response value if a request-time axis is ever added.

**Updated by 26.** The token's second slot is now the public subset
(`Provided<All, Pub>`); the reserved Response channel, if it ever lands,
becomes the third slot (`Provided<All, Pub, R>`).

---

## Keys, visibility, composition

### 4. Key collisions are forbidden, on two levels

**Decision.** Providing a key that already exists is a compile-time error
naming the key, plus a runtime throw as a safety net. Convention: one
top-level key per area. The diagnostic lands on the verb's **argument**
(the exact colliding line; the chain keeps typing past it), not on its
return type — decided in discussion #21, evidence in
`packages/wire/test/chain/collision-guard-dx.test-d.ts`.

**Alternatives.** (a) Allowing the collision: TypeScript intersections
merge object types *deeply* while runtime spreads replace keys
*wholesale* — the type would promise both areas while the runtime kept
one (see `packages/wire/test/chain/why-collision-guard.test.ts` for the
demonstration). (b) Deep merge at runtime: murky semantics over class
instances, closures and functions — the kind of magic tag registries
exist to avoid. (c) A namespace API (`module(name, fn)`): tried, then
removed (see 6). (d) On the diagnostic's location: the return-type guard
shipped first (one verb late, TS7006 cascade, emoji escaped in the
property name) and the candidates rejected in #21 — string-literal
argument constraint (reduces to `never`), overload mismatch, poisoned
chain, editor tooling, type-aware lint.

**Why.** The types must never lie; refusing the case where they would is
cheaper than modeling it. The accepted trade of the argument-side guard
(#21): past the red line the collided key's accumulated type is
transiently wrong, in-editor only — the build stays red at the
collision, so no green program ever lies.

**The brand property is a private `unique symbol`** (same idiom as
`providedBrand`), not a string name: a string-keyed brand can be
satisfied by writing the exact message into the patch, and it competes
with a legitimate domain key of the same name. A symbol nobody can name
is unforgeable short of a cast (which defeats any guard, the old
return-type one included) and never meets user keys. Diagnostics print
`[collision]` / `[requirement]`.

**Scope rule.** Brand only where the type system is mute: the mount
check relates two inferred type parameters, so it has no structural
sentence of its own — the brand gives it one. `bind`'s requirements need
none: the binder's parameter is the real intersection of leaf deps, and
plain assignability already names the missing keys with their true
shapes. Where the type works, let it speak; recite only where it cannot.

**`any` is refused by name.** `keyof any` is every key, so a context
degraded to `any` (an untyped seed, an untyped provider return one verb
earlier) made the guard flag EVERY key as "already present" — red for
the wrong reason, a message asserting a falsehood (PR #26 review).
A guard that cannot check must say so: every guard (collision,
keyed, override) now answers an any context with one message —
`⛔ context degraded to any: the guard cannot check keys — restore a
real type`. The degradation points themselves cannot go red on their own
line, because `any` absorbs every brand intersection (`any & Brand =
any`): an any PATCH is silent where it happens and honest at the next
wiring line. The one exception is `override`: its guard
sits on the RETURN type, where nothing absorbs, so an any patch IS
refusable at its own line — `⛔ patch degraded to any: …` — instead of
reporting the degraded input's artifacts (`numeric ${number}`,
`missing ${string}`) as real findings. Residual: an any KEY mints an
index-signature context (not `any`), whose phantom "already present"
stays consistent with what the wrong type claims — pinned in the
contract, runtime nets underneath. Detection note: the canonical
`0 extends 1 & T` idiom goes blind through a constrained class type
parameter, and the `keyof` test alone has a false positive — a CONCRETE
context indexed by all three key kinds, constructible from the public
API, would be blamed as any. Detection is therefore two-stage: the
cheap `keyof` pre-filter (the guards compute `keyof Ctx` anyway) and,
only when it fires, the exact tuple-infer confirm (`0 extends 1 &
([T] extends [infer U] ? U : never)`, which survives the constrained
parameter). A fully-indexed concrete context thus gets the STRUCTURAL
verdict its index signatures actually claim ("already present"), not a
degeneracy lie — pinned in the contract.

**Widened types are the runtime net's territory.** A key typed as plain
`string`, or an override patch annotated with an index signature or key
pattern (`Record<string, …>`, `Record<symbol, …>`,
`` Record<`data-${string}`, …> ``), carries no nameable keys for the
guard to reason about. (The same shape appearing as a whole TOP-LEVEL
patch is not net territory but refused outright — decision 32.)
`Extract<string, 'db'>` is `never` (the widened
key bypasses the check — pre-existing on `main`, same mechanism in the
old return-type guard), and `Exclude` does not reduce pattern keys away
(the widened override patch used to read every existing key as
"missing" — false positives, PR #26 review). The convention
is uniform and enforced member-wise: `{}` extends `Record<K, 1>`
exactly when `K` is satisfiable by omission — such members are dropped
from the missing-verdict; literals, numbers and unique symbols demand
their property and stay. Where nothing nameable remains the guard steps
aside and the runtime net is the floor — it throws at boot naming the
real clash. Both sides are pinned: type-level green in the contract,
the throw in the runtime tests. (Engine cost of the whole guard
apparatus: see the figure at the end of the next paragraph — one
measurement, kept in one place.)

**Corollary — dynamic bags mount under a literal key.** Keys computed
from data (a provider registry from config, per-tenant pools) are the
legitimate widened case: the key list does not exist before runtime, so
`Record<string, …>` is the honest type. A widened patch at the TOP
LEVEL would cost three ways at once — the collision check drops to
boot; the index signature claims every key, so reads of absent entries
lie (`noUncheckedIndexedAccess` mitigates — in a consumer without it,
nothing does); and it poisons the rest of the chain, `keyof Ctx` now
including `string` so every LATER literal provide reads "already
present" — which is why decision 32 refuses it outright, with this
corollary as the cure in the message. The move is the existing "one
top-level key per area" convention applied to the dynamic case:
`provide('payments', (): Record<string, Client> => bag)` — the guard
stays fully active for siblings (the literal name is checkable,
collisions included), the index signature is confined inside the value,
and reads become explicit indexed access where `| undefined` forces
honesty. The residual risk shrinks to the bag's own content — the
irreducible nature of runtime data.

**The requirement gate refuses degenerate seeds — the one silent pass.**
An `any` seed made `[Ctx] extends [FSeed]` trivially true: a fragment's
real requirements went entirely unchecked — a false NEGATIVE, where
every other guard hazard was a wrong or lying rejection (PR #26
review) — reachable without a single annotation: a
seed mapper returning `JSON.parse(…)` infers `any`, which satisfies
`FSeed` by plain assignability. All THREE doors refuse by name
(`⛔ fragment seed degraded to any: …`): `RequirementBrand` gates
`FSeed` on the no-mapper mount; the mapper overloads capture the
mapper's inferred return in a type parameter and brand the function
value — which is not `any` even when its return is, so the brand
sticks; and the mapper overloads' CHAIN argument carries the same
`FSeed` gate — with a degenerate declared seed, `S extends FSeed` is
vacuous and a clean mapper would otherwise smuggle the fragment in. Where the brand sticks
matters generally: `use(layer)` and the mount overloads intersect it
onto a function/chain value, so a degenerate contribution is refused
honestly there too (`⛔ patch degraded to any: …` instead of the
verdict's `numeric ${number}` artifacts); `provide`/`expose` ride the
patch value itself, where a degenerate P absorbs the brand — their
P-branch would be dead type code, so they carry the ctx-only variant
(`AbsorbableCollisionBrand`) and honesty waits one line, as pinned.
The never→any cascade shared by all five guard sites is one helper
(`DegeneracyOr`). A UNION seed ("any one of these alternatives") keeps
a NAMED message: the unmet-key computation distributes over the members
— `keyof` over a union keeps only the shared keys, so an undistributed
check would collapse to the nameless generic fallback. The same
distribution covers union-typed PATCHES (reachable via an explicit
`provide<A | B>(…)` type argument): the collision and numeric key sets
are judged member-wise, or a colliding member would slip through
silently. Declared invariant: `RequirementBrand` checks the SEED's
degeneracy only — every overload that carries it also carries
`CollisionBrand<Ctx, FPub>`, which owns the host-context side; a future
overload using `RequirementBrand` alone must add the Ctx cascade
itself. Total engine
cost of the guard apparatus, same ~15-verb consumer probe vs `main`:
34,000 → 40,486 instantiations (+19.1%), check 0.14s → 0.15s.

**`never` is not `any`: each degenerate is blamed by name.** A
throw-only stub — `provide(() => { throw new Error('todo') })`, a
plausible mid-development state — infers a `never` patch: green at its
own line (never absorbs the brand DOWNWARD, symmetric to `any`
absorbing it upward) and the context collapses to `never`. The next
wiring line used to say "degraded to any" (the keyof-based any-detector
sees `keyof never` = every key): factually wrong, and the suggested
cure pointed nowhere. The never check now runs BEFORE the any check in
every guard, with its own messages — `⛔ context collapsed to never: an
upstream provider returns never — give it a real return type`; on
override's return position (which can refuse at the offending line),
`⛔ patch type is never: the function never returns — give it a real
return type`; and on the requirement gate, `⛔ fragment seed collapsed
to never — give it a real type`.

**Horizon.** First-class custom type errors would obsolete the brand:
microsoft/TypeScript#23689 (`invalid`, In Discussion since 2018, no
milestone) and the throw-types PR #40468 (working implementation, closed
2023 after three years without a team verdict). Nothing is moving while
the team ships the Go port (TS 7 "Corsa" — type behaviour explicitly
frozen to parity). The ecosystem's mitigation is the presentation layer
(pretty-ts-errors, ts-error-translator, TS 7 expandable hovers), which
renders the message value well; the guarantee itself stays in `tsc`.
Migrating brand → `invalid`, if it ever lands, is mechanical: three type
aliases in `chain.ts`, contracts assert behaviour, not brand shape.

### 5. `override` is the explicit replacement door

**Decision.** `override(fn)` replaces keys that **already exist** (a typo
is a compile error naming it), may change the key's type (fakes,
variants), and preserves the key's visibility.

**Why.** Replacement must be distinguishable from accidental collision —
one is intent, the other is a bug.

### 6. Visibility lives in the verb; `module` was removed

**Decision.** `use`/`provide` are private, `expose` is public. The chain
tracks `Lunette<Ctx, Pub, Seed>`; `run`/`build` deliver **only** `Pub`,
in the type and at runtime. `module(name, fn)` was removed: with expose,
a namespace is just the shape of the patch.

**Alternatives.** (a) A terminal key-selection
(`expose('auth', 'posts')` at the end of the chain): implemented first,
replaced — string lists to maintain, and visibility belongs to the step,
not to an afterthought. (b) Delivering the full context and policing
access by linter rules (the status quo this design replaces).

**Why.** Private keys that simply *do not exist* on the delivered app
beat any discipline. Corollary, tested: requirement (on `Ctx`) and
visibility (on `Pub`) are independent axes — private keys satisfy module
requirements.

**Superseded:** the namespace API `module(name, fn)` and the terminal
key-selection `expose('auth', 'posts')` — both implemented, then removed
in favour of visibility-in-the-verb. (Grep `Superseded` for every
API that was implemented and later withdrawn.)

### 7. Two-sided composition: the Seed

**Decision.** `lunette<{ env: Env }>()` declares requirements the chain
does not build; `run`/`build` demand them as their first argument and do
not compile without them. The seed is private.

**Why.** Chains become mountable fragments with a checkable contract
(à la Hono's Bindings, Effect's `Layer<RIn, ROut>`), and platforms where
configuration arrives late (per-request env) get a principled entry
point.

### 8. Mount: only the public surface crosses; lexical scoping inside

**Decision.** `use`/`expose` accept another chain. Only the fragment's
`Pub` crosses; its privates live in their own bag whose prototype is the
host context — reads fall through, same-named keys **shadow** instead of
colliding. The verb decides the mounted Pub's visibility. An optional
mapper (`use(chain, ctx => seed)`) builds the fragment's seed explicitly
and doubles as a renaming adapter. One lifecycle: fragment entries join
the host onion.

**Alternatives.** (a) Seeding the fragment with a snapshot of the host
context: same-named private keys then collide at runtime even though the
types cannot see it — rejected for the prototype-chain scoping, which
makes shadowing behave like lexical scope in any language. (b) Declaring
seed keys at runtime to pick them precisely: ceremony on every fragment.
(c) Composing *built apps* (`compose(app1, app2)`): two independent
teardown chains with ambiguous ownership — mounting *chains* keeps one
lifecycle.

### 9. `.as(name)` is the only namespacing sugar

**Decision.** `fragment.as('ns')` mounts a fragment's whole Pub under one
key. Implemented as a dedicated mount entry (exact Pub pick) rather than
a wrapper that spreads the bag — a directly-run renamed chain must not
leak its seed.

**Alternatives.** (a) A mount option (`use(chain, { at: 'ns' })`):
unnecessary — the two-line wrapper (`lunette().use(frag).expose(...)`)
already solves it; `.as` is that wrapper in one word. (b) Dedicated
alias/namespace helpers, possibly Symbol-based: an alias is a one-line
`provide`, a namespace is the patch shape, and Symbols would reintroduce
tag ceremony (see 19). Helpers must not teach what plain objects already
do.

---

## Extensibility

### 10. Dialects via `pipe`, never verbs grafted into the core

**Decision.** The core gained exactly one hook: `pipe<R>(fn): R`. Domains
(http, cli, listener, flow) are *dialects* — builders that receive the
chain and own their verbs' signatures and behaviour completely.

**Alternatives.** Layers contributing verbs to the chain itself
(`.use(httpExt)` → the chain gains `.route(...)`), which requires a
fourth type parameter and a mapped-intersection chain type. Weighed and
rejected for measurable inference costs: handler contextual typing
through registry encodings degrades, error messages become type walls,
checker performance suffers at scale, and the guard machinery becomes
public API that every extension author must wield correctly.

**Why.** A native dialect costs ~60 lines and proves the ecosystem path;
a half-good extension mechanism is the most expensive kind of API because
it cannot be removed.

### 11. HTTP: routes as data, engines swappable — and native dialects too

**Decision.** The engine-agnostic dialect treats routes as data
(method + path + flat handler over the chain's Pub) with engines as
adapters; native dialects (`@lntt/http/hono`, `@lntt/http/express`)
expose the full framework wired with the chain's deps, with the
non-portability trade-off declared. Native middleware is allowed but
confined to the engine's `setup` block. A framework sub-app is just a
context value: vertical blocks are chains exposing their sub-app, the
main app mounts them with the framework's own composition.

**Why.** Portability comes from routes being *data*, not from where the
dot-method lives; and when a team wants the framework's full power, the
dialect should hand it over instead of wrapping it.

### 12. Per-request-env platforms get a lazy memoized boot

**Decision.** `worker(engine, seedFrom)` produces the platform's export
shape; the chain boots lazily on the first request and memoizes **the
promise** (memoizing the app would race under concurrent first requests).
No dispose: such platforms kill isolates, they do not shut down. The same
promise-memo recipe solves dev-server module re-evaluation (HMR).

---

## Leaves, errors, windows

### 13. Use cases are flat bare leaves, registered with `bind`

**Decision.** A use case is `(deps, ...args) => error | result` — it
declares deps in its signature but does not own them. `bind(deps, record)`
stitches deps to every leaf in a record (one word per use case);
contravariance checks each entry separately.

**Alternatives.** (a) Curried factories (`(deps) => (input) => ...`):
heavier composition and closure state risks per-instance. (b) A central
pre-wired use-case registry in the bootstrap (the pattern this design
dissolves). (c) Call-site execution (`app.run(useCase)` / `executor`):
implemented, then removed — one-word registration makes call-site
execution redundant, and the direct call `useCase(deps, args)` stays free.

**Why.** Bare leaves compose (a composite calls the bare leaf with its
own deps) and test without machinery.

**Superseded:** call-site execution `app.run(useCase)` / the `executor` —
implemented, then removed (one-word `bind` registration made it
redundant; the direct call `useCase(deps, args)` stays free).

**Updated by 27.** `bind` is now single-arity: `bind(record)` returns the
binder; applying it ties fixed deps, `.with(window)` ties them per call.
The bare-leaf shape is untouched — only the registration spelling moved.

### 14. Errors: returned = domain, thrown = infrastructure

**Decision.** Domain errors are returned as values; infrastructure errors
are thrown.

**Why.** This single distinction turns out to be the pivot of every
boundary mechanism, with no extra programming: transactions (returned
passes through → commit, e.g. persisting `attempts++` on a failed OTP;
thrown → rollback), retries (values do not retrigger, exceptions do),
queues (returned → ack/dead-letter, thrown → nack/redelivery).

### 15. Windows: per-call deps as a first-class shape

**Decision.** `With<Deps> = <T>(use: (deps) => Promise<T>) => Promise<T>`
— a callback-delimited validity window (transaction, span, timeout,
tenant connection). `bind` accepts a window in place of fixed deps (one
unified name, two overloads — same first-argument dispatch as the keyed
verbs); `within(opener, bridge)` builds a window from its two parts;
`bindBy(toWindow, leaf)` derives the window from call arguments
(single-leaf by design: key derivation differs per leaf).

**Alternatives.** (a) Re-running a whole sub-chain per call
(`block.run({ db: tx }, scope)`): remains available for blocks with their
own layers/teardown, but for plain transactional use cases the window is
lighter. (b) A curried per-call runner on the chain (`wrap`): implemented,
compared side by side, removed — only cosmetically different from the
manual form. (c) A separate `bindWith` name: merged into `bind` as an
overload. (d) An effect-only `Around` type plus composers: deferred —
windows compose by nesting openers, and most "effect-only" windows turn
out to lend something useful (the span, the attempt number, the abort
signal). (e) Ambient transactions via AsyncLocalStorage: rejected —
implicit join is the behaviour you debug in postmortems.

**Semantics fixed by tests.** The window is per call, never shared
(three leaves bound to one window = one fresh window per invocation,
closed at the leaf's return). A window may run its callback 0 times
(breaker), 1 (normal) or N (retry). Atomicity = one *named* window: an
all-or-nothing group is one composed leaf; a sequence of bound leaves is
a saga. Windows narrower than the function (a lock around a critical
section) are **deps**, applied inside the leaf where the arguments
already are.

**Superseded:** the per-call runner `wrap` (implemented, compared side by
side, removed) and the separate `bindWith` name (merged into `bind` as an
overload).

**Updated by 27.** The "one unified name, two overloads" packaging is
reversed now that the family has three forms: the per-call form lives on
the binder (`bind(record).with(window)`) and `within` is renamed
`window`. The semantics fixed by tests here are unchanged.

**Updated by 28.** `bindBy` is superseded by `.by` on the binder — and
the derivation key is no longer one of the leaf's arguments.

### 16. "Needs a transaction" can live in the type (brand pattern)

**Decision.** A pattern, not core API: brand the deps
(`Tx<D> = D & { [atomic]: true }`), produce the brand only in the
transactional bridge (a single cast). Wiring the leaf outside a
transaction does not compile and the requirement propagates through
composition — which also kills the nested-transaction footgun (a
decorated leaf calling a decorated leaf) structurally.

**Why a pattern and not an API.** It is domain lexicon (db transactions);
the core stays agnostic. A dedicated db package was considered and
dropped from the roadmap.

---

## Resources and lifecycles

### 17. Singletons are structural; no layer memoization

**Decision.** A layer runs once per run: within a chain, singletons need
no machinery. Verticals *require* shared infrastructure via their Seed
(the root creates it once); independent processes share by passing one
chain's built app as another's seed.

**Alternatives.** Effect-style layer memoization (same layer reference ⇒
same instance everywhere, refcounted teardown): rejected because it makes
lifecycle ownership implicit — "who closes this and when" must be
readable in the code.

### 18. Value-level helpers instead of engine features

**Decision.** `lazy`/`lazyAsync` (deferred expensive creation; `created()`
for conditional teardown; async variant shares the in-flight attempt and
clears the memo on failure so retry stays possible) and `circular()`
(legacy cycle escape hatch: one edge becomes a runtime getter, explicit
and greppable). The engine knows nothing about them.

**Why.** Laziness and cycle-breaking are properties of *values*;
cross-layer cycles remain unwritable by construction, so only the
explicit, visible escape needs to exist.

### 19. Symbol keys supported, strings recommended

**Decision.** The engine uses `Reflect.ownKeys`/`Object.hasOwn`, so
Symbol keys work everywhere (guards, expose, mount shadowing) for those
who want identity-based uniqueness. The documented convention stays
strings + destructuring.

**Why strings.** Symbol tags require declaring/exporting/importing a tag
per dependency — Effect's ceremony — and destructuring plus readable
signatures is the ergonomics this project optimizes for. Collisions are
already a compile error; Symbols would make impossible what is merely
forbidden, at a high ergonomic price.

### 20. Teardown must not throw (for now)

**Decision.** Documented convention: catch inside the teardown's
`finally`. A teardown that throws while the scope is already failing
masks the original error (plain JavaScript semantics), and the engine
cannot intercept it because teardown is user code inside the layer's own
try/finally. Aggregation (at least for keyed layers) stays an open item.

---

## Testing

### 21. The seed is the mock boundary

**Decision.** Wiring lives in fragments that *require* infrastructure;
tests run them with a seed of fakes, so the real resource is never
created. On top: `test(chain)` applies per-key substitutions at the
key's **birth** (downstream closures get the fake regardless of
position), typed `Seed & Partial<Ctx>`; keyed verbs make a substituted
layer **skippable outright**; `fake<T>(partial)` is a strict stub that
throws by name on unstubbed access. `override` is positional and
documented as such (it cannot rewrite already-wired closures, and the
original layer still runs) — it is for deliberate variants, not mocks.

**Why this ladder.** Each rung trades structure for pragmatism; the
pitfalls of the pragmatic rungs are documented by tests, not hidden.

### 22. Classes are conventions, not requirements

**Decision.** Class instances are first-class context values; a class
with constructor-injected deps is the OO spelling of `bind`
(`expose('auth', (ctx) => new AuthService(ctx))`); under a window,
per-call deps mean per-call instances. Flat functions remain the
documented default (lighter composition, no `this` extraction hazard,
per-record granularity).

---

## The meta-contract

### 23. The engine is guaranteed by tests; the types guarantee the user

**Decision.** Internal `any`s exist where TypeScript cannot express the
engine (an array cannot carry each layer's evolving generics). The
user-facing contract compensates: every configuration error surfaces at
the call site at compile time, and the `*.test-d.ts` suite is the
executable specification of that contract — a refactor that breaks it is
wrong even if runtime tests pass.

### 24. Packaging and naming

**Decision.** Scoped packages under the `lntt` org (`lunette` was taken
unscoped on npm). The core is `@lntt/wire` — descriptive, with DI
pedigree (wiring, autowire, google/wire); evocative single-word
candidates were explored at length and set aside. Framework dialects ship
as subpaths of `@lntt/http` (`./hono`, `./express`) with **optional**
peer dependencies — importing the agnostic entry pulls in no framework.
Test utilities are a subpath of the core (`@lntt/wire/testing`), not a
package. `exports` point at TypeScript sources for now; the build/dist
question is deliberately deferred to publication.

### 25. Events and CQRS need no new core concepts

**Decision.** The bus is a dep; emitting is calling a dep; a handler is a
bare leaf `(deps, event)`; a subscription is a layer (the onion provides
unsubscribe); a consumer is a separate chain with a per-call window per
message; the transactional outbox is a bridge
(`window(db.transaction, (tx) => ({ db: tx, events: outboxEmitter(tx) }))`).
Delivery semantics fall out of decision 14 (ack/nack). A dedicated
`listener` dialect is planned for the engine-swap ergonomics, not for new
semantics.

---

## The verb model

### 26. `use` is the one primitive; `provide`/`expose` are sugar over it

**Decision.** `use((ctx, next) => …)` is the single primitive. Its `next`
is two-armed: `next(priv)` contributes `priv` privately (to `Ctx` only);
`next(priv, pub)` additionally publishes `pub` (to `Ctx` **and** `Pub`).
The token widens to `Provided<All, Pub>` — `All` (= `priv & pub`) flows to
`Ctx`, `Pub` to the public surface, both by return-position inference
(decision 2). `provide(fn, destroy?)` and `expose(fn, destroy?)` are
**literally pre-built `use` layers**: they compute a value, contribute it
(privately / publicly), and — if `destroy` is given — wrap `next` in
`try/finally`. So a public resource with a lifecycle is one call,
acquire/release colocated:
`expose(() => createPool(env), (pool) => pool.end())`.

```
provide(fn)          = use((c, next) => next(fn(c)))
expose(fn)           = use((c, next) => next({}, fn(c)))
provide(fn, destroy) = use((c, next) => { const v = fn(c)
                         try { return next(v) }     finally { destroy(v) } })
expose(fn, destroy)  = use((c, next) => { const v = fn(c)
                         try { return next({}, v) } finally { destroy(v) } })
```

**Alternatives — measured by spike (the `*.test-d.ts` error quality is the
oracle, not opinion):**
- (a) **One verb with both a provider and a layer overload** (`use`
  accepts `(ctx)=>P` *or* `(ctx,next)=>…`): rejected. The two overloads
  compete for the *same* function argument, so on any wrong body
  TypeScript abandons contextual typing and `ctx`/`next` collapse to
  implicit `any` (a TS7006 cascade on top of "No overload matches"). The
  chosen design puts the variation in `next` (arg-count, non-callback
  args), not in `use` (function shape), so `use` keeps a single
  function-first overload and the parameters stay typed — the spike
  confirmed clean errors across patch + keyed + mount.
- (b) **A visibility flag** (`use(layer, { public: true })`): rejected. A
  value-dependent return type means a non-literal flag desyncs the type
  from the runtime — the types would lie (principle 1) — plus conditional
  inference on the hottest path.
- (c) **Boundary projection / terminal `expose(ctx => ({ … }))`**:
  rejected. It is the NestJS `exports` model — reopens decision 6
  (scattered contract, visibility as an afterthought).
- (d) **Key promotion `expose('db')`** (Guice's `PrivateModule.expose`):
  viable and clean, but **dropped**. The `destroy` sugar fills the matrix
  hole in one call, so promotion earned no real case (YAGNI). Reconsider
  only if "publish an already-private key later" ever has one.

**Why.** It realizes the truest model — one primitive, everything else
sugar — while keeping visibility in the verb for the common case
(`provide` private, `expose` public) and offering per-key visibility from
a raw layer (`next(priv, pub)`) as the max-control escape (breaker, retry,
wrap). The split is rarely needed in practice (truly-internal state is a
closure variable), so its real payoff is the conceptual unity. Closest
prior art: Effect's `Layer.scoped` + `acquireRelease` and `provide` vs
`provideMerge` — minus the Tag ceremony (decision 19).

**Consequences.**
- `Provided` becomes two-axis (`Provided<All, Pub>`). The request-time
  Response channel reserved in decision 3 moves from slot 2 to slot 3
  (`Provided<All, Pub, R>`) *if/when* the request-time axis lands
  (TODO story 2) — and that Response is itself speculative (the HTTP
  dialect owns the per-request onion; request scope is planned as a
  window, not as a core-onion return).
- "No lifecycle API: it is just try/finally" softens to: the `destroy`
  argument is the acquire/release **sugar** over that try/finally; the raw
  `use` onion stays the full-control mechanism. It is sugar, not a new
  mechanism.

### 27. `bind` is single-arity: the binder is the unit

**Decision.** `bind(record)` takes the bare leaves and returns **the
binder** — the record's partial application, a plain function with one
property (the house shape of `Lazy<T>`). Applying it ties FIXED deps
(`bind({ requestOtp })(ctx)`); `.with(window)` ties deps PER CALL
(`bind({ verifyCode }).with(window(db.transaction, bridge))`). The
binder's parameter is the intersection of every leaf's declared deps; the
binder is shaped like a provider, so `.expose(bind({ getAuthor }))` wires
a record point-free, and it is a first-class kit (one record, many
worlds). `within` is renamed **`window`** — the noun the vocabulary
already used; the old name stuttered against `.with` in the inline form.
`bindBy` was initially left unchanged here; decision 28 then absorbed it
into the binder as `.by`.

**Alternatives.**
- (a) A curried 1-arity overload NEXT TO the two-arity forms: rejected by
  the **arity theorem** — while the naked verb has both the curried
  (1-arity) and the immediate (2-arity) form, "forgot the second
  argument" stays type-valid in an irreducible case (a deps bag whose
  values are all functions, or a bound record whose leaves take object
  first arguments), surfacing late with a misdirected message. That
  contradicts principle 1.
- (b) The curried form behind a dot (`bind.later(record)`), two-arity
  forms untouched: safe, zero breakage, but taxes the hot path with the
  longer name.
- (c) Naked curried + naked immediate, window moved to a dot
  (`bind.with(window, record)`): the best ergonomics, but keeps the arity
  hole of (a) — rejected on principle 1.
- (d) A separate helper (`leaves`/`bound`/`wired`, proved userland-viable
  in a prototype): a new verb to teach what `bind` already
  means.
- Naming: `.with` kept for the per-call property (Python's `with`
  statement, Effect's `with*` combinators, the HOF `withX` convention; the
  JS "copy-with-changes" `.with` lives on instances, not verbs). The
  stutter was `within`'s fault, so the HELPER was renamed, not the
  property; `bind.per` / `bind.via` were the runners-up. `window` shadows
  the DOM global — accepted: composition roots are server code.

**Why.** One arity, one meaning, NO dispatch — the terminal point of the
until-now implicit principle "dispatch by KIND of the first argument,
never by arity or shape" (PropertyKey vs function vs chain vs plain
object everywhere else in the API; a record and a deps bag are the same
kind, so no naked two-form spelling can be made safe). And the
binder-as-provider click: bind's deferred form and the verbs' patch form
compose with zero new concepts, which is what lets a fluent module read
as one statement per wiring step. The migration was paid pre-publication
(no external consumers; decision 24).

**Consequences.**
- The dot marks the CADENCE: an applied binder is the value cadence
  (sync passthrough); `.with` and `bindBy` are per-invocation (always
  `Promise`, fresh window per call). Grepping `.with(` approximates the
  map of the codebase's transactional boundaries.
- Requirement errors carry AGGREGATE blame: the missing keys are named at
  the application, but not which leaf wants them (the old two-arity form
  blamed the entry). Accepted trade.
- Forgetting to APPLY the binder is kind-visible (spreading a binder
  contributes no leaves, so the Pub never lies) but surfaces where the
  record is demanded, not at the spread.
- The window-Deps inference crutch (the intersection giving TS a second
  source) is no longer needed: `.with`'s parameter is fully determined by
  the record, so inline bridges get contextual typing.

### 28. `.by` on the binder: the derivation key is not a leaf argument

**Decision.** `bind(record).by(toWindow)` covers windows DERIVED per call
(per-tenant connection, idempotency guard, shard): every bound leaf gains
ONE leading KEY argument — `monthly('acme', period)` — the binder passes
it to `toWindow(key)`, opens the derived window, and calls the leaf with
its OWN arguments only. The leaf never sees the key: the key is wiring
(WHICH world to open), not domain. When the domain needs it (the id in
the query), the bridge closes over the key and hands it in through the
deps (`(tenant) => window(opener(tenant), (conn) => ({ conn, tenant }))`).
The key is a single parameter by design — a composite key is one object —
so the runtime split is positional (first argument), with no
`Function.length` inspection. `.with(w)` remains the degenerate fixed
case (`.by` with a derivation that ignores the key).

**Alternatives.**
- (a) The old standalone `bindBy(toWindow, leaf)` (superseded):
  `toWindow` mirrored the leaf's FULL argument list and the leaf received
  the key too. That polluted the domain signature with a wiring concern
  (a composite would thread the tenant through every call), and it forced
  single-leaf — a record was untypeable, because one `toWindow` cannot
  mirror heterogeneous argument lists.
- (b) Variadic keys (bound args `[...Keys, ...Args]`): the runtime split
  would need `toWindow.length` — a silent footgun with default and rest
  parameters. One key, positional, explicit.
- (c) A curried bound form (`monthly('acme')('2026-06')`): split-free and
  more general, but a double call at every route call site.
- (d) A single-leaf binder (`bind(leaf)`, no braces): rejected. A
  function's NAME does not exist in the type system (`fn.name` is
  runtime-only), so `bind(leaf)` alone cannot produce a typed `{ leaf: … }`
  record — and the name is load-bearing (it is the Pub key the routes
  call). The keyed verbs COULD lend the name
  (`.expose('composeComment', bind(composeComment))` would type), but
  that spelling writes the name twice (string + identifier) and the two
  can drift silently: renaming the leaf updates the identifier, never the
  string, and the Pub keeps publishing the old key with no error —
  against principle 1. The shorthand record `{ leaf }` writes the name
  once, is refactor-safe (a rename breaks/updates the shorthand), and
  scales to plural, aliases and spreads. Division of labour: key literals
  name VALUES and namespaces (which have no name of their own); record
  braces name LEAVES (whose identifier already is the name). Separating
  the key from the leaf's arguments is also what made the RECORD form
  typeable for `.by`, so no second entry form exists.

**Why.** Taking the key out of the leaf's signature is what unlocked
everything: leaves stay pure domain (`report(deps, period)`; use-case
files keep ZERO wire imports; composites compose without threading
tenancy), and `bindBy`'s single-leaf limitation dissolves. Prior art for
the shape: cats-effect `Resource.use` / Haskell `managed` built from the
call's input, Rails `Apartment::Tenant.switch`, Autofac.Multitenant
(scope keyed by tenant id). The mainstream alternative puts the key in an
ambient channel (Spring `AbstractRoutingDataSource` + ThreadLocal,
Hibernate tenant resolvers, AsyncLocalStorage tenancy) — rejected by
principle 7: the arguments are the only per-call channel the design
admits, typed and visible.

**Superseded:** the standalone `bindBy` export — implemented with
key-mirrors-args semantics, replaced before any real usage existed.

### 29. Conditional providers are ternaries, not combinators

**Decision.** A feature-flagged resource is a plain conditional at its
keyed birth — `provide('transport', ({ env }) => env.MAILER_API_KEY ?
httpTransport(env.MAILER_API_KEY) : loggingTransport())` — and wire adds
no conditional vocabulary around it. PLACEMENT is part of the decision:
the conditional lives at the COMPOSITION ROOT, never inside the port's
module — adapters are one file each behind the port type, and the port
module knows no implementations (choosing implementations is the root's
job; the port/adapter split separates the three rates of change: port ≪
adapters ≪ policy). Growth path, still combinator-free: at the third
implementation the selection becomes DATA — a discriminated provider
union parsed in the env plus an exhaustive record
(`satisfies Record<Provider, (env: Env) => Transport>`): adding an
adapter is a file, a union member and a record line, and the checker
lists every touchpoint. When the choice is per-DEPLOYMENT rather than
per-flag, it leaves the code entirely: the chain requires the transport
and each entry point seeds its own (decision 7).

**Alternatives.** Hono-style combinators (`some`/`every`/`except` from
`hono/combine`) were considered. They are the right call THERE because
Hono middleware are opaque units composed by the engine: conditionality
must be the composer's vocabulary. A wire provider is a plain function
returning a value, so the language's own control flow works inside it —
with a decisive typing bonus the helper would lose: the ternary NARROWS
the flag (`env.MAILER_API_KEY` is `string` in the true branch, no `!`).
Any `when(pred, then, else)` either degrades to non-null assertions or
becomes a generic Option fold — FP vocabulary, not wire's. The one
transferable semantic, `some()` as try-the-real-fall-back-to-the-fake,
is an ANTI-pattern at resource birth: silent infrastructure degradation
(prod logging mails to the console because the provider was down at
boot). Resources fail loud at boot.

**Why.** The absence of combinators is not a gap — it is the design's
founding bet paying off: providers are plain functions precisely so that
plain JavaScript is the composition language (principle 7, decision 9).
Open question, evidence-gated: boot OBSERVABILITY of flag choices
("booted with logging transport") — a diagnostics convention, not a
combinator; revisit with the real bootstrap.

### 30. Numeric keys are rejected at the type level

**Decision.** Context keys are strings (they name) or symbols (they give
identity — decision 19). Numbers are rejected by the collision guard at
first use, keyed and patch form alike, with a message naming the key:
`⛔ numeric key not supported (it becomes a string at runtime): 42`.

**Why.** The runtime has no numeric keys — `{ 42: x }` owns the string
key `"42"` — while the type system keeps `42` and `"42"` distinct. Any
PropertyKey-wide guard is therefore structurally blind to the cross
collision: `.provide('42', …).provide(() => ({ 42: … }))` type-checked
GREEN and threw at boot (reproduced during the PR #26 review sparring).
A green program that throws violates principle 1, and no diagnostic
wording can fix a key kind whose identity itself lies. Bonus: an array
passed as a patch (`provide(() => [1, 2])` — always a mistake) falls
under the same ban via its numeric index.

**Alternatives.** (a) Keep numbers and normalize the clash check by
stringifying keys (`${42}` ≡ `'42'`): extra machinery on the hottest
inference path, a symbol carve-out on top, all to legalize `ctx[42]` —
a key no real bootstrap writes. (b) Keep numbers and document the hole:
rejected, the red test existed before the rule did. On the SYMBOL side
of the same review finding: symbols stay supported per decision 19 —
their collisions are rare *by construction* (identity: only reuse of the
same symbol collides, which the guard catches). The message labels them
`(symbol key)` since no `${symbol}` exists at the type level; tsc names
the binding (`typeof theSym`) in the same diagnostic, and the payload
alternative (carrying the symbol in the brand value) was killed by the
oracle — it prints an anonymous `unique symbol`.

**Composite case.** A patch carrying BOTH a numeric key and a genuine
collision on another key reports the two messages as a **union** in one
diagnostic — consistent with how multiple string collisions already
report. (The first cut short-circuited on the numeric ban and silently
dropped the collision; caught in review, fixed to the union.)

**Residual.** A numeric key can still enter through a declared Seed
(`lunette<{ 42: X }>()`) or a cast; the runtime clash net catches those,
and `override` refuses to re-type such a slot (same message) rather than
legalize it after the fact.

**Union keys.** A union key (`'db' | 'mailer'` — from config, a branch)
is judged as a SET: one bad member is a verdict, named exactly (the
clean member never widens the message). The guard's conditional is
tuple-wrapped precisely so the union does not distribute — a naked
conditional let the clean member collapse the whole verdict to `unknown`
and the guard silently vanished (PR #26 review). A union
with no bad member flows, with a pinned residual: the context gains
every member (`Record` over a union) while the runtime sets exactly one
— worth its own decision if a real case ever hits it.

### 31. Extensions supply values; only the app extends the chain

**Decision.** Nothing extends the chain through a generic parameter. The
three extension shapes each have their lane: a **dialect** consumes the
chain (`run`/`build` behind `pipe`) and owns its own verbs' signatures;
a **package** ships values — an adapter to `provide`, a window builder
for `.with`, a decorator for `bind` (the #27/#28 shapes) — and the app
does the wiring; a reusable bundle of layers is a **fragment**, mounted
on a concrete chain with its requirements declared in the Seed. A helper
generic over the chain (`<Ctx …>(chain: Lunette<Ctx, …>) =>
chain.provide(…)`) is refused by the argument-side collision guard with
`TS2769`, even collision-free — and that refusal is kept as a
**guardrail**, not fixed as a bug.

**Why.** The argument-side guard (decision 4, discussion #21) asks its
question at the verb's call site. Inside a generic helper that site sees
`Ctx` as a type variable, so the question becomes "is this key free for
EVERY `Ctx`?" — honestly unprovable: some caller's chain may carry the
key. The old return-type guard deferred the answer to each caller; the
argument-side guard cannot, so generic middlemen stopped compiling. The
codebase-wide survey (bootstrap replica, module shapes, the http
dialects) found ZERO such helpers: every real extension already lives in
one of the three lanes, all of which wire on concrete chains where the
guard resolves. The refused pattern duplicates what fragments already do
(principle: one way to do each thing), minus the Seed's honesty about
requirements.

**Alternatives.** (a) Hybrid guard — argument-side for concrete types,
return-side fallback for generic ones: real complexity on the hottest
inference path to protect a redundant pattern; nothing in the tree needs
it. (b) Back to the return-type guard: forfeits the exact-line, named-key
diagnostic at every real wiring site to unblock a pattern no real code
uses. (c) A blessed unchecked verb (`provideUnchecked`): an escape hatch
wide open for exactly the mistakes the guard exists to catch. A dialect
that genuinely must add layers can cast internally — it owns its
signatures (decision on dialects; principle 6) and answers for its own
honesty.

**Pinned.** `collision-guard.test-d.ts` ("generic chain extension is
refused by design") keeps the refusal and its concrete-chain twin green;
`docs/patterns/reading-errors.md` ("The refused wrapper") is the
field-guide entry.

### 32. Top-level widened patches are refused

**Decision.** A patch whose `keyof` carries no nameable keys — an
index-signature or key-pattern return annotation,
`provide((): Record<string, unknown> => …)`, on any verb sharing the
patch verdict — is refused at its own line:
`⛔ patch carries no nameable keys: mount the dynamic bag under a
literal key`. Judged member-wise over a union; the EMPTY patch
(`keyof` = `never`) is not widened and flows. The sanctioned form for
keys computed from data is the §4 corollary: mount the bag under ONE
literal key (`provide('payments', (): Record<string, Client> => bag)`),
where the index signature lives inside the value and the guard stays
fully active for siblings.

**Why.** Decision-30-shaped: no legitimate use survives at the top
level. The form was already self-defeating — after it, every later
literal provide read "already present" (the phantom index signature
claims every key) and even a second widened patch collided
(`Extract<string, string>` is not `never`) — so it failed anyway, at
the wrong line, with the wrong message. The refusal moves the error to
the offending line and puts the cure in the text.

**Alternatives.** (a) The documented-convention status quo ("widened
types are the runtime net's territory", with the poisoned-chain symptom
in the field guide): superseded for the patch form by this decision —
the symptom row is gone because the poison is refused at the source.
(b) Banning widened KEYS too (`provide(k, …)` with `k: string`): kept
on the net's floor for now — the single dynamic key has a legitimate
puntual use, and the template-literal variant does not poison
non-matching literal siblings; revisit if adoption hits it. (c) Banning
the widened OVERRIDE patch: different semantics (replaces, does not
add) and its own recorded flow convention; untouched.

**Pinned.** The refusal on every patch door, the union member-wise
judgment, the empty-patch pass, the namespaced green twin, and the
runtime net under a cast (`keyed.test.ts`).

---

## The scope runtime

### 33. Three seeding cadences collapse to two; the request window nests the transaction window

**Decision.** The Seed of decision 7 is read at cadences distinguished by
lifetime. The exploration first framed three (boot-time, first-request-time,
per-request); it collapses to **two**, because the host pack ALWAYS does
first-request build-once (uniform across Node, Bun/Elysia, Cloudflare
Workers). Boot-time and first-request are the same cadence with different
seed SOURCES (`process.env` on Node, `c.env` on a Worker), not two
mechanisms. Node MAY warm the memo eagerly at startup (opt-in fail-fast),
but that is the same cadence triggered early — not a third one.

- **Tier 1 — build-once.** The pack takes the **chain** (never a built app)
  and owns a first-seed-wins promise-memo per isolate, cleared on failure.
  `mount` is the framework middleware registered once: it reads the host
  context (`c.env` on Cloudflare, a preceding middleware, or static env on
  Node), seeds the memoized build, and places the built app in the host
  context for the per-handler functions to read back. Distinct context keys
  let multiple chains coexist in one app. This generalizes the lazy
  memoized boot of decision 12 (issue #12's concern) to every host.
- **Tier 2 — per-request.** The scope window: the guard/leaf fold. Each
  invocation gets a fresh cookie sink + enrichment bag; the built app is
  threaded read-only; the handler's requirement (`deps`) and the route
  params are reconciled against the chain's `Pub` and the host's route at
  the adapter — a missing dep or a wrong param is a compile error THERE.
  This mirrors wire's Seed-vs-Ctx mount check (decisions 7/8).

**Window nesting.** The request window (outer) and a transaction window
(inner — a wire `window()` / `.with`) are independent and compose ONLY
through the error convention (decision 14): a RETURNED domain value means
the inner transaction committed AND the outer scope emits its 2xx/4xx; a
THROWN infrastructure error means the inner rolled back AND propagates as
5xx. No ambient storage, no implicit join (principle 7).

**Alternatives.** (a) The pack takes a BUILT app plus a separate boot step:
splits lifecycle ownership across two callers and reopens the two-teardown
ambiguity decision 8 rejected. (b) A per-request build keyed by the seed:
defeats the isolate-static model, turning cold-start cost into per-request
cost. (c) A transaction shared implicitly across the whole request via
ambient storage: rejected by principle 7 (implicit join is the behaviour
you debug in postmortems).

**Why.** One mechanism (first-seed-wins promise-memo per isolate) covers
every host; the only thing that varies is where the seed is read from.
Keeping the two windows composed by the error convention alone means the
scope tier adds no new lifecycle concept — it reuses the pivot (decision
14) the rest of the design already turns on.

**Open follow-up.** Whether a SINGLE transaction should bracket the whole
fold (multiple guards + the leaf) is unresolved. Principle 7 dictates an
explicit named window a guard OPENS and later guards receive as an
enrichment, never an ambient join — left until a real case demands it
(principle 5).

**Amendment: the `headers` capability.** A third extension joins `body` and
`cookies`: `@lntt/scope/headers` puts a response-header sink on `ctx.headers` and
flows a `headers` capability, so a scope that decorates its response is rejected
on a host with no response to decorate (tRPC). It is a SEPARATE subpath rather
than a merge with `cookies` (a `response` extension covering both was weighed):
a cookie has typed options and its own serialization, a header is a raw pair, and
keeping them apart keeps each opt-in and leaves the existing `cookies` untouched.
`Set-Cookie` stays the cookie sink's alone — writing it through the header sink
would bypass the `cookies` gate. The declarative `.headers({...})` is the form to
reach for (the policy sits at the wiring, next to the route, and the leaf stays a
domain function); the sink is for guards, where cross-cutting concerns belong. A
leaf that writes headers has stopped being a use case.

The step behind `.headers({...})` is ALSO exported as `setHeaders`, so the same
policy can be composed as an ordinary guard (`.guard(setHeaders({...}))`). Two
forms of one thing is a considered exception to principle 5: the fluent method is
discoverable straight off `.extend(headers)`, the function is what a policy
shared between scopes wants, and it makes the position in the guard chain
visible. Neither has precedence over the other — the step runs where it is
called, exactly like any guard, which is the whole reason `.headers` is not a
"before everything" hook.

**Amendment: a leaf may speak the host's own language.** On React Router a leaf
can return `data(value, { status })`, return a `Response` it built, or throw
`redirect(...)`. This is SUPPORTED, not accidental: the pack does not re-wrap
what the leaf already built, it merges the sinks' effects into it. Wrapping it —
the naive path, and what the code did before this was found — silently dropped
the status the leaf chose and serialized React Router's internal carrier as the
body; the failure was invisible until a sink happened to be non-empty, since
without effects there was nothing to wrap with. Two things are given up
knowingly: the scope imports the framework, so it no longer runs on the other
hosts (which is why no scope in the shared example app does it), and a
`Set-Cookie` written INSIDE a leaf-built response is invisible to the `cookies`
capability — taking over the response means taking over its contract (§34).

**Amendment: how the app reaches the handler.** The build-once memo is
per PACK; what used to be shared was the TRANSPORT to the handler — `mount`
stashed the app on the host context under a fixed `'__wireApp'` key and the
handler read it back. With two packs in one app the last `mount` registered won,
so a route answered from the WRONG chain, silently: `DepGuard` is satisfied by
any chain whose public surface fits. Verified with a failing test before the fix
(`test/two-chains.test.ts`), on Express and on Hono.

Handlers are now self-sufficient: each reads the app from its own pack's
`ensure`, so the claim "different chains can serve routes in the same app" holds
by construction. `mount` survives as an OPTIONAL accessory on Hono and Express —
it exists to reach the app outside a scope (a user middleware, a hand-written
route, a healthcheck), which is the idiomatic Hono `Variables` channel and worth
keeping — with `contextKey` making the slot per-pack. On React Router `mount`
stays mandatory: there it IS `getLoadContext`, the only channel through which
RR7 hands the host env to a loader, so the app necessarily travels through the
context and only the key is made configurable.

### 34. Carrier capabilities gate host portability; the body is a declared channel

**Decision.** A scope's input splits by SOURCE, and each host maps `.input`
to its own native notion: the HTTP hosts (Hono/Express/React Router) map it to
the ROUTE PARAMS (validated by the native `param` validator), while tRPC maps it
to the single RPC payload. The request BODY is therefore NOT `.input`; it is a
SEPARATE, DECLARED channel — `.body(schema)` for JSON, `.form(schema)` for
multipart/urlencoded — validated into `ctx.body` / `ctx.form` by the fold. A
scope that declares either carries the `body` **capability** in its `Cap`
axis (a phantom on `Handler`, load-bearing like `__need`/`__result`).

Each host adapter declares the capabilities its carrier PROVIDES (`'body' |
'cookies'` for Hono/Express/RR7; NONE for tRPC — one JSON `input`, no separate
readable body, and it drops `Set-Cookie`) and intersects the wiring parameter
with `CarrierGuard<Cap, HostCaps>` — the
same brand shape as `DepGuard` (decision doc §adapter-guard). When `Cap ⊆
HostCaps` the clause vanishes and the mount compiles; otherwise it becomes an
unsatisfiable branded object (`__ERROR_host_missing_capability`) and the mount
(`toProcedure`/`w.handler`/`toLoader`) is a COMPILE ERROR naming the gap.

Enforcement is by CONSTRUCTION, not by convention: `ctx.request` is narrowed to
a headless `RequestHead` (url/method/headers, NO body accessors), so the body is
UNREACHABLE except through the declared `.body`/`.form` channels. A guard cannot
call `ctx.request.json()` to sneak the body past the capability — it does not
typecheck. A missing capability is thus impossible to forget: reading the body
requires the declaration that flows `Cap`, which the gate reads.

**Alternatives.** (a) Normalize all sources into one `.input` bag the adapter
assembles per host: rejected — auto-merging path/query/body is "ambient magic"
(principle 7), risks name collisions, and threatens the typed client (`hc` reads
Hono's native `param`/`json` split). (b) Content-type negotiation inside one
`.body` (json vs form auto-detected): the "magic" convenience, deferred until a
real case — explicit `.body`/`.form` first (principle 5, "one way to do each
thing"). (c) A declaration-only marker (`.reads('body')`) NOT enforced by the
carrier type: a scope could forget it and still read the body, so the gate
would give false safety; the headless `RequestHead` closes that hole. (d) A
runtime proxy whose `.json()` throws on a body-less host: turns a silent
empty-body read into a loud failure, but stays RUNTIME — kept only as a possible
backstop, not the primary mechanism.

**Why.** The capability axis is the `DepGuard` idiom applied to the carrier: the
same "brand at the wiring call site, named gap, compile error" the deps check
already gives — no new concept, one more phantom on `Handler`. It makes the real
constraint (a raw-body write is HTTP-dialect and cannot ride RPC) VISIBLE where a
user looks (the `to*` line), before runtime. It also types and validates the
body as a bonus. tRPC keeps only the scopes whose whole input is the payload
(the reads); a future dedicated tRPC write path would deliver the body AS
`input`, a DIFFERENT authoring channel — so the gate stays correct rather than
loosening. `Cap` defaults to `never`, so every param-only/read scope and
every existing `*.test-d.ts` is unaffected (additive).

### 35. The scope builder: `scope(profile)` over an agnostic base; carriers are `*Carrier`

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
- Carriers are injected as THREE tree-shakable extensions, each mapping to a host
  boundary tRPC actually has (it reads headers, but has no readable body and drops
  `Set-Cookie`):
  - **`@lntt/scope/request`** — `ctx.request` (read headers/session). Read-only,
    NO capability → mounts everywhere, tRPC included.
  - **`@lntt/scope/body`** — `.body`/`.form` + the `body` capability → gated off
    tRPC (§34).
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
`'cookies'`, the §34 gate). The core reads each axis back generically off the
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

**`.extend` also gates incompatibility (§4).** An extension lists its method
names in `__methods`; `.extend` rejects a second extension that redefines one
(`.extend(request).extend(evil)` where `evil` also declares `body`) as a COMPILE
ERROR at the `.extend` call, naming the method — the same "collisions are compile
errors naming the key" contract as the chain's key-collision guard.

A new carrier (the bus at #10) is a NEW SUBPATH — a value + its extension
interface — with ZERO change to the core `scope`, `Scope`, or `ScopeExtension`
(principle 6 / §10, open-closed made literal). The agnostic base never sees the
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
HTTP hosts and differs only by CAPABILITY (no readable body), which §34 already
gates at the mount site; it is not a distinct carrier or builder surface. (h) A
config-object `scope({ http })` injecting verbs — rejected as adjacent to
"verbs grafted into the core" (§10). (i) A per-carrier builder interface
(`RequestScope extends Scope<RequestCarrier>`) selected by the entry — rejected:
it forces a `guard` override in every method-adding carrier (to keep `.body`/
`.form` through the chain), and two such carriers do NOT compose (the return face
is a union, neither method callable). (j) A config-object entry
`scope({ exts: [request] })` deriving the face from the extension list — same
composition failure as (i) (`StartOf<E>` unions the faces), and no per-step hook
to detect incompatible extensions. Both (i) and (j) were built and measured
before `.extend`; the this-based `.extend` composes AND gates (§4). (k) A keyed
registry augmented via `declare module` — composes, but the global augmentation
is magic and its errors route through a registry indirection (worse than the
this-based idiom).

**Why.** `.extend` is the extensibility seam: fluent, composable, and the natural
per-step hook for the incompatibility gate (§4). `.body`/`.form` live exactly
where the carrier supports them (the `request` extension), answering "these
methods are HTTP-only" at the extension level instead of leaking onto a generic
surface. §34's capability gate stays intact and necessary: within the shared
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

### 36. Build-once is a free function the host holds; the seed is process-static

**Decision.** An app is built ONCE per process (per isolate on Workers) and
memoized, LAZILY on first use. That memo is `buildOnce(chain)` — a free function
in `@lntt/wire` returning `{ ensure, dispose }`, NOT a method on `Lunette` and
NOT a copy inside each host pack. Its purpose is IDENTITY, not speed: the
chain's singletons (a db pool, a client) must exist once, and a second build
would open a second pool and orphan the first. `ensure` takes the seed as a
THUNK, evaluated only on the build that actually happens; the seed is read once
and never again. A seed that varies per call is therefore not "ignored" — it is
never computed. Multiplicity per tenant is expressed with a WINDOW (per call,
principle 4), never with a second app; a genuinely different env means a
different handle (which is how tests get a second app).

**Alternatives.** (a) Memoize inside the chain — `chain.once()` or a memoizing
`build`. Rejected: `build` is deliberately REPEATABLE, and that repeatability IS
the mocking device (the seed, principle 5) and what lets tests build with a
different env; memoizing in the shared chain value hides state in an object that
is otherwise pure. (b) Keep the ten lines copied in each pack (they were, three
times byte-identical). Rejected on "one way to do each thing" — and the copies
had already drifted into the examples. (c) Key the memo by seed, so a changed
env yields a new app. Rejected: it needs a key function for an arbitrary seed
object, and it multiplies lifecycles (N pools, and a `dispose` that must close
them all) to serve a case the window already covers. (d) Fail fast when a
different seed arrives after the build. Rejected for now: comparing seeds needs
either referential identity or a caller-supplied key, and with the thunk the
later seeds are not even computed, so there is nothing to compare.

**Why.** The prior art splits cleanly. Sharing INSTANCES is always the
container's job (Symfony `shared: true`, Spring's singleton registry, .NET's
singleton lifetime, Effect's layer memoization by reference equality) — that is
the chain, and it already holds. Building the container ONCE is almost always
the caller's, and containers defend themselves by FAILING rather than
memoizing: .NET's "Build can only be called once.", Spring's "does not support
multiple refresh attempts"; Guice and Dagger simply hand you a second graph.
The one container that memoizes its own boot is Symfony (`if ($this->booted)
return;` plus the dumped container), which answers a problem we do not have — a
process that dies each request; tellingly, moving to worker mode (FrankenPHP,
Swoole) made Symfony add a RESET, not more memoization. Where the memo must
outlive a request, the industry puts it in the integration (NestJS's cached
server on Lambda) or in a caller-held handle (Effect's `ManagedRuntime.make`,
a free function beside the core, lazily built and explicitly disposed) — which
is exactly the shape adopted here.

The build is LAZY because of a constraint no classic container faces: on
Cloudflare Workers the bindings exist only inside the fetch handler, so there is
no startup moment at which the seed is available. Every other framework surveyed
assumes configuration is ready before the first request.

**Known caveat, not solved here.** On Workers the memo's lifetime is the
isolate's, which we do not control. Cloudflare documents that a value captured
in global scope "might not be updated when `env` changes", and that a deploy
touching ONLY bindings may reuse running isolates — so a memoized app can serve
stale configuration. There is no reliable detection on our side: `c.env` carries
opaque bindings (KV namespaces, DO stubs) that cannot be compared structurally.
The operational mitigation is to make binding-only changes ride a deploy that
also touches code, which costs no API. A `reset()` on the handle (dispose +
clear) is the obvious escape hatch and was deliberately NOT added: the
three-line version is unsafe with requests in flight (it closes a pool others
are using) and the safe version needs refcounting — a real feature, deferred
until someone has the case in hand (principle 5). Tracked as #39.

### 37. The example entries share one shape; the composition root is a module singleton

**Decision.** Every host entry under `examples/` is laid out the same way, and
the layout is not any host's:

```
config/env.ts        where the environment comes from — the ONE host-specific file
config/settings.ts   configuration that is code, not environment (only where consumed)
bootstrap/index.ts   the composition root: the pack, built once, re-exporting
                     what the mount uses
<the mount>          the route table (server.ts, router.ts, routes/* on React Router)
```

The mount imports from `bootstrap/` and never sees the chain, the pack, or the
env. What remains different between two entries is then only what is genuinely
about the host: between `examples/hono` and `examples/express`, `config/env.ts`
is identical bar a comment and `bootstrap/index.ts` differs by one import and
one call.

`bootstrap/index.ts` is a MODULE SINGLETON: it builds the pack at module scope
and exports it. There is no `makeApp(env?)` factory. A suite that needs a
different environment sets it before the first request — which works because the
build is lazy and the seed is a thunk (§36), so the composition root reads the
environment on the first request rather than at import. An eager build would
break those suites, which makes the laziness load-bearing rather than merely
stated.

**Alternatives.** (a) A shared `config` module across the examples. Rejected:
they are separate apps that must each read on their own, and a shared module
would quietly become a dependency between them (#40) — the duplication IS the
point, an app owning where its configuration comes from. (b) Keep
`makeApp(env?)`. Rejected: the parameter existed only so tests could build with
a different env, an affordance no real app writes; a module-level singleton is
tested by setting the environment, not by growing a seam for the test. It also
put an env-parsing branch (`env ?? parse(...)`) in the composition root, so the
shipped path and the tested path differed. (c) One `app/` root everywhere, as on
React Router. Rejected: `app/` there is the framework's convention, and `src/`
is the convention of the others; the skeleton is what should be uniform, not the
name of the directory holding it. (d) Split the route table into `routes/*` on
every host. Rejected: file-based routing is React Router's model — on Hono and
Express a ten-line native route table reads better whole.

**Where the shape bends, and why.** tRPC has no pack: `@lntt/integration/trpc`
ships none, because tRPC already owns a context and the app travels in it. Its
`bootstrap/index.ts` therefore calls `buildOnce` itself and exports a
`createContext`. The consequence reaches the tests: a tRPC suite hands the
caller whatever app it built, so it needs no environment variable at all, while
the HTTP suites — whose routes are registered on a pack — set one. That
divergence is the host's, and the shared skeleton is what makes it visible
instead of burying it in four bespoke arrangements.
