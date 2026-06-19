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
top-level key per area.

**Alternatives.** (a) Allowing the collision: TypeScript intersections
merge object types *deeply* while runtime spreads replace keys
*wholesale* — the type would promise both areas while the runtime kept
one (see `packages/wire/src/why-collision-guard.test.ts` for the
demonstration). (b) Deep merge at runtime: murky semantics over class
instances, closures and functions — the kind of magic tag registries
exist to avoid. (c) A namespace API (`module(name, fn)`): tried, then
removed (see 6).

**Why.** The types must never lie; refusing the case where they would is
cheaper than modeling it.

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
(`within(db.transaction, (tx) => ({ db: tx, events: outboxEmitter(tx) }))`).
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
