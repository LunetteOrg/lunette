# Reading the errors: the guard recites, the binder works

Every configuration mistake surfaces at compile time, **on the wiring
line that made it** — never one verb later, never at `run`. That is the
contract. This page is the field guide to what the red actually says,
and the design rule behind its two different voices.

The verbatim tsc output for every case below lives in the evidence
record, [`collision-guard-dx.test-d.ts`](../../packages/wire/test/chain/collision-guard-dx.test-d.ts);
the behaviour is pinned by the contract tests next to it. Rationale:
[decisions §4, §27](../decisions.md); the location decision is
discussion #21.

## Field guide

| you see | it means | the move |
|---|---|---|
| `Property '[collision]' is missing …` `'{ [collision]: "⛔ key already present in the context: db"; }'` | this verb repeats a top-level key the context already has | one key per area: rename the area, merge into it, or `override` to replace intentionally |
| `Argument of type '"db"' is not assignable to parameter of type '"db" & { [collision]: …'` | same collision, keyed form — the key literal itself is rejected | same move |
| `'{ [requirement]: "⛔ fragment requirement not satisfied: env"; }'` at a mount | the host context does not satisfy the fragment's Seed — the key is missing (and required) **or present with the wrong type**; an absent *optional* seed key is never listed | provide the key upstream, or mount with a mapper: `use(frag, ctx => seed)` |
| `Property 'mailer' is missing in type '{ db: Db; }' but required in type '{ mailer: { send: … }; }'` at a binder | the deps don't cover every leaf in the record (the binder's parameter is the intersection of all declared deps) | add the dep to the chain (point-free wiring) or to the applied bag |
| `Property 'env' is missing in type '{ wrong: … }' but required in type '{ env: Env; }'` at a mount **with a mapper** | the mapper's return does not produce the fragment's Seed — this is the binder's voice, not a brand: the mapper has a structural surface, so plain assignability names the key *with its true shape* (richer than the no-mapper `[requirement]` recital) | fix the mapper's return |
| `'{ [collision]: "⛔ numeric key not supported (it becomes a string at runtime): 42"; }'` | a numeric key — the runtime coerces `42` to `"42"`, so numbers are not keys (decision 30); arrays as patches trip this too | use the string form (`'42'`), or rethink the key: strings name, symbols give identity |
| `'{ [collision]: "⛔ key already present in the context: (symbol key)"; }'` | the SAME symbol was provided twice (a symbol collides only with itself) | the diagnostic names the binding (`typeof theSym`) on its argument side — remove the reuse |
| `{ override: "⛔ overriding key missing from the context: bd" }` and no verbs exist afterwards | `override` names a key that does not exist (typo) — this guard stops the chain | fix the name |
| `'{ [collision]: "⛔ context degraded to any: the guard cannot check keys — restore a real type"; }'` (or the same message under `override:`) | the context type collapsed to `any` — an untyped seed (`lunette<any>()` via an untyped config import) or an untyped provider return (`JSON.parse`, an `any` API) one verb earlier | type the seed / the provider's return; the red line is where the `any` context is first USED — the degradation itself may sit one verb up |
| `{ override: "⛔ patch degraded to any: …" }` | `override`'s function returns `any` (`JSON.parse`, an untyped API) — this guard sits on the return type, so it can name the degradation at its own line | type the override's return value |
| `'⛔ context collapsed to never: an upstream provider returns never …'` | a provider above is a throw-only stub (`() => { throw … }`): its `never` patch collapsed the context — the stub itself is green, the next wiring line carries the blame | implement the stub, or give it a real return type |
| `{ override: "⛔ patch type is never: …" }` | `override`'s function never returns (throw-only stub) | implement it, or give it a real return type |
| `'{ [requirement]: "⛔ fragment seed degraded to any: …"; }'` at a mount | the fragment's seed type is `any` — an untyped seed mapper (`() => JSON.parse(…)`) or a degraded fragment declaration; requirements would go unchecked | type the mapper's return / the fragment's seed |
| `'{ [requirement]: "⛔ fragment seed collapsed to never — give it a real type"; }'` at a mount | the fragment's seed type is `never` — a throw-only seed mapper, or a fragment declaration collapsed by an impossible intersection | give the seed a real type |
| `'{ [collision]: "⛔ patch degraded to any: …"; }'` at `use(layer)` or a mount | the layer's contribution (or the fragment's Pub) is `any` — here the brand lands on the function/chain value, so the refusal is at the offending line itself | type the layer's `next(…)` payload / the fragment |
| `ctx.db` shows `never` in a later verb | a collision upstream is still unfixed — the accumulated type is transiently wrong past the red line, by design | fix the collision; the build is already red there |
| `'{ [collision]: "⛔ patch carries no nameable keys: mount the dynamic bag under a literal key"; }'` | the patch's return annotation is an index signature (`Record<string, …>`) — no nameable keys, so the guard could neither check collisions nor keep the chain honest downstream (decision 32) | exactly what it says: `provide('payments', (): Record<string, Client> => bag)`; if the key list is actually knowable, keep it literal (`as const`) and the guard checks it in full |
| `Keys already present in the context: db` **thrown at boot** (no compile error) | a widened KEY slipped past the guard — a plain-`string` key carries no name for the check, so the runtime net is the floor (decisions §4) | if the key is knowable, keep it literal; if it is truly runtime data, consider the namespaced bag instead |
| `error TS2769: No overload matches this call` wrapping any of the above | the verbs are overloaded (patch \| keyed \| mount); every candidate is elaborated | scan for the elaboration carrying the `⛔` message or the real key — the other candidates are the other verb forms, discard them |
| `TS2769` inside a helper generic over the chain (`<Ctx …>(chain: Lunette<Ctx, …>) => chain.provide(…)`), no collision anywhere | the guard cannot prove "no collision, for **every** Ctx" at the helper's definition — refused by design (decision 31) | extensions supply values, apps wire them: package the layers as a fragment (requirements in the Seed), or the adapter/window pair (#27/#28); a helper over a **concrete** chain type compiles fine |

