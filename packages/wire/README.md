# @lntt/wire

> Typed dependency wiring as a chain of layers — Effect-grade composition
> with plain functions: no monads, no decorators, no reflection.

`@lntt/wire` builds your application's dependency graph as a **chain of
layers**. Each layer declares what it requires and what it provides; types
accumulate by intersection, so every configuration mistake — a duplicated
key, an unsatisfied requirement, a use case wired outside its transaction —
**fails at compile time, at the call site**. At runtime the chain owns the
lifecycle: resources open in order and tear down in reverse, with plain
`try/finally`.

```ts
import { bind, lunette } from '@lntt/wire'

const chain = lunette<{ env: Env }>()      // requirements arrive at build time
  .use('db', async ({ env }, next) => {    // private, with teardown
    const pool = createPool(env.DATABASE_URL)
    try { return await next(pool) } finally { await pool.end() }
  })
  .provide('repos', ({ db }) => makeRepos(db))            // private
  .expose('auth', (ctx) => bind(ctx.repos, { requestOtp, verifyOtp })) // public

const { app, dispose } = await chain.build({ env: parseEnv(process.env) })
await app.auth.requestOtp({ email: 'a@b.c' })   // consumers see ONLY what you exposed
await dispose()                                  // teardown, reverse order
```

## Install

```sh
pnpm add @lntt/wire
```

Requires TypeScript 5.x with `strict: true`.

## The chain

A chain is `Lunette<Ctx, Pub, Seed>`:

- **`Ctx`** — everything provided so far. Downstream layers see it whole:
  that is what wiring needs.
- **`Pub`** — only what passed through `expose`. This is what `run`/`build`
  deliver, in the type **and** at runtime: private keys do not exist on the
  delivered app.
- **`Seed`** — requirements the chain does *not* build
  (`lunette<{ env: Env }>()`). `run`/`build` demand them as their first
  argument and do not compile without them. The seed is private.

### Verbs

| verb | visibility | shape |
|---|---|---|
| `use(layer)` | private, or per-key | **the primitive**: `(ctx, next)`. `next(priv)` contributes privately; `next(priv, pub)` also publishes `pub`. Work before `next` is setup, work after is **teardown** |
| `use(key, layer)` | private | keyed form — `next(value)`; declaring the key makes the layer **skippable in tests** |
| `provide(fn, destroy?)` / `provide(key, fn, destroy?)` | private | sugar: a value, with an optional acquire/release teardown |
| `expose(fn, destroy?)` / `expose(key, fn, destroy?)` | public | same, but the value also enters `Pub` |
| `override(fn)` | preserved | replaces **existing** keys only (a typo will not compile); the type may change |
| `pipe(fn)` | — | hands the chain to a *dialect* (e.g. `@lntt/http`) and returns whatever it returns |

`provide`/`expose` are sugar over `use`: `expose(create, destroy)` is a
public resource *with* a lifecycle in one call (acquire/release colocated),
e.g. `expose('db', () => createPool(env), (pool) => pool.end())`. The raw
`use` onion stays for full control (a layer that wraps `next`, runs it
0/1/N times, splits visibility with `next(priv, pub)`).

Key collisions are an error on two levels: at compile time the verbs return
an error type naming the duplicated keys (`'⛔ keys already present in the
context': 'db'`); at runtime the same collision throws. Convention: **one
top-level key per area**.

### run and build

`run(seed?, scope)` is the primitive: *build the app, let it do this, shut
it down well*. The scope delimits the app's lifetime; teardown runs on exit
(exceptions included); the scope's return value is `run`'s result. Every
run is an independent instance — tests are isolated for free.

```ts
// tests, one-shot jobs, CLI commands, message handlers:
const count = await chain.run(env, (app) => app.digest.sendToEverybody())
```

