# research: outcome vocabulary

**This is a research prototype, not a product.** It exists to make one design
readable before it is built into `@lntt/scope`, and it retires the moment that
change ships.

## What it demonstrates

**Each carrier extension owns its own vocabulary — in and out.** The core coins
nothing: no `notFound`, no 404, no `redirect`, and not even an input verb.
`scope()` on its own cannot read an input or stop the fold; extending a carrier
is what gives it both.

Read the files in this order:

| file | what to look for |
|---|---|
| `src/kernel.ts` | the core. Ask "what does it know about HTTP?" — the answer is nothing |
| `src/http.ts` | one carrier's whole vocabulary: `ctx.request`, `.params()`, `notFound()`, `redirect()`, `json(v, 201)`, and the codec that decides 422 |
| `src/rpc.ts` | another carrier's, overlapping in MEANING but not in words, and with no `redirect` at all |
| `src/app.ts` | one domain, wired twice — the translation to a response word sits at the wiring, where the host is already known |
| `src/mounts.ts` | the two gates: which intents a host renders, and whether the route pattern and the schema agree |
| `src/errors.test-d.ts` | **the point**: the six mistakes and the message each produces |
| `src/run.test.ts` | the same machinery actually running, so the types are not the only evidence |

## The two checks, and why they are in different places

- **The SCOPE does not handle that verb** — you called `notFound()` without
  extending the carrier that coins it. Caught at the scope DEFINITION.
- **The HOST does not handle that scope** — the scope declared `redirect`
  correctly and is being mounted somewhere that cannot render it. Caught at the
  MOUNT, and it cannot move earlier: the same scope is correct on HTTP, and the
  definition line holds no information about where it will be mounted.

Nothing is declared by hand. The declaration IS what a guard or a leaf returned:
each verb carries its own name in its type, `.guard` accumulates it, and the
accumulated set is compared once against what the scope extended and once
against what the host renders.

## The route pattern and the schema

`.params(schema)` says what the input looks like; `'/posts/:postId'` says where
it comes from. They are two declarations, and today NOTHING keeps them aligned —
renaming the route param compiles on every host and fails at runtime with a 422.
Verified by doing it to `examples/hono`: no error at the mount at all.

The mount closes it without taking over routing. The pattern arrives as a string
literal, its placeholders are compared with the schema's keys, and the framework
still does the matching — we never extract. That matters twice: the pattern
language belongs to the framework, and the URL a scope reads is normalised while
the router matched the raw target, so an extractor of ours could disagree with
it on `/a/../b`. The pattern is still written once, because the mount hands it
back to be spread: `app.get(...route('/posts/:postId', postScope))`.

**The rule that keeps it safe: on a pattern it cannot read, it has no opinion.**
Catching less is fine; rejecting a valid route is not. `src/errors.test-d.ts`
pins both halves — the mismatches it must catch, and the wildcards, optional
groups, inline regexes and non-literal paths it must wave through.

In the real packs this reader lives PER FRAMEWORK, beside the dependency whose
syntax it models. `@lntt/integration/hono` needs none of its own: Hono exports
`ParamKeys`, which cannot drift from the router because it IS the router's.
Only Express needs one, since path-to-regexp types its params as a bare
`object`. React Router and tRPC get no check at all — their routes never reach
a mount — and that is a gap, not a simplification.

## Three things this prototype exists to record, because they were surprises

**The intent cannot be inferred from inside a union constituent.** The obvious
shape — `guard(g: (ctx) => E | Abort<I>)` — makes TypeScript pick the first
abort candidate and REJECT the rest, so a guard that can return two different
intents stops compiling. Variance does not help: invariant, covariant and
contravariant phantoms behave identically, and inferring the whole abort union
collapses to the constraint. What works is inferring the whole RETURN type and
distributing afterwards, which is why `IntentKeysOf` and `ValueOf` in
`kernel.ts` look the way they do. `throttledScopeWeb` in `src/app.ts` is the
case that broke every other shape.

**The success side needs its own word.** `json(v, 201)` first coined the same
`status` intent as `notFound()`. Because an RPC host legitimately declares it
can render status aborts (it translates them into codes), that shared name
silently licensed a 201 it cannot express. Giving the ok side `'ok-status'`
closes it — mistake 3 in `errors.test-d.ts`.

**Vacuous truth ate the route gate, in the obvious spelling.** A route with no
params reads as `never`, and `never extends Opaque` is TRUE — so
`PathParams<P> extends Opaque ? skip : check`, written the natural way round,
took every param-less route for an unreadable one and checked nothing, letting a
schema declare a param `/feed` does not have. Wrapping in a tuple does not help:
`never` is assignable to anything, tuple or not. Only the reversed test,
`Opaque extends PathParams<P>`, tells the two apart. Decision 34 closed the same
trap on `Exclude`; it came back somewhere new.

**A bare `Abort` must fail closed.** An unparameterised `Abort` means "an intent
nobody declared" (`UnknownIntent`), so it is refused everywhere rather than
collapsing to `never` and mounting anywhere — the fail-open shape decision 34
had to close on the capability axis.

## What it does NOT model

The real chain (`Lunette`, deps, seeds), the capability axis, effects and sinks,
build-once, and the host packs. There is no shared `request` extension, on
purpose: `RequestHead` is a core TYPE and each carrier that holds one exposes it
itself, so a read-only guard still works against any of them. Its `Schema` is a two-line stand-in for Standard
Schema, and its "codecs" return a plain object rather than a `Response`. It is a
reading aid for one axis, not a second implementation.

## Retires when

The outcome-vocabulary change lands in `@lntt/scope` and `@lntt/integration`.
At that point the shipped `*.test-d.ts` negatives carry these guarantees and
this prototype has nothing left to prove — delete it.
