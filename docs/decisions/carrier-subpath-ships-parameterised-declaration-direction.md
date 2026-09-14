---
title: "What a carrier subpath ships: a parameterised declaration, a one-direction pattern gate, transparent mounts, and tRPC's second unit"
area: scope-runtime
status: accepted
---

# What a carrier subpath ships: a parameterised declaration, a one-direction pattern gate, transparent mounts, and tRPC's second unit

**Decision.** Four choices this branch made and left as code comments. None is
large enough for an entry of its own; together they are what a carrier subpath
IS, past what [a carrier being `__args` alone](./carrier-needs-no-vocabulary-at-all.md) says a carrier is not.

**A carrier is a parameterised FACTORY, not a bare value.**

```ts
export const expressCarrier = <Params = ParamsDictionary>(): ExpressCarrier<Params> => ({})
```

The letter of [a carrier being `__args` alone](./carrier-needs-no-vocabulary-at-all.md) says "pure declaration — no runtime value", and there is now a call
returning `{}`. The spirit holds: the object carries nothing, and the TYPE
ARGUMENT is the whole point of the call — `expressCarrier<{ id: string }>()` is
how a scope says which params it reads, and `honoCarrier<'/posts/:id'>()` which
pattern. A bare exported value cannot take a type argument at the USE site,
which is where the claim has to be made, since the same carrier serves every
scope in the app.

> **The PARAMS argument is gone from both, since [the route gate reads the
> schema](./route-gate-reads-schema-no-carrier.md)**, replaced by the schema — so
> `expressCarrier()` takes no type argument at all today and `honoCarrier<E>()`
> keeps only the env. The reasoning above still decides the SHAPE: a carrier
> stays a call rather than a bare value, because React Router and tRPC still
> make their claim at the use site and one vocabulary should not have a carrier
> invoked beside a carrier that is not.

*Alternative.* `scope<Args>()` already takes the args shape directly, so
`scope<{ req: Request<{ id: string }>; res: Response }>()` expresses the same
thing with no factory — and makes the author write the host's arg shape by hand,
at every scope, keeping it aligned with the carrier's by discipline. The factory
is that shape with the host's half filled in.

**The pattern gate runs ONE direction: the scope DEMANDS, the route SUPPLIES.**

> **RE-SOURCED, not retired, since [the route gate reads the schema](./route-gate-reads-schema-no-carrier.md).** Everything this paragraph and its two
> traps say is still what the gate does — one direction, superset passes,
> optionality is meaning, and the vacuous-truth test that the empty case needs.
> What changed is where the DEMAND comes from: the `.validate('params', …)`
> schema instead of a declaration on the carrier, on both hosts, through one
> shared comparison (`src/route-gate.ts`). The vacuous-truth trap is now avoided
> structurally rather than by reversing the test — the supply is wrapped in a
> `Supply` object, and `Supply<never, never>` is not `Opaque`.

A param the scope reads and the pattern does not supply is `undefined` at
runtime against a type saying `string`; a param supplied and never read is
nothing at all. A SUPERSET passes, which is the verdict `DepGuard` gives the
chain, and what lets one scope mount under a nested route or on a second pattern
naming the same param.

Two traps paid for, both in the code:

- the test is REVERSED on purpose — a param-less pattern's key set is `never`,
  and `never extends Opaque` is VACUOUSLY TRUE, so written the natural way round
  the gate skips every param-less route;
- OPTIONALITY IS MEANING on the supply side. `/posts/:id?` (Hono) and
  `/posts{/:id}` (Express) also match without the param, so a required demand
  takes only a required supply while an optional one takes either. Express's own
  reader carries this as `Partial<…>` and the first version of the gate lost it
  to a bare `keyof`.

*What the second direction was FOR, on the branch that had it.*
`origin/story-30/scope-impl` runs the same gate BOTH ways
(`packages/integration/src/{express,hono}.ts`, pinned in
`test/route-gate.test-d.ts`: "Both directions of a mismatch are rejected, on
both hosts"). The difference is not the count of directions, it is WHAT the
pattern is compared against. There it was the `.params()` SCHEMA — what
VALIDATES — and a param the schema does not declare is a param nobody checks,
which is a hole worth naming. Here it is what the scope READS, and a param
nobody reads is nothing at all. Same machine, two sources, and the source is
what decides how many directions are meaningful.

Two things carry over from that file and one does not. The reversed
vacuous-truth test is there already, named as the trap [the capability gate](./carrier-capabilities-gate-host-portability-body.md) records, and the
message-per-branch chaining (`Missing` first, then `Extra`) is the shape this
branch had to rediscover as an invariant — see [the mount as a gate too](./mount-gate-too-checked-verb-has.md). What does NOT carry over is
optionality: its `RouteParams` reads a bare `keyof` too, so the header claiming
`{/:id}` resolves to its real param set is half right — the name arrives, the
`?` does not. Whoever revives that code inherits the hole this branch closed.

**Every mount is TRANSPARENT: it hands back the host's own type with what the
scope knows filled in.** This is a requirement, not a detail, and it is what
several non-obvious type shapes are for — each pinned in a `*.test-d.ts`:

| host | what reads it | what the mount must therefore hand back |
|---|---|---|
| Hono | `hc<typeof app>()` | what the SCOPE returned, so `c.json(v)`'s `TypedResponse` survives — declaring `Promise<Response>` leaves the client with `unknown` |
| React Router | `useLoaderData<typeof loader>()`, RR7 typegen | `ResultOf`, or the whole route's data type is silently `unknown` |
| tRPC | `inferRouterOutputs`, `.output(schema)` | `R` kept generic through `procedure`; and `middleware`'s return type WRITTEN OUT, since `t.middleware` reads `$ContextOverrides` off the declared return and an inferred one grows the context by nothing |
| Express | the params, and `LocalsOf` | `RequestHandler<ParamsOf<S>>` from `route`, the derived locals from `mw` — the params half went to [the route gate reading the schema](./route-gate-reads-schema-no-carrier.md), the locals half stands |

A wrapper that declares the widest thing that compiles costs none of these at
its own call site and all of them at everyone else's.

**tRPC gets a second mount, and it is tRPC's own unit.** The research concluded
that a procedure is the only mount unit tRPC has. That was refusing an
EXPRESS-SHAPED middleware — a `req`/`res`/`next` door tRPC does not own — and
the reasoning holds. `t.middleware` is a door tRPC already owns, so `middleware`
mounts onto it: what a scope's steps derive becomes the CONTEXT OVERRIDE
(`next({ ctx })`), the exact twin of `res.locals` and `c.set` in the shape tRPC
reads. What the research got wrong was the count, not the principle.

**Deferred.** The `README` of `@lntt/scope` still describes the pre-#30 surface
(`.input`, `.guard`, `.handle`, `runScope`) from its own banner down, so the two
APIs sit side by side with nothing saying which exists. Its own work, and its own
issue.
