---
title: "`params`, a fifth read extension: route params are VALIDATED, not merely cast"
area: scope-runtime
status: accepted
---

# `params`, a fifth read extension: route params are VALIDATED, not merely cast

**Decision.** `@lntt/scope/express` ships `params` — a plain step, alongside
`query`/`headers`/`cookies`/`body`, populating `ctx.params` with Express's own
`ParamsDictionary`. `examples/express`'s `getPost`/`publishPost` read `:id`
with `.step(params).validate('params', IdParam, onError)`, not
`expressCarrier<{ id: string }>()`. This is the SHARED pattern going forward
for a param worth a real format check, not merely a name.

**Discussed in chat before landing.** The first form tried was a `guard`-based
check reading `req.params` by hand (a Zod schema, `safeParse`, manual
`StandardIssue[]` mapping). Measured against `expressCarrier<{ id: string
}>()` + `route`'s `PathGate` ([what a carrier subpath ships](./carrier-subpath-ships-parameterised-declaration-direction.md)) — the compile-time check that a mounted
pattern supplies the param a scope reads — before choosing: the carrier form
refuses a mismatched pattern AT COMPILE TIME, naming the missing param
(measured: `route('/posts/:postId', sc)` against a scope declaring `{ id:
string }` — `⛔ this route does not supply a param the scope reads: id`); the
guard form compiles regardless and answers 400 on the FIRST real request
instead, because nothing checks the pattern against the declaration — but it
validates the param's FORMAT, which the carrier's bare `string` cast never
did (`/posts/abc` reached the domain lookup before). Chosen for the format
check, and then simplified once more: the hand-rolled `safeParse`/issue-mapping
`guard` needed is exactly what `.validate()` already does for `body` — so
`params` ships as a read extension precisely so `.validate()` applies to it
the same way.

**A GENERIC `params` was tried first and REFUSED SILENTLY.**
`params = async <P>(_app, { req }: { req: Request<P> }, next: Next<{ params:
P }>) => next({ params: req.params })` — meant to reflect whatever `Params`
the carrier declared — compiles, but passed to `.step()` its type parameter
never gets inferred: `Add` collapses to the bare `object` constraint and the
step adds NOTHING to `acc`, discovered only by probing `StateOf<...>['acc']`
directly, since the surrounding code still compiled. A generic function
argument does not get its own type parameter inferred through `.step()`'s
inference — the same CLASS of limit #67 hit composing over an abstract
`State`, a different cause (there `Ctx<S>`'s `Omit` does not reduce for a
naked type parameter; here a generic VALUE argument's type parameter is never
solved for at all). `params` ships FIXED, exactly like the other three read
extensions — none of which is generic either.

**The carrier's compile-time check is not replaced, and is not lost — it is
simply not what this reaches for.** `expressCarrier<{ id: string }>()`
remains available and unchanged for a route that wants the pattern check
instead (`createPost`'s `expressCarrier()` here stays bare regardless, since
it has no route param to declare either way). Stacking both was considered —
naming `id` in three places, the carrier, the schema, and the route pattern —
and set aside: one guarantee per param is enough for what this domain needs,
and the runtime one catches more (format, not just presence).

**A SCOPE VALUE IS THE RECYCLABLE UNIT (#67, already established), not a new
mechanism**: `withId = scope(expressCarrier()).extend(guards).step(params)
.validate('params', IdParam, onError)` is built once, and `getPost` and
`publishPost` both branch from it with `.step(...)` — the same shape
`examples/two-chains`'s admin gate uses on a whole product, here on one
shared param instead.

**#97 went further, and it landed on [the route gate reading the schema](./route-gate-reads-schema-no-carrier.md)**: `expressCarrier<Params>`'s
generic is gone and so is Hono's pattern argument, so `.step(params)
.validate(...)` is the ONE way to say what the URL carries on either host. The
paragraph above — "not replaced, and not lost" — describes a state that lasted
one PR. What it got WRONG is the framing: the two are not rival guarantees to
choose between, they are a mechanism and a check, and the check outlived the
mechanism. `PathGate` did not go with the declaration; it was re-pointed at the
schema and now serves both hosts.
