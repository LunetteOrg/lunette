---
title: "Top-level widened patches are refused"
area: verb-model
status: accepted
---

# Top-level widened patches are refused

**Decision.** A patch whose `keyof` carries no nameable keys — an
index-signature or key-pattern return annotation,
`provide((): Record<string, unknown> => …)`, on any verb sharing the
patch verdict — is refused at its own line:
`⛔ patch carries no nameable keys: mount the dynamic bag under a
literal key`. Judged member-wise over a union; the EMPTY patch
(`keyof` = `never`) is not widened and flows. The sanctioned form for
keys computed from data is the corollary of [key collisions forbidden on two levels](./key-collisions-forbidden-two-levels.md): mount the bag under ONE
literal key (`provide('payments', (): Record<string, Client> => bag)`),
where the index signature lives inside the value and the guard stays
fully active for siblings.

**Why.** Decision-30-shaped: no legitimate use survives at the top
level. The form was already self-defeating — after it, every later
literal provide read "already present" (the phantom index signature
claims every key) and even a second widened patch collided
(`Extract<string, string>` is not `never`) — so it failed anyway, at
the wrong line, with the wrong message. The refusal moves the error to
the offending line and puts the cure in the text.

**Alternatives.** (a) The documented-convention status quo ("widened
types are the runtime net's territory", with the poisoned-chain symptom
in the field guide): superseded for the patch form by this decision —
the symptom row is gone because the poison is refused at the source.
(b) Banning widened KEYS too (`provide(k, …)` with `k: string`): kept
on the net's floor for now — the single dynamic key has a legitimate
puntual use, and the template-literal variant does not poison
non-matching literal siblings; revisit if adoption hits it. (c) Banning
the widened OVERRIDE patch: different semantics (replaces, does not
add) and its own recorded flow convention; untouched.

**Pinned.** The refusal on every patch door, the union member-wise
judgment, the empty-patch pass, the namespaced green twin, and the
runtime net under a cast (`keyed.test.ts`).
