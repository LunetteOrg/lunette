# @lntt/scope

The host-agnostic **scope runtime** for [`@lntt/wire`](../wire): ONE primitive —
a step wrapping the rest of the fold — and a scope that IS the function running
it. Wire builds the app once at boot; `@lntt/scope` handles what happens **per
request** — authentication, authorization, resource prefetch, and the use case
itself — without an onion, an AsyncLocalStorage, or a framework.

## Install

```sh
pnpm add @lntt/scope
```

Requires TypeScript 7 or newer with `strict: true`, and Node 24 or newer. ESM
only. Each host lives behind its own subpath — `@lntt/scope/express`,
`/hono`, `/trpc`, `/react-router` — and carries its framework as an OPTIONAL
peer, so the agnostic entry pulls in none of them.

### Where the constraints are written

The package ships its commented `.ts` sources beside the build, and the
declarations carry maps into them: "go to definition" on any exported type
lands on the source, where the constraint behind that type is written, not on
a `.d.ts` that carries the shape without the reason. Nothing to configure —
this is what a normal install already does, while still compiling `dist`.

Resolving the sources is a separate, deliberate act: the package declares an
`@lntt/source` export condition, met by nobody who has not asked for it.

```jsonc
// tsconfig.json — "moduleResolution": "bundler" | "node16" | "nodenext"
{ "compilerOptions": { "customConditions": ["@lntt/source"] } }
```

```ts
// vite / vitest
export default defineConfig({ resolve: { conditions: ['@lntt/source'] } })
```

What that takes back onto the consumer is the reason it is not the default. The
`tsconfig` re-enters the contract: under `strictFunctionTypes: false` the ctx
lock is silently gone — a step annotating a wider ctx compiles. And the runtime
has to read `.ts` at all, which the built path never asks of it.

## A scope, whole

```ts
import { bind, lunette, type PubOf } from '@lntt/wire'
import { scope } from '@lntt/scope'

// The chain, built once at boot, and what it exposes — see `@lntt/wire`.
const chain = lunette()
  .provide('repo', () => makeRepo())
  .expose('posts', (ctx) => bind({ getPost, publishPost })(ctx.repo))

type Deps = PubOf<typeof chain>

const showPost = scope<{ readonly id: string }>()
  .step(async ({ posts }: Deps, { id }) => posts.getPost(id))

const { app: deps } = await chain.build()
await showPost(deps, { id: '1' })   // Post | NotFound
```

That is all of it. `scope()` starts one, `.step` adds to it, and **the value it
hands back IS the function that runs it, from the first line** — no closing
verb, and nothing to build (the `build()` above is the CHAIN's, the other
lifetime).

A scope takes two arguments, split by LIFETIME. First the **app**: the chain
wire built once at boot, alive as long as the process, and what every later
snippet here calls `deps`. Second the **scope execution parameters**: everything
that belongs to this one invocation. `scope<Args>()` declares the second by
hand, which is what a scope with no host does; `scope(carrier)` takes it from a
carrier instead (below), and then a **mount** — the small wrapper each host
subpath ships, which turns a scope into the handler that host expects — builds
them for you out of the request and calls the scope with both.

## One primitive: `.step`

A **step** wraps the rest of the fold: it reads the app and the ctx as they
stand, and either continues inward with what it populates or hands back
something of its own and stops. Every verb that touches the fold is sugar over
this one — a verb is a function from its own arguments TO A STEP.

The **fold** is the ordered list of steps, run from the outside in; its **leaf**
is the innermost one, the step that does not call `next`.

A step says three things, and each one rides a position the signature already
has — so a step is a plain function and declares nothing beside itself:

| what it says | where it lives |
|---|---|
| what it asks of the app | the first parameter's type |
| what it reads of the run | the second parameter's type |
| what it populates downstream | `next`'s parameter type — **annotated** |

```ts
import { scope, type Next } from '@lntt/scope'

const publish = scope<{ readonly id: string; readonly token: string }>()
  .step(async (_app: {}, { token }, next: Next<{ actor: string }>) =>
    token === '' ? { error: 'unauthorized' as const } : next({ actor: token }),
  )
  .step(async ({ posts }: Deps, { id, actor }) => posts.publishPost(id, actor))   // `Deps` as above
```

