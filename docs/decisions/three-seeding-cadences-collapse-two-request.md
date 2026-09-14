---
title: "Three seeding cadences collapse to two; the request window nests the transaction window"
area: scope-runtime
status: accepted
---

# Three seeding cadences collapse to two; the request window nests the transaction window

**Decision.** The Seed of [two-sided composition](./two-sided-composition-seed.md) is read at cadences distinguished by
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
  memoized boot of [the per-request-env platforms](./per-request-env-platforms-get-lazy.md) (issue #12's concern) to every host.
- **Tier 2 — per-request.** The scope window: the guard/leaf fold. Each
  invocation gets a fresh cookie sink + enrichment bag; the built app is
  threaded read-only; the handler's requirement (`deps`) and the route
  params are reconciled against the chain's `Pub` and the host's route at
  the adapter — a missing dep or a wrong param is a compile error THERE.
  This mirrors wire's Seed-vs-Ctx mount check ([two-sided composition](./two-sided-composition-seed.md), and [what crosses a mount](./mount-only-public-surface-crosses-lexical.md)).

**Window nesting.** The request window (outer) and a transaction window
(inner — a wire `window()` / `.with`) are independent and compose ONLY
through [the error convention](./errors-returned-domain-thrown-infrastructure.md): a RETURNED domain value means
the inner transaction committed AND the outer scope emits its 2xx/4xx; a
THROWN infrastructure error means the inner rolled back AND propagates as
5xx. No ambient storage, no implicit join (principle 7).

**Alternatives.** (a) The pack takes a BUILT app plus a separate boot step:
splits lifecycle ownership across two callers and reopens the two-teardown
ambiguity [only the public surface crossing a mount](./mount-only-public-surface-crosses-lexical.md) rejected. (b) A per-request build keyed by the seed:
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
capability — taking over the response means taking over its contract ([the capability gate](./carrier-capabilities-gate-host-portability-body.md)).

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
