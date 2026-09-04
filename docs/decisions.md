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
to its own native notion — SUPERSEDED by decision 40, which gives the verb to
the carrier instead (`.params` on HTTP, `.input` on tRPC) so one name no longer
means two things; the rest of this decision, and the capability gate above all,
stands: the HTTP hosts (Hono/Express/React Router) map it to
the ROUTE PARAMS (validated by the native `param` validator), while tRPC maps it
to the single RPC payload. The request BODY is therefore NOT `.input`; it is a
SEPARATE, DECLARED channel — `.body(schema)` for JSON, `.form(schema)` for
multipart/urlencoded — validated into `ctx.body` / `ctx.form` by the fold. A
scope that declares either carries the `body` **capability** in its `Cap`
axis (a phantom on `Handler`, load-bearing like `__need`/`__result`).

Each host adapter declares the capabilities its carrier PROVIDES (`'body' |
'cookies' | 'headers'` for Hono/Express/RR7; NONE for tRPC — one JSON `input`, no
separate readable body, and it drops `Set-Cookie`) and intersects the wiring parameter
with `CarrierGuard<Cap, HostCaps>` — the
same brand shape as `DepGuard` (`packages/scope/src/adapter-guard.ts`). When `Cap ⊆
HostCaps` the clause vanishes and the mount compiles; otherwise it becomes an
unsatisfiable branded object (`__ERROR_host_missing_capability`) and the mount
(`toProcedure`/`w.handler`/`toLoader`) is a COMPILE ERROR naming the gap.

Enforcement is by CONSTRUCTION, not by convention: `ctx.request` is narrowed to
a headless `RequestHead` (url/method/headers, NO body accessors), so the body is
UNREACHABLE except through the declared `.body`/`.form` channels. A guard cannot
call `ctx.request.json()` to sneak the body past the capability — it does not
typecheck. A missing capability is thus impossible to forget: reading the body
requires the declaration that flows `Cap`, which the gate reads.

**Amendment — the alphabet is OPEN, and the two sides are asymmetric.** As first
written, `Capability` was the closed union `'body' | 'cookies' | 'headers'` in
the core, and `CapsOf` filtered an extension's own `__caps` through it. That
contradicted principle 6 — extensions are dialects, the core names none — and it
did so in the worst possible direction: a third-party capability was not
rejected, it became `never`. `CarrierGuard<never, HostCaps>` collapses to
`unknown`, the brand vanishes, and the scope mounts ANYWHERE. A silent
fail-OPEN in the one mechanism whose entire job is to make a bad mount
impossible. The negative that keeps it shut is
`packages/scope/src/capability-alphabet.test-d.ts`.

`Capability` is now `string`. An extension coins its own names and the core
enumerates none. The safety does not rest on the core knowing the alphabet — it
rests on an asymmetry:

- **DEMAND (the scope) is OPEN.** Any extension may coin a name, and the name is
  carried through as it is. A capability no host has claimed appears in no
  `HostCaps`, so `Exclude` leaves it and the mount fails EVERYWHERE. A new
  capability mounts nowhere until a host claims it; a typo (`'bdy'`) fails the
  same way, naming the string.
- **SUPPLY (the mount) is CLOSED** — a written-out set in the adapter, or in the
  hand-written mount for a host we ship nothing for.

**The gate had to be made invariant, and the reason is not the one it looks
like.** Declared `(c: Cap) => void`, the capability phantom is contravariant, so
`Handler<…, 'body'>` is assignable to `Handler<…, never>`: a caller NAMING the
type arguments at a mount (`w.handler<…, never>(scope)`) satisfied the guard
while the scope still required a capability the carrier lacked, with no cast
anywhere. Inferred mounts — which is how every mount is actually written — were
never affected.

`DepGuard` was never exposed this way, and NOT because `Need` is somehow more
real: `__need` has the identical shape, a contravariant phantom. What differs is
the DIRECTION of each predicate against the bottom type. `DepGuard` asks
`Pub extends Need`, and `never` makes that FALSE — nothing extends `never` — so
the brand fires; naming a smaller object instead is refused earlier, by
contravariance, since the handler's own `Need` no longer fits the named one.
`CarrierGuard` asks whether `Exclude<Cap, HostCaps>` is `never`, which `never`
satisfies VACUOUSLY — and contravariance waves the value through, since `never`
is assignable to everything. One axis is protected on both moves, the other on
neither.

`__cap` is now `(c: Cap) => Cap`, present in both positions and therefore
invariant, which refuses the assignment. The ONLY assignment that becomes newly
illegal is NARROWING the capability slot by hand, which is the unsound direction.
Widening it, and collecting handlers of different capabilities in one array or
record, were already refused before — by contravariance, and independently by
`__need`/`__eff`/`__result` once real scopes differ on those axes too. Verified
by running the same probes against both trees with the real packs and real
scopes, rather than handlers whose other parameters were held artificially
uniform, which is what made an earlier reading of this wrong.

The gate was genuinely open at all five shipped mount sites (`toProcedure`,
`toMutation`, the Hono and Express `handler`, `toLoader`), each of which would
take a body-reading scope onto a carrier without a readable body when the type
arguments were named; all five now refuse it.

Cost measured on two trees that both COMPILE, which is the part easy to get
wrong — diagnostics are still emitted for a tree with type errors, and reading
those is how the first figure came out backwards. Across @lntt/integration:
274,353 → 274,347 instantiations, 101,990 → 101,985 types, check time within
noise. The change does not cost, it saves a little. The negative lives in
`capability-alphabet.test-d.ts`.

Every mistake therefore falls the safe way, and the rule that follows is worth
stating on its own: **narrowing a host's set is always legitimate — it only
rejects more. WIDENING is a claim about MACHINERY, so it belongs to whoever
supplies the machinery.** `body` works on Express because `toWebRequest` streams
the request into the Web `Request`; `cookies` and `headers` work because
`renderOutcome` writes both sinks. A capability name is the name of something
that exists, never a permission to be granted.

What the amendment does NOT do is make the SUPPLY side extensible: a caller
cannot widen a shipped pack's set, and the only way to serve a capability a pack
does not claim is to write the mount (which is also the answer to "you ship no
adapter for my host" — `examples/express/src/server-manual.ts` writes its
`HostCaps` out). Deferred deliberately: there is no second capability per host to
design against yet, and #41 (SSE, downloads, WebSocket upgrade) is where the
first real divergence will appear. Tracked as #44.

A capability, finally, exists because an EXTENSION demands one — not because a
host happens to be able to do something. The alphabet mirrors the extension set,
not an inventory of host abilities, so "does Express have more capabilities?"
only becomes answerable when something asks for one.

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
  SUPERSEDED on both counts by decision 40: `.input` is a carrier's verb, so the
  agnostic base has no input channel and no way to abort either, and `ctx.request`
  now comes from the carrier that has one rather than from a shared extension.
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