`build(seed?)` returns `{ app, dispose }` for hosts that cannot live inside
a callback (a long-running server, React Router's `getLoadContext`).
`dispose()` releases the parked chain: every teardown runs, in reverse
order, and the promise resolves when shutdown completes.

### Mounting fragments

`use`/`expose` also accept **another chain**. Only the fragment's `Pub`
crosses the boundary; its privates live in their own bag with **lexical
scoping** (reads fall through to the host, same-named keys shadow instead
of colliding). The verb decides visibility in the host:

```ts
lunette()
  .use('db', withDb)            // the singleton: created once, here
  .use(infraFragment)           // infrastructure: its Pub stays private
  .expose(authFragment)         // feature module: its Pub reaches the app
  .expose(authFragment.as('v2'), (ctx) => ({ db: ctx.replicaDb }))
  //                   └ rename └ explicit seed mapper (adapter at the boundary)
```

The fragment's `Seed` is checked against the host's `Ctx` at the mount
point — a missing requirement is a compile error naming the missing keys.
One lifecycle: fragment entries join the host onion, teardown in global
reverse order.

## Leaves and bind

A **bare leaf** is a flat use case: `(deps, ...args) => error | result`.
It declares its deps in the signature but does not own them — which makes
it composable (a composite calls the bare leaf with its *own* deps) and
trivially testable (`verifyOtp(fakeDeps, ...)`).

`bind` ties deps to every leaf in a record — registration costs one word
per use case:

```ts
.expose('auth', (ctx) => bind(ctx.repos, { requestOtp, verifyOtp, findUser }))
// app.auth.verifyOtp(email, code) — deps stitched in, contravariance
// checked on every entry separately
```

Errors follow the value convention: domain errors are **returned**
(`return new OtpInvalid()`), infrastructure errors are **thrown**. This
single distinction drives everything below.

## Windows

A **window** lends deps that are valid only inside a callback:

```ts
type With<Deps> = <T>(use: (deps: Deps) => Promise<T>) => Promise<T>
```

Database transactions, tracing spans, locks, per-tenant connections — all
the same shape. `bind` accepts a window instead of fixed deps: every call
opens the window, builds the deps inside it, closes:

```ts
const inTx: With<Repos> = (use) => db.transaction((tx) => use(makeRepos(tx)))

.expose('commands', ({ db }) => bind(inTx, { verifyOtp }))
// each call = one transaction, invisible at the call site
```

`within(opener, bridge)` builds a window from its two parts — the
**opener** (callback-shaped; `db.transaction` already is) and the
**bridge** (raw resource → the deps shape your leaves declare, mixing in
boot values by closure):

```ts
bind(within(db.transaction, (tx) => ({ db: tx, email, clock })), { welcome })
```

`bindBy(toWindow, leaf)` derives the window from the call arguments
(per-tenant connections, idempotency keys) — single-leaf, because how the
key derives from the args differs per leaf.

Semantics worth knowing:

- the window is **per call**, never shared: three leaves bound to one
  window do not share a transaction; each invocation opens and closes its
  own.
- a window may run `use` **0 times** (circuit breaker), **1** (normal) or
  **N** (retry). The error convention is the pivot: returned domain errors
  pass through (commit, no retry); thrown infrastructure errors make the
  window react (rollback, retry).
- **atomicity = one named window**: if two operations must be atomic
  together, compose them into one leaf and bind *that*; a sequence of
  bound leaves is a saga (each step commits its own).
- windows whose extent is *smaller than the function* (a lock around a
  critical section) belong **in the deps**, applied inside the leaf where
  the arguments already are.

To make "needs a transaction" part of a leaf's contract, brand the deps
type — only the transactional bridge produces the brand, so wiring the
leaf outside a transaction does not compile, and the requirement
propagates through composition:

```ts
declare const atomic: unique symbol
type Tx<D> = D & { readonly [atomic]: true }

const verifyOtp = async (deps: Tx<Repos>, email: string, code: string) => { ... }
const inTx: With<Tx<Repos>> = (use) =>
  db.transaction((tx) => use(makeRepos(tx) as Tx<Repos>))  // the one cast, here

bind(makeRepos(db), { verifyOtp })   // ❌ does not compile
bind(inTx, { verifyOtp })            // ✅ the only way in
```

## Helpers

- **`layer(l)`** — identity helper for reusable layers defined outside a
  chain: annotate only `ctx` (the requirements), `next`/patch are inferred.
- **`lazy(create)`** — value-level laziness: the expensive work
  (connection, warm-up) runs on first call; `created()` lets the teardown
  close only what actually started.
- **`lazyAsync(create)`** — async variant: concurrent callers share the
  in-flight attempt; a failure clears the memo so retry stays possible.
- **`circular()`** — escape hatch for legacy dependency cycles: one edge
  becomes a runtime getter, explicit and greppable. Cross-layer cycles
  remain unwritable by construction (the chain is a list; its order *is*
  the topological sort, checked by the types).

## Testing — `@lntt/wire/testing`

The mock boundary is the **seed**: keep your wiring in a fragment that
*requires* its infrastructure, mount it after the real thing in
production, run it with fakes in tests — the real resource is never even
created:

```ts
import { fake, test } from '@lntt/wire/testing'

export const modules = lunette<{ db: Db }>().expose(authModule)

await modules.run({ db: fake<Db>({ query: async () => rows }) }, async (app) => {
  expect(await app.auth.verifyOtp('a@b.c', '1234')).toEqual(session)
})
```

- **`fake<T>(partial)`** — strict partial stub: stubbed members respond,
  touching anything else throws with the property name.
- **`test(chain).run(input, scope)`** — per-key substitutions applied at
  the key's *birth*: downstream closures receive the fake wherever the
  provide sits, no restructuring needed. Typed as `Seed & Partial<Ctx>`,
  so typos and wrong types do not compile. Combined with keyed verbs
  (`provide('db', ...)`) the real layer is **skipped outright**; with
  `lazy()` the real creation never happens.

The mock ladder, from most structural to most pragmatic: seed boundary →
keyed + `test()` (total skip) → `test()` + `lazy` → `test()` plain →
`override` (deliberate in-chain variants — note it is positional: it
affects downstream layers and does not rewrite already-wired closures).

## Patterns

**Singletons & vertical chains.** A layer runs once per run: within a
chain, singletons are structural. Verticals (route blocks, feature areas)
are fragments that *require* shared infrastructure via their Seed; the
composition root creates it once. Independent processes share by passing
one chain's built app as another chain's seed.

**Dev/HMR.** In dev the bootstrap module may be re-evaluated. Memoize the
build *promise* (the promise, not the app — concurrent evaluations would
race):

```ts
const g = globalThis as { __app?: ReturnType<typeof boot> }
const { app, dispose } = await (g.__app ??= chain.build(env))
// or, for fresh code on every hot update:
import.meta.hot?.dispose(() => dispose())
```

**Classes.** Conventions, not requirements: class instances are perfect
context values (clients, errors); a class with constructor-injected deps
is the OO spelling of `bind` (`expose('auth', (ctx) => new AuthService(ctx))`
works today); under a window, per-call deps mean per-call instances.

**Events / CQRS.** The bus is a dep; emitting is calling a dep; an event
handler is a bare leaf `(deps, event)`; subscribing is a layer (the onion
gives subscribe/unsubscribe lifecycle); a consumer is a separate chain
processing each message in a per-call window — where the error convention
maps directly onto ack/nack: returned domain error → ack (dead-letter with
a reason), thrown infrastructure error → nack (redelivery). The
transactional outbox is just a bridge: `within(db.transaction, (tx) =>
({ db: tx, events: outboxEmitter(tx) }))` — commit makes the event
durable, rollback evaporates it with the writes.

## The type contract

The engine is guaranteed by tests (it contains structural `any`s: an array
cannot carry each layer's evolving generics). The types guarantee the
**user's world**, and the contract is one sentence: *every configuration
error surfaces immediately, at the call site, at compile time* — duplicate
keys are named, unsatisfied requirements (layer, fragment, seed) do not
compile, branded leaves cannot be wired without their window, and
inference never asks for annotations where the information already exists.
The `*.test-d.ts` suite is the proof of that contract: if an internal
refactor breaks it, the refactor is wrong even if the runtime tests pass.

## Roadmap

- request-scoped dependencies (they live in the dialects, which hold the request)
- parallel boot of independent layers
- `any` → `unknown` pass in the engine internals
- teardown error aggregation
- companion dialects: `@lntt/http` (available), `cli` / `listener` / `flow` (planned)
