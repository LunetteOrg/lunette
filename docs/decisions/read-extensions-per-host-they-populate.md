---
title: "The read extensions are per host; what they populate is not"
area: scope-runtime
status: accepted
---

# The read extensions are per host; what they populate is not

**Decision.** `query`, `cookies`, `headers` and `body(encoding, onError)` ship
from the subpath of the host they read, as PLAIN STEPS.

**Four extractions, never one with a branch inside.** There is no generic way to
read a request: Express's `req` is a Node message, Hono and React Router are one
Fetch family, tRPC has neither a body nor a URL. The honest count is per carrier
FAMILY, which is what #62 already said for `body` and is now true of all four.

**What is shared is the ENTRY SHAPE, and that is the point.** The extraction
knows its host; everything downstream of it does not. A step annotating
`{ query: Query }` names no carrier and mounts wherever a `query` was populated.
Before this, `carrier-free.test.ts` pinned the opposite as the whole truth — "the
four hosts share no arg name, so there is no partly-portable middle" — and a step
either annotated `c` and lived on Hono or did not touch the request. This builds
the middle, and it is most of what an agnostic guard (#67) needs.

**Steps and not verbs, decided by a gate rather than by taste.** These ADD an
entry; a verb is what may REPLACE one, because `.extend`'s wrapper pushes its
step past the ctx gate. The line falls exactly where the gate already is.

**Only `body` takes an `onError`**, because it is the only one carrying a payload
that can be malformed.

**`BodyOf<E>` is `unknown` for a caller that did not say which encoding**, and
that is the lattice rather than a defect. `unknown` IS the json branch, so any
union containing it is `unknown` — distributing and tupling the conditional give
the same six answers, measured both ways. A generic caller could only do better
if the json branch were narrower than `unknown`, which is a design decision this
issue took the other way on purpose: the entry holds what it holds before anyone
validates it, and a type that forces the validation is the point. Worth recording
because the first attempt at this "fixed" a distribution that was not the cause,
and the type tests that accompanied it — `not.toEqualTypeOf<never>()` and a
`toMatchTypeOf` — hold for `unknown` too, so they passed for the very type they
were written to catch. A query string does not fail to parse, a malformed cookie
is skipped, headers do not fail.

**The encoding a step asked for is REQUIRED, on every path.** It was checked only
where a parser had run before us, on the reasoning that elsewhere a mismatch
fails in the parse itself. True for `form`, and false for `json`: bytes that
happen to parse were accepted whatever the client called them. The gap has a
name — `text/plain` is one of the three content-types a browser may send
cross-origin with NO preflight, so a JSON endpoint accepting it is reachable by a
forged cross-site request that `application/json` would have stopped at the
preflight. Requiring what the step asked for is the cheap half of CSRF, and it
costs nothing to hold.

**A pre-parsed body may not be parsed at all**, so the SHAPE decides and not the
header alone. `express.raw()` and `express.text()` leave the BYTES on `req.body`,
which is exactly this step's input, so they go through the same parse as a stream
read here; only a real value falls back to the header, since there is nothing
left to check it against. Read as a value, `express.raw()`'s `Buffer` was handed
on as if it were JSON.

**Reading and parsing fail for OPPOSITE reasons**, so they are written apart
rather than under one `try`: `arrayBuffer()` is I/O and its rejection is
infrastructure, left to propagate; parsing bytes in hand is the client's mistake
and comes back as issues. This is also why `form` does not call `formData()`
directly — that reads and parses in one call, and a failure could not be told
from a dead connection, so the bytes are taken first and a throwaway request is
built around them.

**Express has two worlds, and the branch is unavoidable.** A mounted
`express.json()` has CONSUMED the stream, so reading it again yields nothing and
its result is what the route really has. Using it is the only correct answer.

WHOEVER PARSES FIRST OWNS THE ERROR PATH, which is the whole of what a mounted
parser changes — measured, and pinned:

| | with `express.json()` | without |
|---|---|---|
| valid JSON | the leaf, from `req.body` | the leaf, read by the step |
| INVALID JSON | Express's own 400; `onError` never runs, the parser threw before the scope existed | `onError`, 422 |
| EMPTY body | the leaf, with `{}` | `onError`, 422 |
| wrong encoding | `onError` | `onError` |

So the guidance is not to mount a body parser on a route whose scope reads the
body: Express scopes middleware to a path, so a legacy route can keep
`express.json()` while one with a scope does not, and then this carrier behaves
as the other three do with `onError` as the single error path. Mounted anyway,
nothing is UNSAFE — a parsed body carries no record of what parsed it, so the
encoding is checked against the content-type, which closes the case where the
data would be wrong. What is left is which of two correct answers a client gets.

**tRPC ships none, and the two refusals differ in hardness.** The body is
unreachable — the transport made `input` and `ctx`, and the request is gone —
which is a fact about the transport. The URL is right there and a step could
parse one by hand, so that refusal is ADVISORY: a judgement that a procedure is
addressed by its router path rather than a query string. Conflating a fact with a
judgement is the "false safety" #38 warns about.
