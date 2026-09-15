---
title: "Build-once is a free function the host holds; the seed is process-static"
area: scope-runtime
status: accepted
---

# Build-once is a free function the host holds; the seed is process-static

**Decision.** An app is built ONCE per process (per isolate on Workers) and
memoized, LAZILY on first use. That memo is `buildOnce(chain)` — a free function
in `@lntt/wire` returning `{ ensure, dispose }`, NOT a method on `Lunette` and
NOT a copy inside each host pack. Its purpose is IDENTITY, not speed: the
chain's singletons (a db pool, a client) must exist once, and a second build
would open a second pool and orphan the first. `ensure` takes the seed as a
THUNK, evaluated only on the build that actually happens; the seed is read once
and never again. A seed that varies per call is therefore not "ignored" — it is
never computed. Multiplicity per tenant is expressed with a LEASE (per call,
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
them all) to serve a case the lease already covers. (d) Fail fast when a
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
[the single-lifecycle handle](./buildonce-handle-single-lifecycle-dispose-ends.md): the handle is single-lifecycle, so teardown ends it rather than emptying it.
