# research: collapsed outcome

**This is a research prototype, not a product.** It answers one question about
the scope runtime's outcome in `@lntt/scope`, and retires when that question is
settled.

## The question

The outcome has two branches. `ok` carries a domain value and may carry an
intent beside it; `abort` carries an intent and no value, and `ValueOf` sends it
to `never` so a refusal never appears in what the scope declares it yields.

On the wire that split does not exist. `notFound('gone')` and `json(v, 201)` are
both a response with a status and a body, and every difference that matters is
already in the carrier's payload. Nor does `abort` buy what it looks like it
buys: it does not stop the fold (not calling `next` does), and it does not drive
commit/retry/ack (returned-vs-thrown does). What is left is one boolean — and by
§40's own argument, a core that does not know what a 404 IS has no title to know
that a 404 is not ok.

**Can the two branches collapse?** And once that is asked, a third option
appears behind it: **can the core have no outcome at all?**

## The four kernels

| | what the fold hands back | `ValueOf` | what the core knows about a word |
|---|---|---|---|
| `kernel-two-branch.ts` | `{ok:true, value, intent?} \| {ok:false, intent}` | refusal → `never` | two brands, two constructors |
| `kernel-collapsed-a.ts` | `{value?, intent?}` | unwraps to the payload | one brand, one constructor |
| `kernel-collapsed-b.ts` | `{result}` | identity | one brand, one constructor |
| `kernel-transparent.ts` | whatever the leaf returned | identity | a SHAPE (`{intent}`) and nothing else |

Everything below the outcome machinery — state, ctx, gate, builder, fold — is
**byte-identical** in all four. Check it:

```sh
for v in two-branch collapsed-a collapsed-b transparent; do
  sed -n '/── the accumulated state/,$p' src/kernel-$v.ts > /tmp/c-$v.txt
done
for v in collapsed-a collapsed-b transparent; do diff /tmp/c-two-branch.txt /tmp/c-$v.txt; done
```

So a difference between kernels is one the outcome question caused.

## What collapsing does to `ResultOf` — the price, and it is not optional

`src/what-lands-in-result.test-d.ts`, on one scope whose leaf produces `Post` and
whose guard refuses with `{error: string}`:

```ts
ResultOf<two-branch>   →  Post                                      clean
ResultOf<collapsed-a>  →  Post | { error: string }                  flattened
ResultOf<collapsed-b>  →  Post | Word<{error: string}, {refusal}>    tagged
```

**With one branch there is nowhere else for a refusal to go.** Asking "what does
this scope produce" stops returning the domain type and starts returning the
domain type plus every refusal payload — in both collapsed variants, for every
consumer, the mount included. That is the cost of collapsing at all, and it is
separate from the choice between (a) and (b).

## (a) vs (b): the difference is a promise, not a safety class

Because `ResultOf` is polluted either way, **(a) intercepts the mistake too** —
whenever the refusal's payload type differs from the domain type, the union is
heterogeneous and TypeScript refuses the shortcut. Pinned in the same file:

```ts
// @ts-expect-error `Post | {error}` is not a `Post`
const post: Post = out.value
```

So the two do not divide into unsafe and safe. They divide by what the CARRIER
must promise:

- **(a)** is safe whenever refusal payload types differ from the domain types its
  users return. The carrier can secure that by giving refusals a recognisable
  shape — which is building the wrapper by hand, per carrier.
- **(b)** needs no promise: the wrapper is structural, so the types can never
  coincide. It costs a narrowing at every read, mount included.

`src/payload-shapes.test-d.ts` pins when (a) actually loses: only where the two
types coincide, or where a refusal carries nothing at all (a redirect), which
makes `R` nullable until `RefinedValueOf` sends valueless words to `never` — a
rule that is exactly what the `abort` branch was.

## Visibility is a different projection, and it survives everything

"What can this scope hand back at all" is answered by reading the raw union the
state accumulated, before `ValueOf`:

```ts
export type ReturnsOf<Sc> = Sc extends Scope<infer S> ? Exclude<S['returns'], Passed> : never
```

`src/visibility.test-d.ts` pins it, and the result reverses the expectation:
**today's design is the lossy one.** `Abort<I>` carries only the intent NAME, so
two refusals sharing `refusal` merge into one constituent; the collapsed kernels
keep them apart, because a word's value type is part of its type.

The consequence is that enumerating a scope's refusals needs neither the
collapse nor (b). It is one exported alias, in any of the four designs.