The first parameter accumulates: what every step asks of the app is what the
scope demands of the chain, checked at the call and at the mount. The second is
the run's parameters plus everything the steps before it populated — `actor` is
readable in the leaf because the step above it put it there, and it is typed
because that step said so. Written INLINE it needs no annotation of its own: the
scope supplies its type, which is why it is bare in every snippet here. A step
written as a standalone function annotates what it reads, and that annotation is
what makes it portable — it names an entry rather than a host. The ctx is
READ-ONLY, shallowly, whatever the carrier declared.

**The third one is a declaration, not an inference** — measured. `Add` occurs
only in a parameter position of `next`, so a step written
`(app, ctx, next) => next({ user })` populates nothing as far as the builder is
concerned: the annotation `next: Next<{ user: User }>` is what says it, and it
sits on the parameter it describes.

**Not calling `next` ends the fold**, and there is nothing to declare for that
either — no terminator, no closing verb. **Everything runs where it was
written**: one ordered list, no category hoisted, which is why a body-reading
step placed after an authenticating one parses a payload only for requests that
got past the guard.

## What a step hands back

A step returns a value and **the fold hands it back untouched** — no `ok`, no
`Outcome`, no branch to unwrap. What a scope yields is the union of what its
steps return, so `publish` above hands back
`{ error: 'unauthorized' } | Post | NotFound`: the guard's refusal stands beside
the leaf's result, in the type and at runtime.

That is the project's posture rather than a detail of the fold. **A returned
value is a domain outcome**: it passes through — commit, no retry, ack. **A
thrown error is infrastructure**: react to it — rollback, retry, nack. The pivot
is the same on every host, and each mount answers a throw in its host's own door
(Express's error middleware, Hono's `HTTPException`, tRPC's `TRPCError`, a thrown
`data()` on React Router). So a guard that refuses RETURNS its refusal; nothing
is caught for you and nothing is normalised (§42).

One shape is refused: a step that hands back nothing at all. Forgetting `return`
in front of `next(…)` is silent and plausible — the inner steps run, the leaf
computes its value, and the wrapper's `undefined` is handed back instead — so
the gate lands on the step that did it, rather than as `T | undefined` in
whichever file finally reads the result. A leaf that really has nothing to hand
back writes `return undefined` and passes.

## Carriers

A **carrier** says who is on the other end and what a single run brings with it:
Express's `req` and `res`, Hono's `c`, a tRPC resolver's `input` and `ctx`,
React Router's `request` and `params`. It fixes the type of the scope's second
argument, and that is its whole job.

It is **chosen exactly once**, in `scope(carrier())`, and it is **pure
declaration** — no runtime value, no fold work, never a step. Which is why there
is no `.extend(carrier)`: as a step, two carriers would be expressible on one
scope and would fail only later, at the mount, by accident.

```ts
import expressLib from 'express'
import { scope } from '@lntt/scope'
import { express, expressCarrier } from '@lntt/scope/express'

const { route, handler, mw } = express(deps)   // the mounts, curried with the app

const showPost = scope(expressCarrier())
  .step(async ({ posts }: Deps, { res }) => res.json(posts.getPost('1')))

const app = expressLib()
app.get('/posts/1', handler(showPost))
```

**The words are the host's, not the core's.** No HTTP name appears anywhere in
the core: a leaf writes `res.status(404).json(…)` or `c.json(v, 404)` — its own
host's shape, which the mount then checks that host can really send. The core
owns the mechanism and never the alphabet.

**A carrier declares nothing about what a scope READS** of a request: that is
the schema's to say, and it is said per BRANCH rather than per scope — the
reason is *A verb is per branch; a type argument is per scope*, below.

`scope()` with no carrier reads nothing of the request and mounts on all four
hosts — the one wholly portable shape. Between the two there is a middle, and
**Reading a request** below is where it lives.

## Extending the builder

```ts
.step(fn)        // acts on the FLOW    — the step list grows
.extend(ext)     // acts on the BUILDER — the step list does not
```

An extension contributes **verbs**, and a verb is a function from its own
arguments TO A STEP — so the fold work happens when the verb is CALLED, and a
STEP stays the only thing that ever joins the fold: `.extend` itself pushes
none. `@lntt/scope/guard` ships three:

