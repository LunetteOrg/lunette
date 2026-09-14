---
title: "The example entries share one shape; the composition root is a module singleton"
area: scope-runtime
status: accepted
---

# The example entries share one shape; the composition root is a module singleton

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
build is lazy and the seed is a thunk ([build-once as a free function the host holds](./build-once-free-function-host-holds.md)), so the composition root reads the
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