## The two voices

The chain's guards and the binder's requirement check produce
similar-looking sentences through **opposite mechanisms**:

```
guard (recites):                          binder (works):
Property '[collision]' is missing …       Property 'mailer' is missing in type
  required in type '{ [collision]:          '{ db: Db; }' but required in type
  "⛔ key already present in the             '{ mailer: { send: (to: string)
  context: db"; }'                            => void; }; }'
```

**The binder's error is genuine structural typing.** Its parameter *is*
the intersection of every leaf's declared deps, so plain assignability
names the missing key **with its true shape** — the type does the work,
nothing is fabricated, and there is nothing to forge.

**The guard's error is a performance.** A collision (or an unmet mount
Seed) is a relation between two *inferred* type parameters — the patch
against the accumulated context, the fragment's Seed against the host's.
No structural surface of the argument expresses that relation, so the
verb intersects the argument with a brand it can never satisfy: a
private-symbol property whose string value **is** the message. The
scaffold sentence around it ("Property … is missing") is TypeScript's
fixed phrasing — the information rides the quoted `⛔` value.

The asymmetries follow from the mechanisms:

| | guards (chain verbs) | binder (`bind`) |
|---|---|---|
| direction | reject **excess** (a key already there); mount is the one deficit check, and the one that needed the brand | reject **deficit** (deps not covering the leaves) |
| blame | per **step**: the offending key at the offending verb | **aggregate**: the missing key at the application, not which leaf wants it |
| information | key **names** (a template literal carries no shapes) | names **and true shapes** of what is missing |
| forgeability | none: the brand is an unexported `unique symbol` | nothing to forge: no fabricated type exists |

## The design rule

**Brand only where the type system is mute; where it speaks, let it.**
A future check should get a brand only if no structural surface of its
argument already expresses it — handlers and seeds have one (function
parameters, object shapes), relations between accumulated generics do
not. Reciting where the type could have worked trades true shapes for
name-only messages: a downgrade, not a convention.

## The shared wrapper

`TS2769: No overload matches this call` is the one cost both voices pay,
and it comes from neither: it is the price of overloaded verbs. Every
candidate gets elaborated, including the obviously irrelevant ones (a
chain is not a layer function; a string is not a provider). The relevant
elaboration always carries the decisive line. Editor-side formatters
(error prettifiers, expandable hovers) de-noise exactly this scaffolding;
the guarantee itself never depends on them — it lives in `tsc`.

## The refused wrapper

One `TS2769` is not noise but a verdict: a helper **generic over the
chain** cannot call the guarded verbs at all.

```ts
function addRenderer<Ctx extends object, Pub extends object, Seed extends object>(
  chain: Lunette<Ctx, Pub, Seed>,
) {
  return chain.provide('renderer', renderer) // ⛔ TS2769 — even with no collision anywhere
}
```

Inside that body `Ctx` is a type variable, and the argument-side guard
asks its question **here**: "is `'renderer'` free — for every possible
`Ctx`?" That is unprovable (a caller's chain may well carry the key), so
tsc refuses the definition. The old return-type guard deferred the same
question to each call site; the argument-side guard cannot, and this is
the one place the trade bites.

It bites nothing that matters (decision 31): every real extension shape
already avoids it. Dialects **consume** the chain (`run`/`build` through
`pipe`) — untouched. Reusable bundles of layers are **fragments** —
mounted on a concrete chain, requirements declared in the Seed, collision
checked at the mount. Packages ship **values** (an adapter to `provide`,
a window builder for `.with` — issues #27/#28) and the app does the
wiring, always on a concrete chain where the guard resolves. Even the
helper above is fine the moment its parameter names a concrete chain type
(`chain: typeof appChain`). What the refusal forecloses is only the
generic middleman — and the compiler pointing you back to a fragment is
the design answering for itself.