| verb | what it does |
|---|---|
| `.guard(check, onError)` | ADDS a ctx entry from what the check returned; the check refuses with `fail(issues)` |
| `.refine(name, check, onError)` | REPLACES an entry the ctx already holds |
| `.validate(name, schema, onError)` | `refine` with the check supplied by a [Standard Schema](https://standardschema.dev) |

**Extension** covers two things, and the two arrive by different verbs. One
contributes VERBS and is added with `.extend`, as `guards` is. The other is a
plain STEP that populates a ctx entry from the host's own request, and is added
with `.step`, as `headers` is below — see **Reading a request** for that half.

```ts
import { expressCarrier, headers } from '@lntt/scope/express'
import { fail, guards } from '@lntt/scope/guard'

const withActor = scope(expressCarrier())
  .extend(guards)
  .step(headers)   // an extraction step: it populates `ctx.headers`
  .guard(
    (_app: {}, { headers: h }) =>
      h['x-actor-id'] ? { actor: h['x-actor-id'] } : fail([{ message: 'unauthorized' }]),
    (issues, { res }) => res.status(401).json({ issues }),
  )
```

A verb may REPLACE a ctx entry where `.step` may only add — that bypass is what
`refine` and `validate` are for, and it is why the primitive refuses a
re-populated key rather than resolving it: the difference between a refinement
and a collision is intent, which no type can read.

## What ships, per host

Framework-free by construction, and dependency-free: the core has none at all,
not even types-only. A carrier ships as a SUBPATH of this package, carrying its
host's mount with it — there is no separate adapter package, because a carrier
that hands back its host's own mount helpers leaves one nothing to be (§43).
The four that ship take their frameworks as OPTIONAL peer dependencies, so the
core stays dependency-free for anyone importing it:

| subpath | the mount factory | it hands back |
|---|---|---|
| `@lntt/scope/express` | `express(deps)` | `{ route, handler, mw }` — `route(pattern, scope)` checks the pattern, `handler(scope)` skips it — and, exported beside the factory, the read steps `params`, `query`, `cookies`, `headers`, `body(encoding, onError)` |
| `@lntt/scope/hono` | `hono(deps)` | `{ route, handler, mw }` — `route(pattern, scope)` checks the pattern, `handler(scope)` skips it — and, exported beside the factory, the read steps `params`, `query`, `cookies`, `headers`, `body(encoding, onError)` |
| `@lntt/scope/trpc` | `trpc(t, deps)` | `{ carrier, procedure, middleware }` — a resolver and a middleware, the two tRPC has |
| `@lntt/scope/react-router` | `reactRouter(deps)` | `{ loader, action }` — two shapes, never a middleware — and the read steps `query`, `cookies`, `headers`, `body(encoding, onError)`; `params` needs none, the carrier brings it |
| `@lntt/scope/guard` | — | `{ guards, fail }` — the extension: `.guard(check, onError)` adds an entry, `.refine(name, check, onError)` replaces one, `.validate(name, schema, onError)` is refine with the check given by a Standard Schema |

tRPC's carrier comes OUT of the factory rather than being imported beside it,
because its context is the APPLICATION's type and `t` already holds it: pass the
builder and the context is inferred, written nowhere. What a scope reads of the
INPUT it says in the SCHEMA — the same way it says what it reads of a URL — and
that is checked against the procedure it mounts on:

```ts
const Id = z.object({ id: z.string() })

const byId = scope(carrier())
  .extend(guards)
  .validate('input', Id, onError)
  .step(async ({ posts }: Deps, { input }) => posts.getPost(input.id))   // typed, no cast

t.procedure.input(Id).query(procedure(byId))                             // ✓
t.procedure.input(z.object({ slug: z.string() })).query(procedure(byId)) // refused
t.procedure.query(procedure(byId))                                       // refused
```

There is no gate of ours behind that: `procedure` puts what the scope validated
in the RESOLVER'S PARAMETER, tRPC hands that resolver the schema's OUTPUT, and a
resolver demanding what the schema does not supply is refused at the argument by
contravariance — the same mechanism `DepGuard` relies on. `.output(schema)` is
checked the other way round, against what the leaf returned. One schema value,
referenced twice; nothing declared twice.

A tRPC MIDDLEWARE cannot validate the input — its leaf strips `input` by name
before `next({ ctx })`, so the narrowed value would never reach the procedure
downstream, and the mount says so. A middleware that must read the input narrows
it by hand.

**No carrier declares what a scope reads**, on any of the four. A carrier's type
arguments are for what the run BRINGS — Hono's env is the only one — and
what a scope reads of an entry is the schema's to say.

The reason is not tidiness: a type argument is fixed at `scope(carrier<X>())`,
the first call, so every branch inherits it and one base value could not serve
two routes reading different params. **A verb is per branch; a type argument is
per scope** — and a base value others extend is the unit this library is built
around.

```ts
const base   = scope(carrier()).extend(guards).step(shared)   // one gate, one set of reads
const byId   = base.validate('params', z.object({ id:   z.string() }), onErr)
const bySlug = base.validate('params', z.object({ slug: z.string() }), onErr)
```

On React Router, where no pattern ever reaches a mount, the same schema rides
the mount's own parameter — so a route module's
`satisfies (a: Route.LoaderArgs) => unknown` refuses a route supplying something
else, which is a check it never had.

On Express and Hono a scope is a VALUE and the mount is the host's own call:

```ts
export const showPost = scope(expressCarrier())
  .extend(guards)
  .step(params)
  .validate('params', z.object({ id: z.string().regex(/^\d+$/) }), (issues, { res }) =>
    res.status(400).json({ issues }),
  )
  .step(async ({ posts }: Deps, { params, res }) => res.json(posts.getPost(params.id)))

app.get(...route('/posts/:id', showPost))      // the pair, pattern CHECKED
app.get('/posts/:postId', handler(showPost))   // the bare handler, nothing checked
```

**What the URL carries is said once, in the schema**, and the same schema does
two jobs: it validates the value at runtime, and it is what `route` compares the
mounted pattern against.

```
⛔ this route does not supply a param the scope validates: id
```

The comparison runs in ONE direction — the scope demands, the route supplies —
so a route supplying MORE than the schema demands passes, which is the verdict
`DepGuard` already gives the chain and what lets one scope mount under a nested
route. Optionality counts on both sides: `/posts{/:id}` (Express) and
`/posts/:id?` (Hono) also match WITHOUT the param, so they do not satisfy a
schema that demands it. On a pattern it cannot read (a non-literal string), or a
scope that validates no params, the gate has NO OPINION. The reading is each
framework's own — Express's `RouteParameters`, Hono's `ParamKeys` — never a
parser of ours.

Hono says all of it the same way, with `honoCarrier()` and its own `params`:

```ts
export const showPost = scope(honoCarrier())
  .extend(guards)
  .step(params)
  .validate('params', IdParam, (issues, { c }) => c.json({ issues }, 400))
  .step(async ({ posts }: Deps, { params, c }) => c.json(posts.getPost(params.id)))
```

The one-argument form cannot check anything, and that is a fact about the hosts
rather than a choice: a handler we return always tells Express what its params
are, so its own `RouteParameters` default is never used, and Hono's
`Context<Env, Path>` is mutually assignable across paths. Seven handler shapes
were measured against this and none reaches the pattern. It reaches a type of
ours only by being an argument to one — which is what the two-argument form is.

`mw` takes no pattern: `app.use(…)` mounts across routes.

On Hono the mount hands back what the SCOPE hands back, not a bare `Response`,
so the typed RPC client keeps working end to end:

```ts
const app = new Hono()
  .get(...route('/posts/:id', showPost))
  .get(...route('/health', health))

const client = hc<typeof app>('http://localhost')
const res = await client.posts[':id'].$get({ param: { id: '1' } })
await res.json()   // { id: string; title: string } — not `unknown`
```

Both the value the leaf built and the status it chose survive as literals.

**Every mount is transparent**, on all four: it hands back the host's own type
with what the scope knows filled in, never the widest thing that compiles.

| subpath | what the mount carries through |
|---|---|
| express | the LOCALS a middleware derives — `LocalsOf<…>` read off what `mw(scope)` handed back, not off `mw` itself |
| hono | what the leaf returned, value and status, for `hc<typeof app>()` |
| trpc | the resolver's return type (`inferRouterOutputs`, and what `.output(schema)` checks), the INPUT a scope declares (checked against `.input(schema)`), and a middleware's CONTEXT OVERRIDE — what its steps derived reaches every procedure that `.use`s it |
| react-router | what the loader or action returned, which is `useLoaderData<typeof loader>()` |

Each is pinned in that subpath's `*.test-d.ts`, because none of them can fail a
runtime test: a mount that erases a type still serves the right bytes, and the
loss shows up in someone else's file as `unknown`.
Declaring the mount `Promise<Response>` erases them and `hc` answers `unknown`,
which is why the return type is threaded through and pinned in
`hono/index.test-d.ts`.

## Reading a request, and refining what was read

The two halves are deliberately apart. An **extension EXTRACTS**: it populates a
ctx entry from the host's own request, with the right encoding, and it knows
which host it is on. A **verb REFINES**: it replaces an entry with a narrower
one, and knows nothing about any host.

```ts
scope(expressCarrier())
  .extend(guards)
  .step(body('json', (issues, { res }) => res.status(400).json({ issues })))
  .validate('body', postSchema, (issues, { res }) => res.status(422).json({ issues }))
  .step(async (_app: {}, { body, res }) => res.status(201).json({ title: body.title }))
```

The extraction is per host; **everything downstream of it is not**. A step
annotating `{ query: Query }` names no carrier, so it mounts wherever a `query`
entry was populated — which is the only way a request-reading step travels
between hosts.

`onError` is mandatory and there is no default, because the only carrier-free
one would be to throw, and a thrown error means infrastructure. What it returns
joins what the scope can yield, so a mount refuses at compile time an `onError`
building something its host will never send.

## The gates, by what they catch

Every one of these is a compile error, and every one of them lands on the line
that contains the mistake — an adopter meets them as messages, so they are
listed by what they catch rather than by how they are built.

| the mistake | where it lands | what it says |
|---|---|---|
| the chain does not expose what the steps ask of the app | the call, and the mount, alike | `__ERROR_chain_Pub_missing_deps`, carrying what the scope demands |
| a step hands back nothing — `return` forgotten in front of `next(…)` | the `.step` argument | ⛔ this step returns nothing — did you forget `return` in front of `next(…)`? |
| a step populates a ctx key another step already populated | the `.step` argument | ⛔ this ctx key is already populated: `actor` — an extension may REPLACE it, a step may not |
| `guard` adds a key already populated | the check argument | ⛔ … — `refine` replaces an entry, `guard` may only add |
| `validate` or `refine` names an entry the ctx has not got | the name argument | the valid names, listed: `"wrong"` is not assignable to `"res" \| "params" \| "req" \| "next"` — and `never` on a scope holding nothing to refine |
| two extensions contribute one verb name, or a verb shadows the scope's own surface | the `.extend` argument | ⛔ a verb under this name is already contributed: … / ⛔ a verb cannot be named: … |
| a step reads a ctx the scope does not hold | the `.step` argument | the missing member, named — contravariance, not a gate of ours, and the one check a consumer's `strictFunctionTypes: false` turns off |
| a scope written for another host | the mount argument | the run's parameters are not assignable — contravariance again |
| the mounted route does not supply a param the scope validates | the mount argument | ⛔ this route does not supply a param the scope validates: `id` |
| the leaf hands back a value the host will never send | the mount argument | ⛔ answer on `res`: … (Express) / ⛔ a middleware answers with a Response: … (Hono) |
| a middleware derives a ctx key the run itself brought | the mount argument | ⛔ this middleware derives a ctx key the run itself brought: `res` — the leaf strips those by name, so it would never arrive |

The last four are the mount's, and only the mount's: the same scope is correct
on another host, so they cannot be asked any earlier.

## Worked examples

`examples/app` is one chain and one domain, mounted unchanged on four hosts —
`examples/express`, `examples/hono`, `examples/trpc` and `examples/rr7`. What
they differ in is what the host makes different, and nothing else.

## Considered and closed

A guard reusable across carriers as a packaged unit was considered (#67) and
closed: a shared prefix is already a scope VALUE kept and branched from twice
— `const authBase = base.guard(...)`, then `authBase.step(leafA)` and
`authBase.step(leafB)` — with no mechanism beyond what `.step`/`.guard`
already are. The verdict is decision 55 in `docs/decisions.md`.

## Status

Research-grade, pre-1.0, not yet published. Part of the scope-runtime work
tracked in issue #30.