**Amendment — the constraint, as measured.** `examples/cloudflare-workers/*` now
runs this rather than describing it, and two details came back sharper than they
were stated.

The ban is on asynchronous **I/O**, not on async work. A layer awaiting
`crypto.subtle.digest` at module scope is allowed; a layer reading KV is not.
The line is TOUCHING A BINDING, which is also why an in-memory example proves
nothing about it and those entries read KV. When it does bite, the worker does
not fail a request — it fails to START: "Disallowed operation called within
global scope. Asynchronous I/O (ex: fetch() or connect()), setting a timeout,
and generating random values are not allowed within global scope."

Binding a port is not I/O. On the Express entry `app.listen()` runs at module
scope (with `httpServerHandler` from `cloudflare:node`, `nodejs_compat`, and a
compatibility date after 2025-08-15) and the worker starts: nothing is opened, a
port is registered with an emulated server. That was an open question and is now
a passing test.

Where the rule can be OBSERVED is not where one would expect.
`@cloudflare/vitest-plugin` (the renamed `vitest-pool-workers`) runs test bodies
inside workerd, which makes it right for behaviour — but it loads modules
through Vitest's own module runner, from within a request, so under it module
scope is always an I/O context and a module-scope `fetch()` succeeds. Only
`createTestHarness` (wrangler), which starts a worker the way a deployment does,
sees the ban. Each Workers entry therefore carries two vitest projects, and the
negative case is a fixture worker refused at startup — not an assertion about
one.

**Amendment — what is memoized is one SUCCESSFUL build.** As first written,
`ensure` was `built ??= build(seed())`. A rejected promise is not nullish, so the
memo kept it: one transient failure — a pool that could not connect, a secret
that did not resolve — was permanent for the life of the process or isolate, and
every later request re-awaited the same rejection. The two failure kinds also
behaved oppositely for no reason anyone chose: a seed thunk throwing
SYNCHRONOUSLY (a bad env) threw before the assignment and stayed retryable, while
a rejection one layer deeper did not.

`dispose` tolerates a handle that never resolved. Dropping the rejection already
covers the SEQUENTIAL case — a failed build leaves no memo, so teardown finds
nothing to await — and what remains is CONCURRENT: `dispose` called while a build
is still in flight, which then fails. A process shutting down during a connection
timeout would otherwise have the build's rejection thrown out of its teardown.

None of that was decided; it followed from `??=` on a promise. A rejected build
is now dropped, so the next `ensure` builds again, and `dispose` tolerates a
handle that never resolved.

This does not weaken the identity guarantee, for a reason worth stating: a failed
build UNWINDS, so a retry starts from nothing rather than from a half-open graph.
That rests on every layer being a BRACKET — `try { return await next(x) } finally
{ close() }` — which is the documented idiom but a CONVENTION, not something the
types enforce: `return next({ pool })` with no `finally` compiles. For a layer
written that way the change makes things WORSE, turning one leaked resource into
one per failing request; measured on such a chain, six attempts left six live
resources where the old memo left one. The bracket is the price of a retryable
build, and it is load-bearing now rather than merely idiomatic.

Nor does it weaken the memo while a build is in flight — callers racing a failing
build still share it, and only a caller arriving after it settles starts a new
one, so attempts are self-limiting to one per build duration with no stampede.

Two consequences it does NOT solve, recorded rather than fixed. There is no
backoff: against a PERSISTENT failure every request now pays the full build
timeout, where the old memo rejected instantly after the first — the right trade
for a transient fault and the wrong one for a lasting outage, and a caller who
needs backoff must impose it. And the seed thunk is re-evaluated on each attempt,
so on a host that seeds from the request (`hono.ts` passes `c.env`) the app ends
up built from the FIRST REQUEST THAT SUCCEEDED rather than the first that
arrived.

The severity is a consequence of the build being LAZY. Where a container builds
at startup, a failed build takes the process down and the supervisor restarts it,
which is the behaviour everyone wants. Here the first attempt is a REQUEST, so
without this the first unlucky request decides the fate of every request after
it. #35 (`@lntt/secret`, resolving secrets by fetch at boot) is the case where
this would have bitten hardest.

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

What `dispose` does to that memo is the other half of the sentence, and it is
§38: the handle is single-lifecycle, so teardown ends it rather than emptying it.

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

### 38. `buildOnce`'s handle is single-lifecycle: `dispose` ends it

**Decision.** A `BuildOnce` handle has ONE life. `dispose` closes it, and after
that `ensure` THROWS rather than handing an app back, a second `dispose` returns
the FIRST teardown's promise instead of repeating it, and a build still in
flight when `dispose` arrives is torn down AND refused to whoever was waiting
for it. A second app is a second
`buildOnce` — the chain stays a value that can be built as many times as you
like (§36), so the factory already exists and does not need the handle to become
one.

The error is THROWN, not returned: a container that no longer exists is
infrastructure, not a domain outcome (principle 3). It is thrown SYNCHRONOUSLY
from `ensure`, which is the shape that call already had for a seed thunk that
throws.

**What it replaces.** The memo outlived its own teardown, because `dispose`
never cleared it. Three consequences, all measured on a chain that counts builds
and teardowns:

| sequence | before | after |
|---|---|---|
| `ensure` → `dispose` → `ensure` | the SAME app, already torn down | throws |
| `ensure` → `dispose` → `dispose` | `handle.dispose()` called twice, chain absorbs it | attempted once, REPORTED to both |
| `ensure` in flight → `dispose` | torn down, and the waiter still got the handle | torn down, waiter gets the refusal |

None of them announced itself, and that is the reason this is a decision rather
than a footnote: **after teardown the `app` object is not dead**. Its closures
are intact, its methods answer, its types hold. What is dead is underneath — the
pool closed, the client ended — so the failure surfaces inside a driver, far
from the `ensure` that handed out a spent app. `examples/app` already had the
test proving the resource really closes (`a query after dispose fails`); what
was missing was anything stopping you from asking for the app afterwards.

It was reachable in this repo, not merely in theory: `packages/integration/test/
react-router.test.ts` disposed a module-level pack halfway through the file and
five later tests kept mounting on it. They passed because the disposed app still
answered and that fixture holds no real resource. The DISPOSING test now takes a
pack of its own, so the shared one is never torn down mid-file and the five that
follow it mount on a live app.

**Why it matters more now than it used to.** Where a container builds at
startup, "after dispose" means "after the process decided to die" and nobody
gets there. With the build LAZY (§36) the first `ensure` is a REQUEST, so the
handle's life is no longer bracketed by the process's.

