# `@lntt/example-workers-hono`

The scope runtime on **Cloudflare Workers**, where the rule the other examples
only state is enforced by the runtime itself.

It is standalone: nothing here comes from `@lntt/example-app`, which cannot run
on Workers (PGlite). The chain is a link store backed by a **KV binding**, small
enough to read in one sitting — the subject is the runtime, not the persistence.

## The shape is the shape

Same layout as every other entry (§37), and that is the claim:

```
src/config/env.ts        where the environment comes from — the ONE different file
src/bootstrap/index.ts   the composition root: the pack, built once
src/server.ts            the mount, plus `export default app`
```

`src/server.ts` and `src/bootstrap/index.ts` are the Node files with the import
swapped. `config/env.ts` is where Workers actually differs:

```ts
import { env } from 'cloudflare:workers'
```

instead of `process.env`. Vars, secrets and binding objects are all readable at
module scope, so the file's shape does not change — which is what
`examples/hono` and `examples/express` assert in a comment and this package
executes.

## What the runtime enforces, and what it does not

The build must be LAZY (§36): the store layer reads KV, a KV read is
asynchronous I/O, and Workers allow none outside a request. Not a preference
here — a worker that builds its app at module scope **does not start**:

```
Uncaught Error: Disallowed operation called within global scope. Asynchronous
I/O (ex: fetch() or connect()), setting a timeout, and generating random values
are not allowed within global scope.
```

`test/fixture/eager-worker.ts` is `bootstrap/index.ts` with the build moved out
of the thunk, and `test/module-scope.node.test.ts` asserts the runtime refuses
it. Note what the ban covers: asynchronous **I/O**, not async work. The same
layer's `crypto.subtle.digest` is CPU and passes at module scope — it is
touching a BINDING that is refused.

## Two ways in for the environment, compared

This entry carries the same app twice, differing in one line:

| entry | composition root | where the bindings come from |
|---|---|---|
| `src/server.ts` | `src/bootstrap/index.ts` | `import { env } from 'cloudflare:workers'`, at module scope |
| `src/server-from-host-env.ts` | `src/bootstrap/from-host-env.ts` | Hono's per-request `c.env`, via `seedFrom(hostEnv)` |

The second is the only place an **app** in this repo reads `seedFrom`'s
parameter. (The signature is not unique to Hono: the React Router pack carries it
too, for `args.context` — RR7's load context.)

`test/env-parity.node.test.ts` drives both workers — each with its own KV
namespace, so neither borrows the other's state — through the same sequence of
reads, writes, a duplicate-slug 409 and a schema 422, and asserts identical
responses. They are identical.

Read that for exactly what it is. Within one worker, `c.env` and
`import { env } from 'cloudflare:workers'` are the SAME bindings object, so no
response can reveal which one a seed read: this file proves the two wirings
behave alike, NOT that the parameter is redundant. What the parameter actually
receives is asserted where it can be observed —
`packages/integration/test/hono.test.ts`, against the pack.

What the pair does show is narrower and still worth having: on this runtime the
config module is sufficient, so an app does not need the parameter to reach its
bindings.

One consequence is visible rather than argued: the seed is a THUNK evaluated only
on the build that happens (§36), so the `c.env` variant reads the FIRST request's
env and ignores every later one. It is not a per-request seed — there is no such
thing; a per-call axis is a window (principle 4).

## The same app with no pack at all

[`examples/cloudflare-workers/bare`](../bare) serves this chain and these scopes
from a hand-written `fetch` handler: `buildOnce` called directly, the carrier
assembled by hand, `runScope`, and the three brands named in one signature. Read
side by side with `src/server.ts`, the difference is the routing table and
nothing else — which is what a pack is worth.

## Two test projects, because one tool cannot do both

| project | tool | vantage point | what it proves |
|---|---|---|---|
| `workerd` | `@cloudflare/vitest-plugin` | test bodies run INSIDE workerd | behaviour: routing, the fold, aborts, the env arriving from `cloudflare:workers`, build-once |
| `node` | `createTestHarness` (wrangler) | real workers started from outside | that a module-scope build is refused |

The second exists because the first **cannot** prove it. The plugin loads
modules through Vitest's own module runner, from within a request, so under it
module scope is always an I/O context: a module-scope `fetch()` goes straight
through. `createTestHarness` starts a worker the way a deployment does — workerd
evaluating the module graph at isolate startup — which is the only place the ban
is observable.

## #39, reproduced

`surface.test.ts` writes a link to KV **after** the first request and asserts it
does not appear: the app was built once for the isolate and the store was read
then. That is exactly the mechanism behind #39 — an isolate outliving a
binding-only deploy and serving from what the bindings held before — now a
passing test rather than a paragraph.

## Running it

```sh
pnpm --filter @lntt/example-workers-hono test        # both projects
pnpm --filter @lntt/example-workers-hono typecheck   # regenerates worker types first
pnpm --filter @lntt/example-workers-hono dev         # wrangler dev
```

Everything is local: Miniflare serves KV with no account and no credentials.
