# @lntt/scope

The host-agnostic **scope runtime** for [`@lntt/wire`](../wire): a per-invocation
guard/leaf model with a typed input contract, run as a fold. Wire builds the app
once at boot; `@lntt/scope` handles what happens **per request** — authentication,
authorization, resource prefetch, and the use case itself — without an onion, an
AsyncLocalStorage, or a framework.

Framework-free by construction, and dependency-free: the core has none at all,
not even types-only. A carrier ships as a SUBPATH of this package, carrying its
host's mount with it — there is no separate adapter package, because a carrier
that hands back its host's own mount helpers leaves one nothing to be (§43).
The four that ship take their frameworks as OPTIONAL peer dependencies, so the
core stays dependency-free for anyone importing it:

| subpath | the mount factory | it hands back |
|---|---|---|
| `@lntt/scope/express` | `express(deps)` | `{ route, handler, mw }` — `route(pattern, scope)` checks the pattern, `handler(scope)` skips it |
| `@lntt/scope/hono` | `hono(deps)` | `{ route, handler, mw }` — `route(pattern, scope)` checks the pattern, `handler(scope)` skips it |
| `@lntt/scope/trpc` | `trpc(t, deps)` | `{ carrier, procedure, middleware }` — a resolver and a middleware, the two tRPC has |
| `@lntt/scope/react-router` | `reactRouter(deps)` | `{ loader, action }` — two shapes, never a middleware |

tRPC's carrier comes OUT of the factory rather than being imported beside it,
because its context is the APPLICATION's type and `t` already holds it: pass the
builder and the context is inferred, written nowhere. What a scope reads of the
INPUT it declares itself — `carrier<{ id: string }>()` — and that is checked
against the procedure it mounts on:

```ts
const byId = scope(carrier<{ id: string }>()).step(
  async ({ posts }: Deps, { input }) => posts.getPost(input.id),   // typed, no cast
)

t.procedure.input(z.object({ id: z.string() })).query(procedure(byId))   // ✓
t.procedure.input(z.object({ slug: z.string() })).query(procedure(byId)) // refused
t.procedure.query(procedure(byId))                                       // refused
```

There is no gate of ours behind that: tRPC hands a resolver the schema's OUTPUT,
so a scope reading what the schema does not supply is refused at the argument by
contravariance — the same mechanism `DepGuard` relies on. `.output(schema)` is
checked the other way round, against what the leaf returned.

On Express and Hono a scope is a VALUE and the mount is the host's own call:

```ts
export const showPost = scope(expressCarrier<{ id: string }>())
  .step(async ({ posts }: Deps, { req, res }) => res.json(posts.getPost(req.params.id)))

app.get('/posts/:id', route(showPost))         // the handler, nothing checked
app.get(...route('/posts/:id', showPost))      // the pair, pattern CHECKED
```

The carrier says which params the scope reads (`expressCarrier<{ id: string }>()`
on Express, the pattern itself on Hono: `honoCarrier<'/posts/:id'>()`), and that
is what types `req.params.id` / `c.req.param('id')` with nothing annotated on
the step. Give `route` the pattern as well and it is compared against that
declaration:

```
⛔ this route does not supply a param the scope reads: id
```

The comparison runs in ONE direction — the scope demands, the route supplies —
so a route supplying MORE than the scope reads passes, which is the verdict
`DepGuard` already gives the chain and what lets one scope mount under a nested
route. On a pattern neither reader can read (a non-literal string) the gate has
no opinion. The reading is each framework's own: Express's `RouteParameters`,
Hono's `ParamKeys` — never a parser of ours.

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
  .get('/posts/:id', route(showPost))
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
| express | the params a route declares; the LOCALS a middleware derives (`LocalsOf<typeof mw>`) |
| hono | what the leaf returned, value and status, for `hc<typeof app>()` |
| trpc | the resolver's return type (`inferRouterOutputs`, and what `.output(schema)` checks), the INPUT a scope declares (checked against `.input(schema)`), and a middleware's CONTEXT OVERRIDE — what its steps derived reaches every procedure that `.use`s it |
| react-router | what the loader or action returned, which is `useLoaderData<typeof loader>()` |

Each is pinned in that subpath's `*.test-d.ts`, because none of them can fail a
runtime test: a mount that erases a type still serves the right bytes, and the
loss shows up in someone else's file as `unknown`.
Declaring the mount `Promise<Response>` erases them and `hc` answers `unknown`,
which is why the return type is threaded through and pinned in
`hono/index.test-d.ts`.

## The error convention

A **returned** value is a domain outcome: it passes through — commit, no retry,
ack. A **thrown** error is infrastructure: react to it — rollback, retry, nack.
The pivot is the same on every host, and each mount answers it in its host's own
door (Express's error middleware, Hono's `HTTPException`, tRPC's `TRPCError`, a
thrown `data()` on React Router).

The fold produces nothing of its own on top of that: a scope hands back what its
leaf RETURNED, and whether that went well is the carrier's statement, not the
core's (§42). There is no `Outcome`, no `Abort`, and no branch to unwrap.

## Not here yet

Two things the carriers deliberately leave out, so that neither is designed
against a surface still in motion:

- **guards** as a named shape, beyond "a step that stops" — #67. Every test in
  this package writes its own guard inline for exactly that reason.
- **validation**, and with it the input contract — #64. It comes back as a step
  factory, per entry rather than per carrier.

Extensions and the worked examples come back after those, on the settled core.

## Status

Research-grade, pre-1.0, not yet published. Part of the scope-runtime work
tracked in issue #30.
