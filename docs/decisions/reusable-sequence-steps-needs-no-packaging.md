---
title: "A reusable sequence of steps needs no packaging: the unit is the scope VALUE"
area: scope-runtime
status: accepted
---

# A reusable sequence of steps needs no packaging: the unit is the scope VALUE

**Decision.** Ship no mechanism for reusing a sequence of steps across carriers
— no packaged fragment, no generic function over an abstract state. The unit
that needed reusing already exists: the SCOPE VALUE. `.step`, `.guard` and
`.extend` each return a NEW value and never touch the one they were called on,
so a shared prefix is a value kept and branched from twice.

```ts
const base     = scope(expressCarrier()).extend(guards).step(headers)
const authBase = base.guard(findActor, onError)

const routeA = authBase.step(leafA)
const routeB = authBase.step(leafB)
```

**Alternatives.** *A packaged unit* — a value holding a sequence, applied to a
scope of any carrier. Rejected: it needs a generic over an abstract state, and
what it would buy is what `authBase` above already is. *A helper function
taking a scope and returning one* — the same thing with a different spelling,
and it loses the concrete type: `authBase`'s type is inferred once, at its own
line, where a generic helper would have to reconstruct it.

*A function generic over "any scope", appending steps from OUTSIDE the builder*,
so the identical sequence could be handed to two hosts at one call site. This
one does not merely lose something — it does not compile, and the reason is
structural rather than about guards: a single generic `.step()` over an
abstract `S extends State` fails the moment the step reads a concrete ctx
field, because `Ctx<S>`'s `Omit<S['args'], keyof S['acc']> & S['acc']` does not
reduce for a naked type parameter, so two derivations of "the same" type never
structurally unify. Measured, minimized to one `.step()` with no guard in it.

**What DOES work, and is deliberately not shipped.** A raw-function combinator
outside the builder, generic on its OWN parameters rather than on `State`,
compiles and runs correctly on two real hosts (Express and Hono). It is unshipped
because it answers a case nobody has. Written down so the next reader does not
conclude from the paragraph above that nothing can work — and if a cross-host
case does show up, it is a STEP's job rather than a new abstraction's: a step
already carries the contract such a thing would need, its own `Need`/`Add`/`Ret`
checked at the argument like every other step, so a bespoke "sequence" type
would be a second name for what the primitive is.

**Why.** The question was whether a sequence needs its own mechanism, and the
answer is that immutability already gives one. Verified by running the shape:
two Express routes sharing one `authBase`, independent leaves, both correct. No
new export, and every leaf branching from the prefix is an ordinary `.step()`
the builder already offers.

**Where this verdict comes from.** It was reached while the scope API document
was the working record, and is written here because that document is retired
([the scope API document is retired](./docs-design-scope-api-md-retired.md)) and this is the claim it held that lived nowhere else.
