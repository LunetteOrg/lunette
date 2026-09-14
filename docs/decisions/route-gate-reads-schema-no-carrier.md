---
title: "The route gate reads the SCHEMA, and no carrier declares params"
area: scope-runtime
status: accepted
---

# The route gate reads the SCHEMA, and no carrier declares params

**Decision.** NO CARRIER DECLARES WHAT A SCOPE READS OF AN ENTRY any more, on
any of the four. `expressCarrier()` and `reactRouterCarrier()` have no type
argument at all, `honoCarrier<E>()` keeps only the env, `trpc().carrier()` loses
its `In` — and in each case what the scope reads is said once, by
`.validate(name, schema, onError)`, and THAT is what the mount is checked
against. On Express and Hono the check is `route`'s pattern
gate, re-pointed from the declaration to the schema; on tRPC it is the
resolver's own parameter, refused by contravariance exactly as before. ONE
comparison serves the two pattern hosts (`src/route-gate.ts`), each subpath
contributing only its framework's reader; tRPC borrows the demand reader and
needs no comparison of ours. Hono gains a `params` read extension so it can say
the same thing Express does.

```ts
// before, two ways and two hosts' worth of spelling
scope(expressCarrier<{ id: string }>())        …  route('/posts/:id', sc)
scope(honoCarrier<'/posts/:id'>())             …  route('/posts/:id', sc)

// after, one way on both
scope(carrier()).extend(guards).step(params)
  .validate('params', z.object({ id: z.string() }), onError)   …  route('/posts/:id', sc)
```

**Why the declaration goes, and the first reason is not the duplication.** A
type argument is fixed at `scope(carrier<X>())` — the FIRST call — so every
branch of a scope inherits it. A base value cannot then serve two routes reading
different params, and a BASE VALUE IS THE REUSABLE UNIT (#67, [`params`, the fifth read extension](./params-fifth-read-extension-route-params.md)): the thing
this library says you build once and branch. The declaration and the reusable
base are in direct conflict, and the base wins.

```ts
// the declaration, and the branch that cannot be written
const pinned = scope(carrier<{ id: string }>()).step(…)
pinned.step(async (_a, { params }) => params.slug)   // ⛔ 'slug' does not exist on '{ id: string }'

// the verb, and the two that can
const base   = scope(carrier()).extend(guards).step(shared)
const byId   = base.validate('params', z.object({ id:   z.string() }), onErr)
const bySlug = base.validate('params', z.object({ slug: z.string() }), onErr)
```

A VERB IS PER BRANCH; A TYPE ARGUMENT IS PER SCOPE. That is the whole of it, and
it generalises past params: anything a scope says about what it READS belongs to
a verb, because a scope is a value others extend.

*Then* the duplication, which is the symptom: the declaration was a second way to
say what the schema already says (principle 5), and the weaker of the two — it
checked a param's NAME where the schema checks its value. Stacking both means
naming `id` in three places for one param, which [`params`, the fifth read extension](./params-fifth-read-extension-route-params.md) had already set aside. On
Hono it was worse than redundant — the pattern was written out TWICE by hand,
once on the carrier and once at the mount, with the gate existing to keep the two
copies honest.

**And it asserted more than it checked, which is what makes the loss cheap.**
Measured on the pre-#97 code: `route('/posts/*id', sc)` against a carrier
declaring `{ id: string }` COMPILED, because the gate compared key sets and
never value types — while Express's own reader says that pattern's `id` is
`string[]`. The declaration typed it `string`, and the array arrived anyway. A
name check cannot underwrite a value type, which is the same sentence from the
other side.

**What the gate compares now, and why it is a better gate.** The pattern exists
to route and the schema exists to validate: each is there for a reason of its
own, and neither was written to be compared. That is the difference from the
declaration, whose only job WAS to be compared — a third name kept in sync by
hand. It is also the shape described before anything was built and that never
shipped; the pre-#30 branch built it, and this is that gate, on the
settled core.

The reading is the one [the carrier subpath's pattern gate](./carrier-subpath-ships-parameterised-declaration-direction.md) already gave, unchanged and now shared: ONE DIRECTION (the schema
demands, the route supplies, a superset passes); optionality is meaning on both
sides; and NO OPINION wherever either side is unreadable — a non-literal
pattern, a scope that never validated `params` (the raw dictionary's `keyof` is
the wide `string`), or a scope with no `params` step at all. Catching less is
fine; refusing a valid route is not.

**The vacuous-truth trap is now structural rather than dodged.** [What a carrier subpath ships](./carrier-subpath-ships-parameterised-declaration-direction.md)
records it twice: a param-less pattern's key set is `never`, `never extends Opaque` is
vacuously true, and the natural spelling skips every param-less route. The
shared gate wraps each host's answer in a `Supply<Req, Opt>` object, so the
empty case is `Supply<never, never>` — an ordinary type, not `Opaque`, and it
takes the same path as any other. Nothing to remember and nothing to reverse.

**What IS given up, and it is only this.** The narrowing on the host's own
accessor. `req.params.id` is `string | string[] | undefined` and
`c.req.param('id')` is `string | undefined`, where a declaration used to make
both `string`. Every part of those unions is something the router really
produces, so the widening is the type telling the truth — and a scope that wants
`string` reads `ctx.params.id` after the schema, which narrows it by having
looked at the value. The compile-time refusal at the mount is NOT given up: that
is the whole point of re-sourcing the gate rather than deleting it.

**A state this PR passed through and rejected.** Its first cut removed the gate
outright, on the reading that "one mechanism" meant dropping the guarantee the
old mechanism carried. That was wrong, and it is recorded because the argument
is seductive: #97 asked to stop declaring params on the carrier, which is a
claim about the MECHANISM, and a guarantee is not a mechanism. The measurement
that settled it: with the gate gone, a scope reading params through the schema —
the very shape [`params`, the fifth read extension](./params-fifth-read-extension-route-params.md) promotes — had NO compile-time protection at all against a
mispatterned mount, where the old carrier form did.

**THE RULE, which is what this entry is really for.** A carrier takes a type
argument for what the run BRINGS, never for what the scope wants to READ of it.
The second is the schema's job — and the check that used to ride the
declaration rides the schema instead, which is strictly better: the schema
exists anyway, and it looks at the value.

Every type argument on every carrier, decided:

| carrier | argument | what it says | verdict |
|---|---|---|---|
| Express | — | | none left |
| Hono | `E` | the env the run brings: `Variables` a foreign middleware set, and bindings | **stays** — supply, and measured to have no other door: a step annotating a richer `Context` than the carrier publishes is refused by contravariance |
| React Router | — | | none left: `Par` was a demand like the rest, and the one with NO check on it at all — it narrowed `params.id` to `string` on the strength of nothing |
| tRPC | `In` | what the scope reads of the input | **removed** — demand, and the same shape the two params declarations were |

React Router never hands us a pattern — `routes.ts` owns that mapping — so it
gets the tRPC treatment rather than a gate: `loader`/`action` put
`Validated<S, 'params'>` in the MOUNT'S OWN PARAMETER, and a route module's
`satisfies (a: Route.LoaderArgs) => unknown` refuses a mismatch by
contravariance. That is a check RR7 never had — the declaration it replaces was
compared against nothing — and it needs no read extension either, since `params`
is already what a run brings there.

**A note on Hono's `E`, since the rule invites the question.** It stays for the
`Variables` — what a Hono middleware outside this library put on `c`. A BINDING
is a dependency and belongs in the chain: a step reading `c.env.KV` depends on
something its `need` never declared, so no mount can check it and `DepGuard` has
nothing to say. A per-request-env platform boots its chain from those bindings
at the composition root ([the lazy memoized boot](./per-request-env-platforms-get-lazy.md)), and `examples/two-chains` already does exactly
that, reading `ctx.env.TOKEN` in a wire layer. The carrier's `E` types the
CONTEXT, and is not an invitation to reach around the chain.

**tRPC, which is where the rule was tested against a real counter-argument.**
The case for keeping `In` was that tRPC's supply is a SCHEMA (`.input(schema)`,
which tRPC needs anyway to validate) where Express's and Hono's is a PATTERN
(names, no values) — so `In` was a declaration checked against something real,
not a third name. The case is sound and was not what decided it: a carrier
argument for what the scope READS is the shape this entry exists to remove, and
tRPC was the last one holding it. It went, and the check did not:

```ts
const Id = z.object({ id: z.string() })

const byId = scope(carrier()).extend(guards)
  .validate('input', Id, onError)
  .step(async (_app, { input }) => input.id)      // `{ id: string }`

t.procedure.input(Id).query(procedure(byId))                      // ✓
t.procedure.input(z.object({ slug: z.string() })).query(procedure(byId))  // refused
t.procedure.query(procedure(byId))                                // refused
```

`procedure` puts `Validated<S, 'input'>` in the RESOLVER'S PARAMETER, so what
refuses a mismatch is tRPC handing that resolver `.input(schema)`'s output —
contravariance, no gate of ours, the same mechanism as before with the demand
read from a different place. One schema VALUE is referenced twice (tRPC
validates with it, the scope types itself from it), which is not two
declarations to keep aligned.

*What it costs.* Reading the state means `procedure` takes a `Scope<S>` instead
of a plain function, so `DepGuard` and the carrier gate — free from a
`(app: App, args) => R` parameter — are written out.

*And what looked like a second cost is mostly the removal of an over-promise.*
`validate('input', …)` is REFUSED on `middleware` by `StripGate`, because a
middleware's leaf strips `input` by name before `next({ ctx })` and the narrowed
value would never reach the procedure downstream — so a middleware cannot type
its input through this library at all. That reads as a loss until you measure
what tRPC itself does there: **`opts.input` inside `t.middleware(…)` is
`unknown`**, and only a resolver after `.input(schema)` gets the parsed shape.
The old `In` was handing a middleware a type its own framework declines to give
it. And the reason is not an accident of tRPC's typings: a middleware is SHARED
across procedures whose inputs differ, so pinning it to one input's shape is the
same mistake as pinning a base scope — in miniature. A middleware that really
must read the input parses it into a key OF ITS OWN, which becomes the context
override and reaches every procedure downstream, which is what a tRPC middleware
is for. Refusal and door both pinned in `trpc/index.test-d.ts`.

**Alternatives.** *Keep both mechanisms* — measured in [`params`, the fifth read extension](./params-fifth-read-extension-route-params.md) and set aside there.
*Keep the carrier declaration and add value validation beside it* — three names
per param, and the wildcard hole above says the declaration's narrowing was not
worth the third name. *Leave Hono alone*, since its declaration is the
framework's own type rather than one of ours — considered and rejected once the
Express side was working: the type IS Hono's, but the STRING is written twice by
hand, and a scope validating its params on Hono would otherwise have had two
half-checks instead of one whole one. The cost paid for that, honestly: Hono
loses `c.req.param('id')` typed as `string` from the pattern, and gains a
`params` extension that did not exist.

**What this does not touch.** `query`, `headers`, `cookies` and `body` on either
host, and everything said about transparent mounts in [what a carrier subpath
ships](./carrier-subpath-ships-parameterised-declaration-direction.md), except the params half of
the Express row: a `route` hands back `RequestHandler` at the router's own
params width now, since nothing narrower is declared.