**Alternatives.** (a) Document the boundary and change nothing — one sentence
saying the handle is single-lifecycle and using it afterwards is undefined.
Rejected: it costs nothing and buys nothing, leaving a silent wrong answer
reachable and a documented boundary that no test enforces; the five green tests
above are what that option looks like in practice. (b) Re-arm the memo (`built =
undefined` after teardown) so a later `ensure` rebuilds. Rejected: it
contradicts the identity guarantee this module opens with — singletons would
exist once PER LIFECYCLE, not once — and it answers a need already met by a
second `buildOnce`. (c) Close only the sequential paths and leave the in-flight
one. Rejected as a half-rule: "after `dispose`, `ensure` never yields an app" is
a sentence worth being able to say without an exception, and the cost is one
`.then` on the build rather than on each call.

**Cost**, and it is larger than the rule looks. Two references to the same build
instead of one, and they are not interchangeable: teardown must await the RAW
build (it has to reach a handle that may not exist yet), while callers get that
build plus the check. Getting that wrong the other way — disposing through the
guarded promise — would make a teardown during an in-flight build skip the app
entirely.

Handing callers a DERIVED promise costs two more things, both of which the first
version of this rule got wrong and neither of which is visible from the rule
itself. The derived promise needs a handler of its own: `dispose` only ever
attaches one to the raw build, so a caller who does not await `ensure` — a
warm-up racing shutdown — turned the in-flight refusal into an unhandled
rejection, which on Node ends the process. And teardown is now MEMOIZED rather
than flagged: a boolean could only report "already handled", which made a second
`dispose` resolve after a teardown that had FAILED, so two shutdown paths
disagreed about whether the app closed. Both are guarded by tests that die when
their guard is removed.

### 39. The mount signature's type parameters stay; the one-parameter form does not infer

**SUPERSEDED by decision 43.** The `Handler<Need, S, R, Cap>` shape this decision
is about belonged to `@lntt/integration` as a package separate from the carrier,
which decision 43 dissolves — a carrier now ships its own mount helper (§60),
with far fewer generic axes than the four-to-seven this recorded. The TypeScript
lesson (self-reference through a computed type defeats inference) still holds
and is worth knowing if a future mount signature grows generic again; the
SIGNATURE it was about does not exist any more.

**Decision.** The mount factories in `@lntt/integration` keep the type
parameters the brands need. On the three HTTP packs that is four:

```ts
<Need extends object, S extends StandardSchemaV1, R, Cap extends Capability>(
  h: Handler<Need, S, R, Cap> & DepGuard<Pub, Need> & CarrierGuard<Cap, 'body' | 'cookies' | 'headers'>,
)
```

(`hono.ts` orders them `<S, Need, R, Cap>`; the set is the same.) On tRPC it is
SEVEN, because that mount is generic over the host's own context as well —
`TContext`, `TMeta`, `TContextOverrides` come from the `ProcedureBuilder` it
takes, and the deps are reconciled against the context rather than a pack's
`Pub`, since on tRPC the app travels in the context (§33).

They are not knobs and nobody should ever write them: they exist only because a
brand must NAME the axis it tests, and a brand has to sit in the same parameter
position as the value it guards. Recorded as a decision rather than left as a
smell to rediscover, because the better-looking shape has been tried and
measured, and the result is negative.

**What does not work.** One parameter with the axes extracted:

```ts
<H extends AnyHandler>(h: H & DepGuard<Pub, NeedOf<H>> & CarrierGuard<CapOf<H>, HostCaps>)
```

TypeScript cannot infer `H` from a parameter position that also references `H`
inside a computed type. It falls back to the constraint, `Need` collapses to the
constraint's shape, and the brand then fires on VALID handlers — the gate starts
rejecting good mounts, which is worse than the verbosity. Isolated so the cause
is not guessed at: the same one-parameter signature WITHOUT the intersection
infers perfectly, so it is the self-reference and not the extraction.

**Alternatives.** (a) A second parameter with a computed default (`N =
NeedOf<H>`). Rejected: the default is still a computed type over `H` resolved at
the inference site, so it reintroduces the same self-reference. (b) Put the
brand on the RETURN type. It infers cleanly, and is rejected anyway: the error
would land at the assignment of the mount's result instead of on the argument
that is wrong, which is the failure mode principle 1 exists to prevent.

**What would change the verdict.** A way to apply a predicate to an inferred
type parameter without referencing it from the inference site. Nothing in the
current type system offers one; if that appears, every mount moves at once —
though tRPC would keep the three parameters it owes to its own host, since those
are not there for the brands.

The related hole — naming `Cap` by hand to declare away a capability the carrier
lacks — is closed separately by making `__cap` invariant (§34), so what remains
here is only the shape of the signature, not a gap in the gate.

### 40. A carrier owns its vocabulary, in and out; the core coins none

**SUPERSEDED by decision 43.** This decision's premise — that a carrier needs a
vocabulary of words at all, for the outcome to be sayable and for validation to
have somewhere to fail — is what #76 measured against and found unnecessary.
Composing on four real hosts with plain `.step()` and a carrier that is `__args`
alone, with no shared word, produced no duplication and no silent failure that a
vocabulary would have caught but composition did not. The two failures this
decision closes (a scope saying a word its carrier does not coin; a host unable
to render a word a scope says) cannot recur, because there is no word — not
because the gate got better. Kept below as the record of what was tried, why,
and what it cost; not as the current contract.

**Decision.** Decision 34 got HTTP out of the scope's INPUT — `request`, `body`,
`cookies`, `headers` became tree-shakable subpaths, each coining its own
capability, with the core naming none of them. The OUTCOME half never made that
move: `abort.ts` sat in the core and spoke HTTP with no mediation
(`ResponseIntent = redirect | status`, plus `httpError`/`unauthorized`/
`forbidden`/`notFound`), so `scope()` was agnostic about what came in and not
about what went out. Worse, `validate.ts` did not merely TYPE HTTP, it MINTED
it: a schema rejection returned `httpError(422, …)` from inside the fold.

The rule that replaces it is one turn sharper than the one 34 was written
against: **every carrier extension owns its own vocabulary — the verbs it
offers AND the outcomes it can express.** `notFound()` means nothing on a CLI,
and a shared "semantic" vocabulary would be HTTP in disguise. The rule reaches
the input side too, which is why `.input` left the core in the same change: one
verb that silently meant "route params" on Hono and "the whole payload" on tRPC
was the same fusion seen from the other end. `@lntt/scope/http` coins
`.params(schema)`, `.status(n)`, `ctx.request` and its words;
`@lntt/scope/trpc` coins `.input(schema)`, `ctx.request` and codes, and no
`redirect` — an RPC reply has nowhere to go. A bare `scope()` has neither an
input channel nor a way to abort, which is correct: a scope with no carrier
runs nowhere.

