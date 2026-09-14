---
title: "The mount is a gate too, and the CHECKED verb has the short name"
area: scope-runtime
status: accepted
---

# The mount is a gate too, and the CHECKED verb has the short name

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

**`route` is the checked verb; `handler` is the escape hatch.**

> **Still true, and the SOURCE of the check has changed, since [the route gate reads the
> schema](./route-gate-reads-schema-no-carrier.md):** `route`
> compares a mounted pattern against the `.validate('params', …)` schema now,
> not against a declaration on the carrier. Everything below holds word for
> word, on both hosts — including the `AnswerGate` + `PathGate` pair, which is
> live and pinned.

It was one verb with two forms:

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
[the scope builder](./scope-builder-scope-profile-over-agnostic.md); a scope with steps and no leaf, `index.ts`). *Drop the unchecked form* —
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
