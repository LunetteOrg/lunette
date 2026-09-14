---
title: "Key collisions are forbidden, on two levels"
area: keys-visibility-composition
status: accepted
---

# Key collisions are forbidden, on two levels

**Decision.** Providing a key that already exists is a compile-time error
naming the key, plus a runtime throw as a safety net. Convention: one
top-level key per area. The diagnostic lands on the verb's **argument**
(the exact colliding line; the chain keeps typing past it), not on its
return type — decided in discussion #21, evidence in
`packages/wire/test/chain/collision-guard-dx.test-d.ts`.

**Alternatives.** (a) Allowing the collision: TypeScript intersections
merge object types *deeply* while runtime spreads replace keys
*wholesale* — the type would promise both areas while the runtime kept
one (see `packages/wire/test/chain/why-collision-guard.test.ts` for the
demonstration). (b) Deep merge at runtime: murky semantics over class
instances, closures and functions — the kind of magic tag registries
exist to avoid. (c) A namespace API (`module(name, fn)`): tried, then
removed (see 6). (d) On the diagnostic's location: the return-type guard
shipped first (one verb late, TS7006 cascade, emoji escaped in the
property name) and the candidates rejected in #21 — string-literal
argument constraint (reduces to `never`), overload mismatch, poisoned
chain, editor tooling, type-aware lint.

