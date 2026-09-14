---
title: "`buildOnce`'s handle is single-lifecycle: `dispose` ends it"
area: scope-runtime
status: accepted
---

# `buildOnce`'s handle is single-lifecycle: `dispose` ends it

**Decision.** A `BuildOnce` handle has ONE life. `dispose` closes it, and after
that `ensure` THROWS rather than handing an app back, a second `dispose` returns
the FIRST teardown's promise instead of repeating it, and a build still in
flight when `dispose` arrives is torn down AND refused to whoever was waiting
for it. A second app is a second
`buildOnce` — the chain stays a value that can be built as many times as you
like ([build-once as a free function the host holds](./build-once-free-function-host-holds.md)), so the factory already exists and does not need the handle to become
one.

The error is THROWN, not returned: a container that no longer exists is
infrastructure, not a domain outcome (principle 3). It is thrown SYNCHRONOUSLY
from `ensure`, which is the shape that call already had for a seed thunk that
throws.

**What it replaces.** The memo outlived its own teardown, because `dispose`
never cleared it. Three consequences, all measured on a chain that counts builds
and teardowns:

| sequence | before | after |
|---|---|---|
| `ensure` → `dispose` → `ensure` | the SAME app, already torn down | throws |
| `ensure` → `dispose` → `dispose` | `handle.dispose()` called twice, chain absorbs it | attempted once, REPORTED to both |
| `ensure` in flight → `dispose` | torn down, and the waiter still got the handle | torn down, waiter gets the refusal |

None of them announced itself, and that is the reason this is a decision rather
than a footnote: **after teardown the `app` object is not dead**. Its closures
are intact, its methods answer, its types hold. What is dead is underneath — the
pool closed, the client ended — so the failure surfaces inside a driver, far
from the `ensure` that handed out a spent app. `examples/app` already had the
test proving the resource really closes (`a query after dispose fails`); what
was missing was anything stopping you from asking for the app afterwards.

It was reachable in this repo, not merely in theory: `packages/integration/test/
react-router.test.ts` disposed a module-level pack halfway through the file and
five later tests kept mounting on it. They passed because the disposed app still
answered and that fixture holds no real resource. The DISPOSING test now takes a
pack of its own, so the shared one is never torn down mid-file and the five that
follow it mount on a live app.

**Why it matters more now than it used to.** Where a container builds at
startup, "after dispose" means "after the process decided to die" and nobody
gets there. With the build LAZY ([build-once as a free function the host holds](./build-once-free-function-host-holds.md)) the first `ensure` is a REQUEST, so the
handle's life is no longer bracketed by the process's.

**Alternatives.** (a) Document the boundary and change nothing — one sentence
saying the handle is single-lifecycle and using it afterwards is undefined.
Rejected: it costs nothing and buys nothing, leaving a silent wrong answer
reachable and a documented boundary that no test enforces; the five green tests
above are what that option looks like in practice. (b) Re-arm the memo (`built =
undefined` after teardown) so a later `ensure` rebuilds. Rejected: it
contradicts the identity guarantee this module opens with — singletons would
exist once PER LIFECYCLE, not once — and it answers a need already met by a
second `buildOnce`. (c) Close only the sequential paths and leave the in-flight
one. Rejected as a half-rule: "after `dispose`, `ensure` never yields an app" is
a sentence worth being able to say without an exception, and the cost is one
`.then` on the build rather than on each call.

**Cost**, and it is larger than the rule looks. Two references to the same build
instead of one, and they are not interchangeable: teardown must await the RAW
build (it has to reach a handle that may not exist yet), while callers get that
build plus the check. Getting that wrong the other way — disposing through the
guarded promise — would make a teardown during an in-flight build skip the app
entirely.

Handing callers a DERIVED promise costs two more things, both of which the first
version of this rule got wrong and neither of which is visible from the rule
itself. The derived promise needs a handler of its own: `dispose` only ever
attaches one to the raw build, so a caller who does not await `ensure` — a
warm-up racing shutdown — turned the in-flight refusal into an unhandled
rejection, which on Node ends the process. And teardown is now MEMOIZED rather
than flagged: a boolean could only report "already handled", which made a second
`dispose` resolve after a teardown that had FAILED, so two shutdown paths
disagreed about whether the app closed. Both are guarded by tests that die when
their guard is removed.
