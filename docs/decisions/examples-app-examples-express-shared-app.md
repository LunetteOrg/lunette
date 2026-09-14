---
title: "`examples/app` + `examples/express`: the shared app and its first host, ported from `research/with-scope-hosts`"
area: scope-runtime
status: accepted
---

# `examples/app` + `examples/express`: the shared app and its first host, ported from `research/with-scope-hosts`

**Decision.** `research/with-scope-hosts`'s domain (`posts.ts`, `chain.ts`,
`deps.ts`) promotes to `examples/app` UNCHANGED — it never referenced the scope
API at all, only `@lntt/wire`, which the core rebuild left untouched.
`research/with-scope-hosts/src/express` does NOT promote unchanged: it predates
#60 and hand-rolls its own carrier, guard and validator (`carrier.ts`,
`guards.ts`, `validation.ts`) to measure what the step primitive alone bought.
`examples/express` drops all three in favour of the SHIPPED
`@lntt/scope/express` — its carrier, its `body`/`headers` read extensions, and
`@lntt/scope/guard`'s `.guard`/`.validate`.

**The port caught a real bug the hand-rolled version could not.**
`publishPost`'s leaf ended `return res.redirect(303, ...)`. Express 5 types
`res.redirect` as returning `void`, not `Response`, so the leaf's inferred
return type was `Response | void` — and `AnswerGate` (the check that a leaf
Express can actually send is `Response | undefined`) refused the mount at
compile time, naming exactly the branch at fault. The research prototype's own
hand-rolled mount had no such gate (its `route`/`mw` in `carrier.ts` took a bare
function and cast), so the same mistake there was silent — right by
construction, since `res.redirect` genuinely does write the response, just not
by RETURNING it. Fixed with an explicit `return undefined` after the call,
which is `ReturnGate`'s own distinction (a bare `void` is not `undefined`)
showing up one gate over.

**The recommendation [the read extensions being per host](./read-extensions-per-host-they-populate.md) makes is now followed rather than only stated**:
no `express.json()` is mounted anywhere in `examples/express`. `createPost`'s
`body('json', onError)` is the single error path for a malformed OR oversized
payload ([the body size ceiling](./body-has-size-ceiling-default-checked.md)) — the old research server's equivalent test asserted
Express's OWN 400 for malformed JSON, which was true only because
`express.json()` was mounted globally there. The ported test asserts 422 from
`body()`'s own reader instead, which is the behaviour this library ships today.

**`research/with-scope-hosts/src/{hono,react-router,trpc}` remain unported.**
Each carries the same pre-#60 hand-rolled carrier and needs the same treatment;
they land as their own slices of #59 rather than in this one, for the reason
slicing exists at all — reviewing four hosts' worth of changes as one PR is the
shape to avoid.
