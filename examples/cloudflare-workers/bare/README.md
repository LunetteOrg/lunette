# `@lntt/example-workers-bare`

**The scope runtime on Cloudflare Workers with no pack at all** — a `fetch`
handler calling `runScope` by hand.

[`examples/bare-express`](../../bare-express) makes this point where the lazy
build is merely *advisable*. Here it is **mandatory**, and that is the whole
reason this entry exists on this runtime.

## What the file contains

Four sections, and `src/server.ts` is short enough to read in one sitting:

1. **build once, lazily** — the `buildOnce` handle at module scope, the BUILD
   inside the handler. The store layer reads KV, and a KV read outside a request
   is asynchronous I/O the runtime refuses, so an eager build here does not fail
   a request — it stops the worker from STARTING (§36).
2. **the mount** — `DepGuard` and `CarrierGuard` named in one signature. They
   ship from `@lntt/scope`, not from the adapters, so a host we ship nothing for
   keeps its compile-time gates by naming two types (§34).
3. **routing** — hand-rolled, because there is no framework here to own it.
4. the `fetch` export.

The only import from `@lntt/integration` is `outcomeToResponse`, the outcome
codec — the primitive a pack *composes*, which no scope enters. A Fetch host
needs no request lift (the runtime hands over a `Request`) and no response writer
(returning one is the contract), so this is the shortest the pattern gets.

## What it demonstrates

**An adapter buys routing.** The chain, the scopes and `config/env.ts` here are
the ones [`../hono`](../hono) serves through its pack, and `test/surface.test.ts`
asserts the same responses its packed sibling does — written out rather than
compared across packages, so neither example depends on the other (#40). Read the
two entries side by side: everything above the route table is identical work.

**The gate survives the absence.** This carrier declares `cookies` and `headers`
— the codec renders both — but not `body`, since nothing here reads a request
body. So `createScope`, which declares a `.body` channel, **cannot be mounted**:
`src/server.test-d.ts` carries both directions, and it is checked by
`pnpm typecheck` (the Workers packages run no vitest typecheck project, so an
unused `@ts-expect-error` surfaces as TS2578 from `tsc`).

## What is proven next door

The no-I/O-outside-a-request rule is asserted against the identical chain in
[`../hono`](../hono), which carries a fixture worker the runtime refuses to
start, driven through `createTestHarness`. Not repeated here: the machinery would
be a third copy proving the same thing about the same layer.

```sh
pnpm --filter @lntt/example-workers-bare test        # inside workerd
pnpm --filter @lntt/example-workers-bare typecheck   # regenerates worker types first
pnpm --filter @lntt/example-workers-bare dev         # wrangler dev
```

Everything is local: Miniflare serves KV with no account and no credentials.
