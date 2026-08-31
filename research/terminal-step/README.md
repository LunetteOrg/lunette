# research: terminal step

**This is a research prototype, not a product.** It answers one question about
the scope builder in `@lntt/scope`, and retires when that question is settled.

## The question

The builder has one primitive — a STEP wrapping the rest of the fold — and every
verb is sugar over it. `guard`, a channel's populate and a collector all reduce
to a step. The leaf does too: it is the step that never calls `next`.

But `.handle(leaf)` does a second thing no step can: it turns the builder into
the callable, resolving `R`, `Need` and the rest. That is a TYPE event, so "the
primitive expresses everything" has a footnote.

**Can a step close the builder, if it DECLARES that it terminates?**

## The answer: yes

TypeScript cannot see that a function never calls `next` — that is behaviour.
But it can read a declaration, which is what every other axis in the real design
already does (a capability, an admission and an intent are all declared, never
inferred). So a terminal step says so in its type, and `.step()` reads it:

```ts
export interface Terminal<R, Need extends object> {
  readonly __closes?: (n: Need) => R
}

step<S extends Step, Self = this>(this: Self, s: S):
  S extends Terminal<infer R, infer N> ? Handler<NeedOf<Self> & N, Awaited<R>> : Self
```

There are THREE step shapes, and the third is what shows the declaration is not
redundant with behaviour: `enrich` always continues, `leaf` never does and says
so, and `authorize` continues CONDITIONALLY — it either hands an identity inward
or ends the request with an error. That third one can end the fold at runtime and
must NOT close the builder, because the leaf has not been written yet. Ending a
request and closing a scope are different claims, and only the second is
declared.

`src/closing.test-d.ts` pins all three: an ordinary step leaves the builder
open and NOT callable, a terminal one turns it into a `Handler` with `R` read off
the leaf and the leaf's deps folded into what the call demands. `src/run.test.ts`
runs the same machinery, so the types are not the only evidence — including a
scope built with no closing verb at all and no unreachable trailing call.

One asymmetry worth naming, visible in `make()`: the RUNTIME cannot tell the two
kinds of step apart and does not need to — it returns both faces at once, an
object carrying `.step` that is also callable. Only the type picks one.

## What it cost, measured

Two kernels, one workload, 24 scopes each. `tsc --extendedDiagnostics`, three
runs, identical every time.

| steps per scope | one verb (`.step`) | two verbs (`+ .handle`) | delta |
|---|---|---|---|
| 2 | 1893 instantiations | 1117 | **776** |
| 5 | 2181 instantiations | 1405 | **776** |

**The prediction was wrong, and that is the point of the table.** The cost was
argued to be "every `.step()` pays the conditional", which would make it grow
with the number of steps. It does not move: the delta is constant per SCOPE
(~32 instantiations each), because the conditional's failing branch is nearly
free and only the succeeding one — the branch that builds the `Handler` — costs
anything, and that fires once.

Whether ~32 transfers to the real package is NOT answered here: this kernel is a
fraction of the real one, where a scope costs ~615 instantiations. The shape of
the cost is the transferable finding; the magnitude has to be measured there.

## What it does NOT model, and why that matters

The **intent gate**. In the real design `DeclGate` rides `.handle`'s argument,
where the accumulated set is visible on `Self`. A leaf packed by `leaf(fn)`
before it is added cannot be checked against the scope that has not received it
yet, so the gate would have to move onto `.step` — inside the same conditional.
That is the second cost of this shape and it is unmeasured here.

Also absent: carriers, channels, capabilities, schemas, effects. Anything not
needed to answer the one question.

## Retires when

The `@lntt/scope` builder settles on one closing verb or two (#30). If it keeps
`.handle`, this records why with a number rather than an argument; if it drops
it, this is the prior art it was dropped on.
