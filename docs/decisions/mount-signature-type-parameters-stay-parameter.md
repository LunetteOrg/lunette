---
title: "The mount signature's type parameters stay; the one-parameter form does not infer"
area: scope-runtime
status: accepted
---

# The mount signature's type parameters stay; the one-parameter form does not infer

**SUPERSEDED by [a carrier being `__args` alone](./carrier-needs-no-vocabulary-at-all.md).** The `Handler<Need, S, R, Cap>` shape this decision
is about belonged to `@lntt/integration` as a package separate from the carrier,
which [a carrier being `__args` alone](./carrier-needs-no-vocabulary-at-all.md) dissolves — a carrier now ships its own mount helper (#60),
with far fewer generic axes than the four-to-seven this recorded. The TypeScript
lesson (self-reference through a computed type defeats inference) still holds
and is worth knowing if a future mount signature grows generic again; the
SIGNATURE it was about does not exist any more.

**Decision.** The mount factories in `@lntt/integration` keep the type
parameters the brands need. On the three HTTP packs that is four:

```ts
<Need extends object, S extends StandardSchemaV1, R, Cap extends Capability>(
  h: Handler<Need, S, R, Cap> & DepGuard<Pub, Need> & CarrierGuard<Cap, 'body' | 'cookies' | 'headers'>,
)
```

(`hono.ts` orders them `<S, Need, R, Cap>`; the set is the same.) On tRPC it is
SEVEN, because that mount is generic over the host's own context as well —
`TContext`, `TMeta`, `TContextOverrides` come from the `ProcedureBuilder` it
takes, and the deps are reconciled against the context rather than a pack's
`Pub`, since on tRPC the app travels in the context ([the seeding cadences collapsing to two](./three-seeding-cadences-collapse-two-request.md)).

They are not knobs and nobody should ever write them: they exist only because a
brand must NAME the axis it tests, and a brand has to sit in the same parameter
position as the value it guards. Recorded as a decision rather than left as a
smell to rediscover, because the better-looking shape has been tried and
measured, and the result is negative.

**What does not work.** One parameter with the axes extracted:

```ts
<H extends AnyHandler>(h: H & DepGuard<Pub, NeedOf<H>> & CarrierGuard<CapOf<H>, HostCaps>)
```

TypeScript cannot infer `H` from a parameter position that also references `H`
inside a computed type. It falls back to the constraint, `Need` collapses to the
constraint's shape, and the brand then fires on VALID handlers — the gate starts
rejecting good mounts, which is worse than the verbosity. Isolated so the cause
is not guessed at: the same one-parameter signature WITHOUT the intersection
infers perfectly, so it is the self-reference and not the extraction.

**Alternatives.** (a) A second parameter with a computed default (`N =
NeedOf<H>`). Rejected: the default is still a computed type over `H` resolved at
the inference site, so it reintroduces the same self-reference. (b) Put the
brand on the RETURN type. It infers cleanly, and is rejected anyway: the error
would land at the assignment of the mount's result instead of on the argument
that is wrong, which is the failure mode principle 1 exists to prevent.

**What would change the verdict.** A way to apply a predicate to an inferred
type parameter without referencing it from the inference site. Nothing in the
current type system offers one; if that appears, every mount moves at once —
though tRPC would keep the three parameters it owes to its own host, since those
are not there for the brands.

The related hole — naming `Cap` by hand to declare away a capability the carrier
lacks — is closed separately by making `__cap` invariant ([the capability gate](./carrier-capabilities-gate-host-portability-body.md)), so what remains
here is only the shape of the signature, not a gap in the gate.