**Two failures, two lines, two culprits.** They are different mistakes and the
gate reads the same accumulated set twice:

1. **The SCOPE does not handle that verb** — a guard returns `redirect()` on a
   scope that never extended the carrier coining it. Caught at the DEFINITION,
   on the guard argument.
2. **The HOST does not handle that scope** — the scope declared `redirect`
   correctly and is mounted on tRPC. Caught at the MOUNT. It cannot move
   earlier: the same scope is correct on Hono, and the definition line holds no
   information about the host.

Both compiled before: (1) because the constructors were free barrel exports
with no link to `.extend`, (2) because `abortToTRPCError` degraded a redirect
to `PRECONDITION_FAILED` in silence.

Nothing is declared by hand. Each verb carries its own name in its type
(`Abort<{ redirect: true }>`), `.guard`/`.handle` accumulate it, and the set is
compared once against what the scope extended and once against what the host
renders. The intent set is a MAP, not a union, so intersection accumulates and
`keyof` reads the union back — the trick the capability axis already uses. The
phantom is invariant for 34's reason.

**What the core keeps.** The `ABORT`/`OK` brands, `isAbort`/`isOk`, and the
fold. It never reads an intent. Its own failure — a schema rejection — is NOT
an abort, because an abort is a word from a carrier's vocabulary and the core
has none; it became a THIRD branch of `Outcome` (`{ ok: false, invalid: {
issues } }`). No coined name, no exemption, and exhaustiveness makes a codec
that forgets the branch fail to compile — verified by deleting it. `Prepare`
widened to carry it too, since `.body()`/`.form()` validate inside a prepare
step. Deciding those issues are worth 422 is the CODEC's job now (422 and not
400, so it stays distinct from Hono's native `sValidator` 400).

**Four things that were surprises, each measured rather than reasoned.**

The intent CANNOT be inferred from inside a union constituent. Written the
obvious way (`g: (ctx) => E | Abort<I>`), two abort constituents make
TypeScript pick the first candidate and REJECT the second, so a guard that can
return two different intents stops compiling. Variance does not help —
invariant, covariant and contravariant phantoms behave identically — and
inferring the whole abort union collapses to the constraint, which is 39's
negative reproduced. Inferring the whole RETURN type and distributing
afterwards collects every constituent.

The gate belongs on the ARGUMENT, not in the return type. The return-type form
is cheaper (616 instantiations per scope against 780) and was chosen first,
then reversed: it only fires when the next call touches the poisoned type, so a
BASE — extends and guards, no `.handle`, the shape a shared gated base has —
compiles clean and defers the mistake to whichever file finally calls
`.handle`, pointing at a guard its author never wrote. 39(b) rejects
return-type brands for the same reason. Its other trap does not apply: this
gate is a conditional over `R`, not an inference site, so `R` still infers.

The success side needs its OWN word. `json(v, 201)` first coined the same
`status` intent as `notFound()`, and because tRPC legitimately declares it
renders status aborts, that shared name silently licensed a 201 it cannot
express. `'ok-status'` closes it.

A bare `Abort` must fail CLOSED (`UnknownIntent`), never collapse to `never` —
34's fail-open shape. The consequence reaches every call site: annotating a
guard `Promise<{ post } | Abort>` ERASES the intent the constructor declared
before the gate sees it, so those annotations are DROPPED and the return type
inferred. An alias to annotate with was considered and rejected: it
reintroduces exactly the promise-to-keep-aligned this change removes.

**The route pattern is CHECKED against the schema, never extracted.** They were
two independent declarations nothing kept aligned — renaming `:postId` to
`:wrongName` produced no error at any mount and failed at runtime with a 422.
Matching stays the framework's job: it owns the pattern language, and the URL a
scope reads is NORMALISED while the router matched the raw target, so an
extractor of ours could disagree with it on `/a/../b`. And we write no parser:
each framework already knows its own params and hands us the type — Hono's
`ParamKeys`, Express's `RouteParameters` from `@types/express-serve-static-core`,
React Router's per-route typegen. Both framework readers beat a hand-written one
measured against them (Express's understands `*path` and `{/:id}`; Hono's knows
a wildcard names nothing). tRPC has no path, so no gate. The rule that keeps it
safe: on a pattern it cannot read it has NO OPINION — catching less is fine,
rejecting a valid route is not, and two of the three bugs found writing the
hand-rolled version were exactly that.

One trap paid for here and worth naming: a route with no params reads as
`never`, and `never extends Opaque` is VACUOUSLY TRUE, so the natural spelling
of the bail-out skipped the check on every param-less route. A tuple wrap does
not help — `never` is assignable to anything. Only the reversed test does. Same
vacuous-truth trap 34 closed on `Exclude`, in a new place.

**Cost.** Both sides measured on the same machine, the before from a separate
worktree at the pre-change commit rather than from a figure in a file — which
is the discipline this record needs more than the number: the previously
recorded 134,614 was already stale, and reading it as the "before" turned a
+7.5% change into a reported +65%. Across `examples/app`: 207,153 → 222,755
instantiations (+7.5%), 55,213 → 58,387 types, check 0.36s → 0.41s. That covers
three things at once — the per-scope machinery, the route gate, and the example
growing from 15 scopes to 18. On a fixed scope count the machinery measured
+4.1% with the argument-position gate; it is nearly free to HAVE (+0.8% at zero
scopes) and paid per scope, 250 → 615 instantiations, linearly.