## The transparent kernel: what it keeps, and what it costs

`kernel-transparent.ts` removes the outcome entirely — no brand, no branch, no
normalising pass. `outcomeOf` is the identity function, and that is the whole
runtime half. `src/transparent.test-d.ts` checks the two things that could have
broken:

**The gate survives without a brand.** It reads the intent name off a SHAPE the
word carries anyway (`{intent: unknown}` plus the declaring phantom). An
uncoined word is still refused where the step is written, and plain domain
values — `string`, `number`, `null`, an object — do not trip it.

**The return union survives**, because `next` returns an opaque `Passed` marker
rather than `unknown`. When step 2 is written the builder cannot know what step 5
will return — step 5 does not exist yet — so `next`'s return type has to stand
for "the rest of the fold's answer, whatever it is". Typed `unknown` it would
poison the union (`unknown | X` is `unknown`) and the scope would declare
nothing; an opaque marker excludes cleanly instead. The branded designs get this
for free, because `Outcome<unknown>` is already a distinct type.

`ValueOf` excludes the marker too, so **`ResultOf` and `ReturnsOf` are the same
type here** — one projection where the branded designs need two, and no consumer
ever sees the machinery.

**What it costs is the WRAP shape.** A wrap that only observes is unchanged. A
wrap that DECORATES is handed a `Passed` the type system declines to describe,
so it must go through its carrier to read it — an assertion, and the carrier's
own predicate:

```ts
const out = (await next({})) as unknown as Post | TrRefusal
return isTrRefusal(out) ? { ...out, body: out.body ?? '<p>refused</p>' } : out
```

That cost lands where the information is: whoever coined the words is whoever
reads them, and aligning the result to a host is an ordinary step, not a new
mechanism.

## Measured

24 scopes, four steps each, identical workload, `tsc --extendedDiagnostics`,
runs identical every time. The outcome half of each kernel counted with the
byte-identical builder excluded.

| kernel | exports | code lines | runtime values | instantiations | per scope |
|---|---|---|---|---|---|
| two-branch | 8 | 57 | 9 | 14342 | — |
| collapsed-a | 6 | 36 | 6 | 14290 | −2 |
| collapsed-b | 7 | 27 | 6 | 14290 | −2 |
| transparent | **5** | **15** | **1** | **13484** | **−36** |

**Collapsing is nearly free rather than cheap** — ~2 instantiations per scope,
which is noise. The saving is in transparency, at ~36 per scope, and in the
runtime half: nine values become one, and that one is `(r) => r`.

(An earlier revision of this prototype reported −30 per scope for the collapse.
That was measured against a different common half and is superseded by the table
above, where all four share one.)

## The demand-side gate holds too — including transparent

This is the one that mattered most, because it is what the intent axis exists
for: a host that cannot render a word must fail to COMPILE, naming the word,
rather than degrade at runtime.

`src/mount.test-d.ts` gives all four kernels a `mount(host, scope)` whose gate
rides the SCOPE argument, and a host declaring the words it renders. Then, on a
scope saying two words:

```ts
mount(fullHost, scope)                            // ✓ renders both
// @ts-expect-error cannot render the word: elsewhere
mount(partialHost, scope)                         // ✗ renders one
// @ts-expect-error cannot render the word: refusal
mount(barrenHost, scope)                          // ✗ renders none
```

**It behaves identically in the transparent kernel and in today's.** `IntentsOf`
accumulates `'refusal' | 'elsewhere'` in both, because the demand side reads
intent NAMES off return types and never the branch or the brand. A host
rendering MORE than the scope says still mounts — the set is a supply — and a
scope that says nothing (the agnostic case: no carrier, no words) mounts
anywhere.

So transparency costs the intent axis nothing, on either side.

## What it does NOT model, and why that matters

**A real mount's runtime half.** What is gated here is the type; turning a word
into an actual HTTP response, or an rr7 throw, or a queue disposition, is the
carrier's work and is not modelled.

**A carrier of real size.** The transparent kernel's wrap cost is shown once, on
one decorating wrap. How much of a real carrier is decorating wraps is the
number that would decide it, and it is not here.

Also absent: extensions and verbs, effects, capabilities, the `void` return
gate, `DepGuard`.

## Retires when

`@lntt/scope` settles its outcome (#30, reopening §40/§41). If it keeps two
branches, this records what the alternatives cost with numbers rather than an
argument; if it collapses or goes transparent, this is the prior art it went on.