**Why.** The types must never lie; refusing the case where they would is
cheaper than modeling it. The accepted trade of the argument-side guard
(#21): past the red line the collided key's accumulated type is
transiently wrong, in-editor only — the build stays red at the
collision, so no green program ever lies.

**The brand property is a private `unique symbol`** (same idiom as
`providedBrand`), not a string name: a string-keyed brand can be
satisfied by writing the exact message into the patch, and it competes
with a legitimate domain key of the same name. A symbol nobody can name
is unforgeable short of a cast (which defeats any guard, the old
return-type one included) and never meets user keys. Diagnostics print
`[collision]` / `[requirement]`.

**Scope rule.** Brand only where the type system is mute: the mount
check relates two inferred type parameters, so it has no structural
sentence of its own — the brand gives it one. `bind`'s requirements need
none: the binder's parameter is the real intersection of leaf deps, and
plain assignability already names the missing keys with their true
shapes. Where the type works, let it speak; recite only where it cannot.

**`any` is refused by name.** `keyof any` is every key, so a context
degraded to `any` (an untyped seed, an untyped provider return one verb
earlier) made the guard flag EVERY key as "already present" — red for
the wrong reason, a message asserting a falsehood (PR #26 review).
A guard that cannot check must say so: every guard (collision,
keyed, override) now answers an any context with one message —
`⛔ context degraded to any: the guard cannot check keys — restore a
real type`. The degradation points themselves cannot go red on their own
line, because `any` absorbs every brand intersection (`any & Brand =
any`): an any PATCH is silent where it happens and honest at the next
wiring line. The one exception is `override`: its guard
sits on the RETURN type, where nothing absorbs, so an any patch IS
refusable at its own line — `⛔ patch degraded to any: …` — instead of
reporting the degraded input's artifacts (`numeric ${number}`,
`missing ${string}`) as real findings. Residual: an any KEY mints an
index-signature context (not `any`), whose phantom "already present"
stays consistent with what the wrong type claims — pinned in the
contract, runtime nets underneath. Detection note: the canonical
`0 extends 1 & T` idiom goes blind through a constrained class type
parameter, and the `keyof` test alone has a false positive — a CONCRETE
context indexed by all three key kinds, constructible from the public
API, would be blamed as any. Detection is therefore two-stage: the
cheap `keyof` pre-filter (the guards compute `keyof Ctx` anyway) and,
only when it fires, the exact tuple-infer confirm (`0 extends 1 &
([T] extends [infer U] ? U : never)`, which survives the constrained
parameter). A fully-indexed concrete context thus gets the STRUCTURAL
verdict its index signatures actually claim ("already present"), not a
degeneracy lie — pinned in the contract.

**Widened types are the runtime net's territory.** A key typed as plain
`string`, or an override patch annotated with an index signature or key
pattern (`Record<string, …>`, `Record<symbol, …>`,
`` Record<`data-${string}`, …> ``), carries no nameable keys for the
guard to reason about. (The same shape appearing as a whole TOP-LEVEL
patch is not net territory but refused outright — [widened patches are refused](./top-level-widened-patches-refused.md).)
`Extract<string, 'db'>` is `never` (the widened
key bypasses the check — pre-existing on `main`, same mechanism in the
old return-type guard), and `Exclude` does not reduce pattern keys away
(the widened override patch used to read every existing key as
"missing" — false positives, PR #26 review). The convention
is uniform and enforced member-wise: `{}` extends `Record<K, 1>`
exactly when `K` is satisfiable by omission — such members are dropped
from the missing-verdict; literals, numbers and unique symbols demand
their property and stay. Where nothing nameable remains the guard steps
aside and the runtime net is the floor — it throws at boot naming the
real clash. Both sides are pinned: type-level green in the contract,
the throw in the runtime tests. (Engine cost of the whole guard
apparatus: see the figure at the end of the next paragraph — one
measurement, kept in one place.)

**Corollary — dynamic bags mount under a literal key.** Keys computed
from data (a provider registry from config, per-tenant pools) are the
legitimate widened case: the key list does not exist before runtime, so
`Record<string, …>` is the honest type. A widened patch at the TOP
LEVEL would cost three ways at once — the collision check drops to
boot; the index signature claims every key, so reads of absent entries
lie (`noUncheckedIndexedAccess` mitigates — in a consumer without it,
nothing does); and it poisons the rest of the chain, `keyof Ctx` now
including `string` so every LATER literal provide reads "already
present" — which is why [a widened patch](./top-level-widened-patches-refused.md) is refused outright, with this
corollary as the cure in the message. The move is the existing "one
top-level key per area" convention applied to the dynamic case:
`provide('payments', (): Record<string, Client> => bag)` — the guard
stays fully active for siblings (the literal name is checkable,
collisions included), the index signature is confined inside the value,
and reads become explicit indexed access where `| undefined` forces
honesty. The residual risk shrinks to the bag's own content — the
irreducible nature of runtime data.

**The requirement gate refuses degenerate seeds — the one silent pass.**
An `any` seed made `[Ctx] extends [FSeed]` trivially true: a fragment's
real requirements went entirely unchecked — a false NEGATIVE, where
every other guard hazard was a wrong or lying rejection (PR #26
review) — reachable without a single annotation: a
seed mapper returning `JSON.parse(…)` infers `any`, which satisfies
`FSeed` by plain assignability. All THREE doors refuse by name
(`⛔ fragment seed degraded to any: …`): `RequirementBrand` gates
`FSeed` on the no-mapper mount; the mapper overloads capture the
mapper's inferred return in a type parameter and brand the function
value — which is not `any` even when its return is, so the brand
sticks; and the mapper overloads' CHAIN argument carries the same
`FSeed` gate — with a degenerate declared seed, `S extends FSeed` is
vacuous and a clean mapper would otherwise smuggle the fragment in. Where the brand sticks
matters generally: `use(layer)` and the mount overloads intersect it
onto a function/chain value, so a degenerate contribution is refused
honestly there too (`⛔ patch degraded to any: …` instead of the
verdict's `numeric ${number}` artifacts); `provide`/`expose` ride the
patch value itself, where a degenerate P absorbs the brand — their
P-branch would be dead type code, so they carry the ctx-only variant
(`AbsorbableCollisionBrand`) and honesty waits one line, as pinned.
The never→any cascade shared by all five guard sites is one helper
(`DegeneracyOr`). A UNION seed ("any one of these alternatives") keeps
a NAMED message: the unmet-key computation distributes over the members
— `keyof` over a union keeps only the shared keys, so an undistributed
check would collapse to the nameless generic fallback. The same
distribution covers union-typed PATCHES (reachable via an explicit
`provide<A | B>(…)` type argument): the collision and numeric key sets
are judged member-wise, or a colliding member would slip through
silently. Declared invariant: `RequirementBrand` checks the SEED's
degeneracy only — every overload that carries it also carries
`CollisionBrand<Ctx, FPub>`, which owns the host-context side; a future
overload using `RequirementBrand` alone must add the Ctx cascade
itself. Total engine
cost of the guard apparatus, same ~15-verb consumer probe vs `main`:
34,000 → 40,486 instantiations (+19.1%), check 0.14s → 0.15s.

**`never` is not `any`: each degenerate is blamed by name.** A
throw-only stub — `provide(() => { throw new Error('todo') })`, a
plausible mid-development state — infers a `never` patch: green at its
own line (never absorbs the brand DOWNWARD, symmetric to `any`
absorbing it upward) and the context collapses to `never`. The next
wiring line used to say "degraded to any" (the keyof-based any-detector
sees `keyof never` = every key): factually wrong, and the suggested
cure pointed nowhere. The never check now runs BEFORE the any check in
every guard, with its own messages — `⛔ context collapsed to never: an
upstream provider returns never — give it a real return type`; on
override's return position (which can refuse at the offending line),
`⛔ patch type is never: the function never returns — give it a real
return type`; and on the requirement gate, `⛔ fragment seed collapsed
to never — give it a real type`.

**Horizon.** First-class custom type errors would obsolete the brand:
microsoft/TypeScript#23689 (`invalid`, In Discussion since 2018, no
milestone) and the throw-types PR #40468 (working implementation, closed
2023 after three years without a team verdict). Nothing is moving while
the team ships the Go port (TS 7 "Corsa" — type behaviour explicitly
frozen to parity). The ecosystem's mitigation is the presentation layer
(pretty-ts-errors, ts-error-translator, TS 7 expandable hovers), which
renders the message value well; the guarantee itself stays in `tsc`.
Migrating brand → `invalid`, if it ever lands, is mechanical: three type
aliases in `chain.ts`, contracts assert behaviour, not brand shape.