**Alternatives.** (a) Constructors reached through `ctx` (`ctx.http.notFound()`)
— a certain guarantee, since the ctx lacks the field until you extend. Rejected:
it grows every guard and leaf signature and forces their unit tests to fabricate
a dependency to satisfy a gate, which is the thing the pure-function handler
style exists to avoid. (b) A shared semantic vocabulary (`notFound` meaning "not
found" on any carrier) with per-host rendering. Rejected: it is HTTP in disguise
and means nothing on a CLI. (c) Reusing the capability alphabet for intents
instead of a second axis. Rejected: tRPC's supply set would go from `never` to
two names and the same list would say two different things — what the carrier
supplies on input, and what the mount renders on output. (d) `invalidInput()` as
an ordinary abort with a neutral name: it touches no contract, but needs an
exemption from the definition-side gate, encoding "the core may do the thing we
just called a bug". (e) A success status collected through a runtime sink alone.
Rejected: it erases the literal and degrades a host's response-type inference
for EVERY route on the pack, not just the ones using it.

**Why.** The capability axis made a bad mount impossible on the input side; the
outcome side had the same shape of mistake and no gate at all. Reusing the same
brand machinery adds no concept — one more phantom, read with `keyof`, named
keys — and it keeps 51's future collision gate applicable to it. What it buys
is that the core stops knowing what a 404 is, exactly as it does not know what a
cookie is, and that a host receiving an intent it cannot render is a compile
error naming the intent rather than a silent degradation.

**Deferred.** The type-efficiency pass (780 → 615 instantiations per scope) is
its own issue, including the finding that hoisting the gate's let-bindings onto
a method's own type-parameter list is both slower and reopens 34's hole:
`guard<…, never>(bad)` then satisfies the gate AND empties the accumulated set.
On a type ALIAS the caller cannot reach them.

### 41. Validation belongs to the carrier, and the outcome has two branches

**PARTLY SUPERSEDED by decision 43.** The "outcome has two branches" half was
already gone by §42, two decisions later in this same file. The "validation
fails in the carrier's own word" half is now gone too: #76 found a validation
step writes its host's native response directly (`c.json({...}, 422)`,
`data({...}, {status:422})`), with no shared word between them needed — the
argument that a word must exist before a rejection can be said no longer holds,
because no word exists and rejection still works. What survives entirely: one
factory, not one implementation per carrier — decision 43 keeps this and
generalises it further (#64).

**Decision.** `@lntt/scope/standard-schema` shipped a CARRIER-FREE `.validate`,
and to give it somewhere to fail the core grew a third outcome branch it owned:
`invalid`, with `Invalid` and `Issue` beside it. Both are removed. `Outcome` is
`ok | abort`, and validation comes back per carrier, each failing in its own
words.

The argument is 40's own, applied to a case 40 did not live to see. Validating
means being able to say "this is not acceptable"; saying anything means having a
word; a word belongs to a carrier's vocabulary. 40 already wrote the conclusion
— *"a bare `scope()` has neither an input channel nor a way to abort, which is
correct: a scope with no carrier runs nowhere"* — and put the input verb in the
carrier (`.params(schema)` on http, `.input(schema)` on trpc). The carrier-free
`validate` contradicted it, and the `invalid` branch is what made the
contradiction inhabitable. So this is not a reversal of 40. It restores it, and
removes the plumbing that was hiding the breach.

What the branch bought was exhaustiveness: a codec could not forget `invalid`,
because the union made it a compile error. That does not disappear, it moves to
the intent axis — a mount is checked against the words a scope can say, which is
the right home for "can this host render this?". One mechanism instead of two,
and the one that was already there.

What it cost was worse than the plumbing. A 422 on HTTP is not
`UNPROCESSABLE_CONTENT` on tRPC, and a core-owned branch made that difference
something a mount had to reconstruct rather than something a carrier could
state. Per-carrier words let each say it directly.

The step itself does not vary — read the entry, run the schema, replace it or
stop — so this is one factory taking the word, not one implementation per
carrier. The engine never was ours: Standard Schema is a spec, `~standard.
validate` is called on whatever the caller passed, and with the extension gone
`@lntt/scope` has ZERO dependencies, not even types-only.

**Deferred.** Which entries a carrier exposes as validatable, and whether the
verb is named per carrier (`.params` / `.input`) or uniformly, is decided with
the carriers in hand and tracked on its own issue — deliberately not part of the
carrier port, so the port does not smuggle in a surface nobody has used yet.

### 42. The outcome leaves the core: a scope hands back what its leaf returned

**Decision.** The core stops producing an outcome. No `ok`/`abort` branch, no
`Outcome` type, no brand, no normalising pass on the way out — a step returns
something and the fold hands it back untouched. What the core keeps is the
intent axis: a word is a SHAPE that declares an intent name, and both gates read
those names off return types — the supply side at `.step` (does this carrier
coin the word?) and the demand side at the mount (can this host render them
all?). The direction is settled here; the implementation and the docs follow,
and what is still open is named at the end.

**Alternatives**, all four built and measured side by side in
[`research/collapsed-outcome/`](../research/collapsed-outcome/), whose four
kernels share a byte-identical builder so a difference between them is one this
question caused. (a) Keep the two branches — the status quo of §41. (b) Collapse
to one word, with `R` carrying the word's PAYLOAD. (c) Collapse to one word,
with `R` carrying the WORD.

**Why.** Four strands, and the first two are why the branch was never load-
bearing.

`abort` does not buy what it looks like it buys. It does not stop the fold —
not calling `next` does, which is the definition of a leaf. It does not drive
commit/retry/ack — returned-versus-thrown does (§3's convention), and an abort
is RETURNED like everything else. What was left was one boolean.

And that boolean is an opinion the core has no title to. It is 40's own argument
turned on the core itself: a core that does not know what a 404 IS cannot know
that a 404 is not ok. Worse, it was never the universal answer it looked like —
on an agnostic `scope()` there are no words, so every step returns a value and
`out.ok` is a constant `true`, carrying no information at all. It means
something only where a carrier defined what a refusal is, which is exactly where
the carrier is present to answer. A scope is a COMPOSER, not an error handler:
if a leaf reports errors as values, or a guard throws, or a carrier ships its
own envelope, none of that is the core's business, and the core had been
pretending otherwise.

Measured, the intermediate options are the worst of both. Collapsing the two
branches into one word saves ~2 instantiations per scope — noise — and in
exchange `ResultOf` stops being the domain type: with one branch a refusal has
nowhere to go but the value channel, so asking "what does this scope produce"
returns the domain type PLUS every refusal payload, for every consumer, the
mount included. Transparency is where the saving is: −36 instantiations per
scope, nine runtime values down to one (and that one is `(r) => r`), 57 lines of
outcome machinery down to 15, and ONE projection where the branded designs need
two.

Both gates survive, which was the finding that could have ended it the other
way. The demand side is the reason the intent axis exists — a host that cannot
render a word must fail to compile, naming it — and it behaves identically in a
transparent core, because it reads intent NAMES and never the branch or the
brand. Verified with a mount whose gate rides the scope argument: a host
rendering fewer words is refused, one rendering more still mounts (the set is a
supply), and a scope that says nothing mounts anywhere.

**What it costs**, and where the cost lands. The WRAP shape pays: `next` is
typed as an opaque `Passed`, so a step that DECORATES what comes back must go
through its carrier to read it. A wrap that only observes is unchanged. This is
the right home for it — whoever coined the words is whoever reads them, and
aligning a result to a host turns out to need no new mechanism, because such an
extension IS an ordinary wrapping step.

`Passed` is the one abstraction that survives, and it is a deliberate
understatement: the fold really does hand back the inner answer, and the type
declines to say what it is. It has to. When step 2 is written the builder cannot
know what step 5 returns — step 5 does not exist yet — so `next`'s return type
must stand for "the rest of the fold's answer, whatever it is". Typed `unknown`
it would poison the accumulated union (`unknown | X` is `unknown`) and the scope
would declare nothing. The branded designs got this for free, because
`Outcome<unknown>` was already a distinct type; transparency has to name it.

**Three things were checked and are NOT reasons for this**, recorded so they are
not re-proposed as such.

Seeing every type a scope can hand back does not need the collapse. It is
`Exclude<S['returns'], Passed>` — one exported alias, available in every one of
the four designs, because the state has always accumulated the raw union and
only the projections stripped it. Measured on the shipping core before any of
this was built. And on that axis today's design is the LOSSY one: `Abort<I>`
carries only the intent NAME, so two refusals sharing a name merge into a single
constituent, where a design carrying the value type keeps them apart.

(b) versus (c) is not a safety class. Because `ResultOf` is polluted either way,
(b) also refuses the shortcut whenever the refusal's payload type differs from
the domain type — the union is heterogeneous and that is enough. The two differ
by what the CARRIER must promise: (b) is safe as long as refusal payloads never
coincide with the domain types its users return, which a carrier secures by
giving refusals a recognisable shape — that is, by building the wrapper (c)
provides structurally, once per carrier.

And (b)'s unpredicted flaw is instructive rather than decisive: a refusal
carrying NOTHING (a redirect, a nack) unwraps to `undefined` and makes `R`
nullable. The fix — sending a valueless word to `never` — is exactly the rule
the `abort` branch WAS. An option that has to re-grow half of what it removed
was not the simplification it claimed.

**The one cost, priced.** How much of a real carrier is decorating wraps was
deferred as unmeasurable without a carrier in hand, so the research grew one of
realistic size. A third of its steps decorate — and the cost does not scale with
them. It is ONE assertion, in one helper the carrier writes once; every
decorator beyond that is a one-liner against the carrier's own type, with no
check and no cast, and the carrier never names `Passed` at all (`noUnusedLocals`
refused the import, which is the proof).

Building it also found a constraint the kernels had not shown: steps unwind
innermost-first, so a decorator placed before the leaf is handed a raw domain
value with nothing to attach a header to. A separate `normalise()` step would
fix that only if whoever composes the scope placed it exactly right. So the
helper normalises as well as asserting, every decorator is handed a word
wherever it sits, and the normalising step disappears — which is a better
answer than the one that prompted the question.

**Deferred.** What `Passed` is finally called,
and what a wrapping step is shown of it. And rewriting §3's returned/thrown
convention in the docs without leaning on `ok`/`abort`, which currently carry
the explanation — the convention itself is unchanged and orthogonal, only its
wording depends on a shape that is going away.

### 43. A carrier needs no vocabulary at all; a carrier is `__args` alone

**Decision.** Removed from the core (`db0ff65`): `Word`, `UnknownIntent`,
`IntentKeysOf`, `IntentsOf`, the word-checking half of `ReturnGate`,
`State['vocabulary']`, `Carrier.__vocabulary`, `VocabularyOf`. A `Carrier` is
now exactly:

```ts
export interface Carrier {
  readonly __args?: object
}
```

— the shape of a run's second argument, and nothing coined. §40 built a whole
axis (a carrier's words, checked twice — at the definition and at the mount) on
the premise that a step needs a shared name to say a refusal WITH. §76 tested
that premise directly rather than arguing it further, and found it false.

**What was measured.** `research/no-scope-hosts` first wrote the same three
routes (a domain "not found", auth + a redirect after a write, hand-rolled
validation) on Hono, Express, tRPC and React Router with no scope at all,
finding real duplication (four independent `{ notFound: true }` translations)
and a real silent failure (React Router's `return data(null, { status: 404 })`
renders normally instead of reaching an `ErrorBoundary`). `research/with-scope-
hosts` then composed the SAME routes with `@lntt/scope`'s `.step()` on all four
hosts, with a carrier that is `__args` alone:

- The duplication is answered by composition itself, not by a shared word: each
  host's terminal step writes its own native response
  (`c.notFound()`/`throw HTTPException` on Hono, `res.status(...).json(...)` on
  Express, `throw TRPCError` on tRPC, `throw data(...)` on React Router), and
  nothing is repeated ACROSS routes on the same host.
- The React Router silent failure is **not** fixed by scope, with or without a
  vocabulary — no word ever stopped an author from writing `return` instead of
  `throw`, because the mistake is at the call site, not at a missing check. §40
  is not disproven for this case; it was never load-bearing here.
- Validation (#41's per-carrier word) generalises further than a word: one
  factory, parameterised by schema, produces a step that writes the host's own
  native shape — no carrier vocabulary is read or checked anywhere in the four
  implementations, and none was missed.
- tRPC's guard and "not found" still throw — its one door, unchanged from §40's
  own finding — but that is a fact about tRPC's transport, not about a
  vocabulary axis every carrier needs.

**Why.** §40's two failures (a scope saying a word its carrier does not coin; a
host unable to render a word a scope says) were real, but they were failures OF
the vocabulary mechanism, not failures a vocabulary was needed to prevent. With
no words, there is nothing to say incorrectly and nothing to fail to render —
the category of mistake is gone, not guarded against. What actually carried the
weight in every host, vocabulary or not, was the step primitive and `Ctx`'s
contravariant narrowing (a step reading what the scope has not got is refused
at the argument) — exactly the mechanism §40 kept "either way".

**What this retires.** §61 (outbound envelope as carrier vocabulary), §66 (a
translating step from domain errors to carrier words) — both closed, WONTFIX,
their reasoning superseded here. §64's "one factory, each carrier's own word"
survives as "one factory, each carrier's own native shape" and is generalised
further: the factory is parameterised by WHICH entry it validates (body,
header, query, an RPC input), not only by schema, so the same mechanism that
validates a body validates a header. §67's agnostic guard survives with its
premise narrowed: the part of a guard that DERIVES (read a header, decide there
is an actor) is shareable across hosts; the part that STOPS is not, because how
a host ends a request differs by transport, not by vocabulary.

**What this makes obsolete in `@lntt/integration`.** With no vocabulary to
render, and a carrier that ships its own mount helper (`{ route, mw }`,
`{ procedure }`, `{ loader, action }` — `research/with-scope-hosts/src/*/
carrier.ts`), the separate adapter package #58 tracked has nothing left to be:
the carrier subpath IS the adapter. §39's mount-signature generics
(`Handler<Need, S, R, Cap>`, four to seven type parameters per mount) belonged
to that dissolved package.

**Alternatives.** None re-litigated — this is a measurement overturning a
premise, not a new design choice among several. The alternative to "no
vocabulary" was always "keep §40's vocabulary", and it is the one just tested
against real code on four hosts and found to buy nothing beyond what
composition alone already provides.

**Deferred.** Promoting `validated`/similar step-factories to `.extend()` verbs,
so what a step populates is named at the call site rather than inferred from a
lambda's body (#64, #69 for the verb-name-collision question it raises). The
guard-fragment shape from §67 (shared derivation, per-host arrest). Neither is
part of this decision — both are the next slice, on the settled premise that
there is no vocabulary to design either one against.

### 44. The mount is a gate too, and the CHECKED verb has the short name

**Decision.** Two things settled together, because they are one question asked
twice: what does a MOUNT owe the scope it mounts, and which of the two ways to
mount deserves the plain name.

**A mount owes what a direct call owes.** `Scope<S>` names four axes, and a
mount that curried the deps and hands over the run's args is answering three of
them; before this it checked none. Each is now refused at the mount, in the
shape that fits it:

| what | how | where |
|---|---|---|
| the chain satisfies `S['need']` | `DepGuard`, exported from the core | every mount |
| the scope was written for THIS carrier | contravariance — the args are a real parameter the scope must be assignable to, no type of ours | every mount |
| a middleware may not derive a ctx key the run brought | `StripGate` | the mounts whose leaf strips by name (`mw`, `middleware`) |
| the leaf hands back something the host will send | `AnswerGate` | where the host ignores the return (Express `route`/`mw`, Hono `mw`) |

`trpc.procedure` and `reactRouter` had the first two for free, because they name
`App` and `S['args']` in real parameter positions instead of taking `Scope<S>`
and casting. That is the shape the others adopted for the carrier axis; the
chain kept `DepGuard`, so the two claims stay one each and neither masks the
other.

**The core does not move.** Refining a key the carrier brought is a supported
shape there — `Ctx` resolves it with an `Omit`, pinned in `shapes.test.ts` — and
only the leaf that STRIPS by name cannot survive it. A rule that holds at one
mount and not another is not the core's.

**Two message-gates may never meet on one argument.** `'⛔ A' & '⛔ B'` is
`never`, and TypeScript then reports "not assignable to parameter of type
`never`" with both messages gone. Measured on `AnswerGate` + `PathGate`, which is
how the invariant was found. So each message-gate takes what to check NEXT
(`AnswerGate<S, PathGate<…>>`) and only one can be the answer. A gate whose
failure is not a literal — `DepGuard`'s branded object, the contravariant
carrier gate — cannot collapse and stays out of the chain.

**`route` is the checked verb; `handler` is the escape hatch.** It was one verb
with two forms:

```ts
route(scope)                 // the bare handler, nothing checked
route(pattern, scope)        // the pair, pattern checked
```

— and the shorter, more natural call was the one that checks NOTHING, so
principle 1 cost an extra argument and a spread while the mistake was free. Now
`route(pattern, scope)` is the whole of `route`, and the escape hatch has to be
named:

```ts
handler(scope)               // an Express/Hono handler, and the pattern is the host's
```

The adjective belongs on whoever gives something up. `handler` is not invented
for the split — it is what the tests already called that form in prose, and what
it literally returns. It survives because the pattern genuinely cannot be
checked there: on Express `RouteParameters` is a DEFAULT that inference never
reaches (measured across seven handler shapes), and on Hono `Context<Env, Path>`
is mutually assignable across paths, so contravariance has nothing to bite on. A
pattern reaches a type of ours only by being an ARGUMENT to one.

**A named cost.** Splitting drops the overload set and the `b === undefined`
runtime discriminator with it, so `route` is a plain function and one cast fewer
in each file.

**Alternatives.** *Keep the two forms and record them* — the overloads do not in
fact degrade the error messages (measured), so the cost was never DX, it was the
default pointing the wrong way. *Symmetric names* (`route`/`routeAt`,
`base`/`checked`) — no default implied, so no push toward the right one; and
`base` is taken twice in this vocabulary already (the agnostic base builder,
§35; a scope with steps and no leaf, `index.ts`). *Drop the unchecked form* —
viable, the spread covers every use including Hono's RPC chaining, but it also
removes the case where the path is not ours to write, which costs little to keep.

**What this does not fix, and says so instead.** Express's `next` DISPATCHES and
hands back nothing to wait on, so a step written `const p = await next({}); …;
return p` runs its second half BEFORE the downstream handler finishes, where
Hono and tRPC run it after. It is not expressible as a refusal — no type
distinguishes a step that AWAITS `next` from one that RETURNS it. Making it true
was measured and rejected: `res.on('finish')` would let the Express leaf wait for
the response to be SENT, a different claim from "the chain answered" and one
arriving with the headers already gone. A portable-looking expression meaning two
things is worse than a stated one meaning one, so it is stated where `toNext` is
written and the two `index.test.ts` files assert OPPOSITE orders on purpose.

**The shape this leaves portable.** A scope started on NO carrier reads `{}`,
every mount brings at least that, and a superset passes — so one value mounts on
all four hosts and what it derives arrives in each host's own place
(`carrier-free.test.ts`). What travels is what a step DERIVES, not when its code
after `next` runs.

**Deferred.** The carrier now answers two questions with one type — what the run
BRINGS (the supply `Ctx` reads) and what the scope READS (the demand the carrier
gate checks) — and they coincide only while the type comes from the carrier.
With validation (#64) the source becomes the schema, and the two part company.
Not settled here.

### 45. What a carrier subpath ships: a parameterised declaration, a one-direction pattern gate, transparent mounts, and tRPC's second unit

**Decision.** Four choices this branch made and left as code comments. None is
large enough for an entry of its own; together they are what a carrier subpath
IS, past §43's statement of what a carrier is not.

**A carrier is a parameterised FACTORY, not a bare value.**

```ts
export const expressCarrier = <Params = ParamsDictionary>(): ExpressCarrier<Params> => ({})
```

§43's letter says "pure declaration — no runtime value", and there is now a call
returning `{}`. The spirit holds: the object carries nothing, and the TYPE
ARGUMENT is the whole point of the call — `expressCarrier<{ id: string }>()` is
how a scope says which params it reads, and `honoCarrier<'/posts/:id'>()` which
pattern. A bare exported value cannot take a type argument at the USE site,
which is where the claim has to be made, since the same carrier serves every
scope in the app.

*Alternative.* `scope<Args>()` already takes the args shape directly, so
`scope<{ req: Request<{ id: string }>; res: Response }>()` expresses the same
thing with no factory — and makes the author write the host's arg shape by hand,
at every scope, keeping it aligned with the carrier's by discipline. The factory
is that shape with the host's half filled in.

**The pattern gate runs ONE direction: the scope DEMANDS, the route SUPPLIES.**
A param the scope reads and the pattern does not supply is `undefined` at
runtime against a type saying `string`; a param supplied and never read is
nothing at all. A SUPERSET passes, which is the verdict `DepGuard` gives the
chain, and what lets one scope mount under a nested route or on a second pattern
naming the same param.

Two traps paid for, both in the code:

- the test is REVERSED on purpose — a param-less pattern's key set is `never`,
  and `never extends Opaque` is VACUOUSLY TRUE, so written the natural way round
  the gate skips every param-less route;
- OPTIONALITY IS MEANING on the supply side. `/posts/:id?` (Hono) and
  `/posts{/:id}` (Express) also match without the param, so a required demand
  takes only a required supply while an optional one takes either. Express's own
  reader carries this as `Partial<…>` and the first version of the gate lost it
  to a bare `keyof`.

*What the second direction was FOR, on the branch that had it.*
`origin/story-30/scope-impl` runs the same gate BOTH ways
(`packages/integration/src/{express,hono}.ts`, pinned in
`test/route-gate.test-d.ts`: "Both directions of a mismatch are rejected, on
both hosts"). The difference is not the count of directions, it is WHAT the
pattern is compared against. There it was the `.params()` SCHEMA — what
VALIDATES — and a param the schema does not declare is a param nobody checks,
which is a hole worth naming. Here it is what the scope READS, and a param
nobody reads is nothing at all. Same machine, two sources, and the source is
what decides how many directions are meaningful.

Two things carry over from that file and one does not. The reversed
vacuous-truth test is there already, named as decision 34's trap, and the
message-per-branch chaining (`Missing` first, then `Extra`) is the shape this
branch had to rediscover as an invariant — see §44. What does NOT carry over is
optionality: its `RouteParams` reads a bare `keyof` too, so the header claiming
`{/:id}` resolves to its real param set is half right — the name arrives, the
`?` does not. Whoever revives that code inherits the hole this branch closed.

**Every mount is TRANSPARENT: it hands back the host's own type with what the
scope knows filled in.** This is a requirement, not a detail, and it is what
several non-obvious type shapes are for — each pinned in a `*.test-d.ts`:

| host | what reads it | what the mount must therefore hand back |
|---|---|---|
| Hono | `hc<typeof app>()` | what the SCOPE returned, so `c.json(v)`'s `TypedResponse` survives — declaring `Promise<Response>` leaves the client with `unknown` |
| React Router | `useLoaderData<typeof loader>()`, RR7 typegen | `ResultOf`, or the whole route's data type is silently `unknown` |
| tRPC | `inferRouterOutputs`, `.output(schema)` | `R` kept generic through `procedure`; and `middleware`'s return type WRITTEN OUT, since `t.middleware` reads `$ContextOverrides` off the declared return and an inferred one grows the context by nothing |
| Express | the params, and `LocalsOf` | `RequestHandler<ParamsOf<S>>` from `route`, the derived locals from `mw` |

A wrapper that declares the widest thing that compiles costs none of these at
its own call site and all of them at everyone else's.

**tRPC gets a second mount, and it is tRPC's own unit.** The research concluded
that a procedure is the only mount unit tRPC has. That was refusing an
EXPRESS-SHAPED middleware — a `req`/`res`/`next` door tRPC does not own — and
the reasoning holds. `t.middleware` is a door tRPC already owns, so `middleware`
mounts onto it: what a scope's steps derive becomes the CONTEXT OVERRIDE
(`next({ ctx })`), the exact twin of `res.locals` and `c.set` in the shape tRPC
reads. What the research got wrong was the count, not the principle.

**Deferred.** The `README` of `@lntt/scope` still describes the pre-#30 surface
(`.input`, `.guard`, `.handle`, `runScope`) from its own banner down, so the two
APIs sit side by side with nothing saying which exists. Its own work, and its own
issue.

### 46. Neither sugar comes back: `.step` is the whole fold surface

**Decision.** `guard` and `handle` are refused, and #63 closes decided rather
than open. `.step()` stays the only fold verb, with `.extend()` for the builder.

**The primary reason is the owner's, and it is the cheapest one.** `next` is one
parameter and one call. A sugar that removes them buys very little, and the cost
of being wrong in this direction is nothing — a verb can be added later, with the
case that justified it in the commit, which is principle 5 exactly. The cost of
being wrong in the other direction is an API that accumulated a verb nobody
needed and can no longer drop.

**`handle` had already lost its subject.** It was going to hide the TERMINATION
declaration and the NORMALISATION of a leaf's value into an outcome. A step that
does not call `next` ends the fold with nothing to declare, and §42 left nothing
to normalise into. Four carriers were ported (#60) and the leaf never needed
anything a step does not have. The one leaf-specific rule that did emerge — what
a leaf may hand back — lives at the MOUNT (`AnswerGate`, §44), where the host
that cannot send it is known; the builder cannot know it and so cannot be where
it goes.

**`guard` is not merely unneeded, it is not expressible.** A guard has to tell an
ENRICHMENT from a STOP at runtime: merge this value into the ctx, or hand it back
as the answer. §40's vocabulary made that sayable — a carrier's word said which —
and §43 removed the vocabulary. Without one, `{ actor: 'u1' }` and a `Response`
are both objects, and every scheme that separates them is a brand: the vocabulary
again, under another name, arriving through the sugar door after being turned
away at the front.

The port shows the split is per HOST, which is what makes it a design fact rather
than an inconvenience:

| host | how a guard stops | is `guard` expressible? |
|---|---|---|
| tRPC | `throw new TRPCError(…)` | yes — everything RETURNED is an enrichment |
| React Router | `throw data(…)` / `redirect(…)` | yes, same reason |
| Express | `return res.status(401).json(…)` | no — a returned value is ambiguous |
| Hono | either, and both ship in tests | no, for the returned half |

A sugar available on half the hosts, meaning something different on each half, is
what principle 5 refuses. Note the lexicon entry that has been describing `guard`
as "stop with one of the carrier's words" was stale from §43 onward, and is now
corrected in `docs/design/scope-api.md`: a guard is a SHAPE a plain step already
has, not a verb.

**What was NOT weighed, and did not need to be.** #63 said `guard`'s case is a
LEGIBILITY claim, judged on real examples, and named #59 as where it becomes
visible. That question is not answered here and does not need to be: whether
`next` reads as noise is a matter of taste, and taste does not get asked about
something that cannot be built without undoing §43. If #59 makes the call site
read badly, the answer is a different sugar, not this one.

**Alternatives.** *Defer `guard` to #59* — the issue's own plan, and it would
have rediscovered the brand problem later, after the examples were written
against a verb that could not ship. *`guard` on the two hosts where it is
expressible* — named only to refuse it: a form that means different things
depending on where it is used is the one-thing-two-ways this design keeps out.
