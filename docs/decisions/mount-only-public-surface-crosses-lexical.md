---
title: "Mount: only the public surface crosses; lexical scoping inside"
area: keys-visibility-composition
status: accepted
---

# Mount: only the public surface crosses; lexical scoping inside

**Decision.** `use`/`expose` accept another chain. Only the fragment's
`Pub` crosses; its privates live in their own bag whose prototype is the
host context — reads fall through, same-named keys **shadow** instead of
colliding. The verb decides the mounted Pub's visibility. An optional
mapper (`use(chain, ctx => seed)`) builds the fragment's seed explicitly
and doubles as a renaming adapter. One lifecycle: fragment entries join
the host onion.

**Alternatives.** (a) Seeding the fragment with a snapshot of the host
context: same-named private keys then collide at runtime even though the
types cannot see it — rejected for the prototype-chain scoping, which
makes shadowing behave like lexical scope in any language. (b) Declaring
seed keys at runtime to pick them precisely: ceremony on every fragment.
(c) Composing *built apps* (`compose(app1, app2)`): two independent
teardown chains with ambiguous ownership — mounting *chains* keeps one
lifecycle.
