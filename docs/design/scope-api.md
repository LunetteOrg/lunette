# The scope API, frozen

The target surface, settled by spike and measurement rather than argument. It
is written down so a fresh implementation writes it ONCE: the branch that
produced it arrived here through several corrections (`.extend(request)` born
and retired, `.input` becoming `.params`, `react-router` created empty and then
found to be a real carrier, `.extend(carrier)` becoming `scope(carrier)`), and
none of that belongs in the code.

Decision 40 in `docs/decisions.md` records the WHY. This records the WHAT, plus
the traps that cost measurement to find.

## The shape

```ts
scope()                       // agnostic: no input verb, no vocabulary
scope(carrier)                // a carrier brings its ctx, its input verb, its words
  .extend(channel)            // channels are added; carriers are not
  .params(schema)             // the carrier's input verb (name varies by carrier)
  .guard(fn)                  // enrich, or return one of the carrier's words
  .handle(fn)                 // the leaf
```

A **carrier** is the thing you pick exactly one of: who is on the other end and
what language it speaks. A **channel** is a thing you add. They are disjoint
BY DECLARATION — a channel carries a brand, a carrier does not — so a carrier
is not expressible where a channel goes. Deriving the category from behaviour
instead ("it is a carrier if it coins a vocabulary") reads the consequence
rather than the definition, and that is how `react-router` was miscategorised
once: at the moment it was judged it coined nothing, and it later grew words.

`scope()` with no carrier stays a real thing, and is the common case for the
simplest scopes — no input, no failure vocabulary, mounts everywhere by
construction. The real examples have several (`feedScope`, `listScope`,
`aboutScope`).

## Carriers

| carrier | ctx | input verb | words it coins | channels it admits |
|---|---|---|---|---|
| `@lntt/scope/http` | `request: RequestHead` | `.params(schema)` — route params | `notFound` `forbidden` `unauthorized` `httpError` `redirect`; `json(v, n)` `html` `text`; `.status(n)` | `body` `cookies` `headers` |
| `@lntt/scope/trpc` | `request: RequestHead` | `.input(schema)` — the payload | `notFound` `unauthorized` `forbidden` `conflict` `tooManyRequests` `unprocessableContent`, as CODES. No redirect: an RPC reply has nowhere to go | none |
| `@lntt/scope/react-router` | `request: RequestHead` | `.params(schema)` | http's words, plus RR7's own response values (`data(v, {status})`, thrown `redirect`) which nothing else can render | `cookies` `headers` |

The carrier is the PROTOCOL FAMILY, not the host. Hono, Express and a
hand-wired `node:http` share `http` because they render the same words — there
is no `.extend(hono)`. React Router earns its own not because a 404 differs
there, but because its escape hatch is a response value no other host can
render.

`RequestHead` is a core TYPE — url/method/headers, no body accessors — so the
body stays unreachable except through the declared channels (§34). Every
carrier that holds one exposes it; there is no shared `request` extension.

## Channels

| channel | ctx | capability |
|---|---|---|
| `@lntt/scope/body` | `.body(schema)` / `.form(schema)` → `ctx.body` / `ctx.form` | `body` |
| `@lntt/scope/cookies` | `ctx.cookies` (the `Set-Cookie` sink) | `cookies` |
| `@lntt/scope/headers` | `ctx.headers`, and `.headers({...})` | `headers` |

## The six gates, and where each error lands

Every one names the thing that is wrong, and lands on the line that contains it.

| the mistake | where it lands | what it says |
|---|---|---|
| a carrier passed to `.extend` | the argument | `Rpc` is not assignable to `Channel` — structural, a category error |
| a channel the PROTOCOL does not have | the `.extend` argument | ⛔ this carrier has no `cookies` to speak of |
| an input verb with no carrier | the method | Property `params` does not exist on type `Scope` |
| a word the carrier does not coin | the guard/leaf argument | ⛔ this scope does not declare the intent: `code` — is it the right carrier? |
| a host that cannot render what the scope produces | the mount argument | ⛔ this host cannot render the intent: `rr7-data` |
| a host that does not implement a channel | the mount argument | §34's capability gate, unchanged |

Two of these are the SAME question asked twice, and both are needed: what the
protocol admits is knowable where the scope is WRITTEN, what a given host
implements only where it is MOUNTED — §34's "narrowing a host's set is always
legitimate" still holds.

## The bridges into each framework's own knowledge

The route pattern and the input schema are two declarations, and nothing kept
them aligned: renaming `:postId` to `:wrongName` produced no error at any mount
and failed at runtime with a 422 (verified). The gate compares them — and
**writes no parser**, because each framework already knows its own params and
can hand us the type. This is the part most easily lost in a rewrite.

| host | the bridge | our adaptation |
|---|---|---|
| Hono | `ParamKeys` from `hono/types` | strip the `?` Hono keeps inside the key (`/posts/:id?` → `"id?"`); guard the non-literal path, which yields `never` and would read as "no params" |
| Express | `RouteParameters` from `@types/express-serve-static-core` (make it an explicit devDependency) | guard the non-literal path, which yields `ParamsDictionary` whose `keyof` is the wide `string` |
| React Router | `Route.LoaderArgs['params']`, generated per route module from `routes.ts` | type the loader's `params` from the schema instead of `Record<string, string>`; the user writes `satisfies (args: Route.LoaderArgs) => unknown` |
| tRPC | none — no path exists | no gate |

Both framework readers beat a hand-written one measured against them: Express's
understands `*path` and `{/:id}`, Hono's knows a wildcard names nothing — cases
a parser of ours had to bail on.

**The rule that keeps the gate safe: on a pattern it cannot read it has NO
OPINION.** Catching less is fine; rejecting a valid route is not. Two of the
three bugs found writing the hand-rolled version were exactly that.

**Matching stays the framework's job.** We never extract: the framework owns the
pattern language, and the URL a scope reads is NORMALISED while the router
matched the raw target, so an extractor of ours could disagree with it on
`/a/../b`.

Ergonomics: Hono and Express take the pattern at the mount and hand it back to
be spread, so it is written once and both the router and the gate get it.

```ts
app.get(...handler('/posts/:postId', postScope))
```

The gate must survive that spread — it is the only form anyone writes.

## Traps already paid for

Each cost a measurement. A fresh implementation should inherit them, not
rediscover them.

1. **The intent cannot be inferred from inside a union constituent.**
   `g: (ctx) => E | Abort<I>` makes TypeScript pick the first abort candidate
   and REJECT the rest, so a guard returning two different intents stops
   compiling. Variance does not help — invariant, covariant and contravariant
   phantoms behave identically — and inferring the whole abort union collapses
   to the constraint (§39's negative). Infer the whole RETURN type and
   distribute afterwards.
2. **The gate goes on the ARGUMENT, not in the return type.** The return-type
   form is cheaper (616 instantiations per scope against 780) and wrong: it
   only fires when the next call touches the poisoned type, so a BASE — extends
   and guards, no `.handle` — compiles clean and defers the mistake to
   whichever file finally calls `.handle`, pointing at a guard its author never
   wrote.
3. **Vacuous truth, twice.** `never extends X` is TRUE, so `Exclude`-style
   bail-outs written the natural way round silently skip the empty case: a
   param-less route was taken for an unreadable pattern and checked nothing. A
   tuple wrap does not help — `never` is assignable to anything, tuple or not.
   Only the reversed test tells them apart.
4. **An invariant phantom `(x: T) => T` whose actual `T` is `never` does not
   extend `(x: any) => any`** in conditional or constraint positions, though
   ordinary assignability behaves normally. Capture every position with its own
   `infer` or its own generic parameter unified at the call site; never write
   `Handler<any, any, …>`.
5. **Branding BOTH categories collapses.** Carrier `[BRAND]: true` plus channel
   `[BRAND]?: never` reduces `Scope & Http & Cookies` to `never` on the
   conflicting property — and carrier-plus-channel is the ordinary case. Brand
   one side only.
6. **The success side needs its own word.** `json(v, 201)` sharing the abort
   side's `status` lets a host that declares it renders status aborts silently
   accept a success status it cannot express.
7. **A bare `Abort` must fail closed**, and the consequence reaches every call
   site: annotating a guard `Promise<{ post } | Abort>` ERASES the intent the
   constructor declared. Drop such annotations and let the return type infer —
   an alias to annotate with reintroduces the promise-to-keep-aligned this
   design removes.
8. **Defaulted type parameters used as let-bindings must live on a type ALIAS**,
   never on a method's own parameter list: there a caller can name them, and
   `guard<…, never>(bad)` then satisfies the gate AND empties the accumulated
   set.

## Measured

- The machinery is nearly free to HAVE (+0.8% at zero scopes) and paid per
  scope: 250 → 615 instantiations, linearly, no super-linear term.
- `scope(carrier)` versus `.extend(carrier)`: 636.7 against 638.5
  instantiations per scope. **No type-level simplification** — what the
  constructor form buys is a category that cannot be confused and three errors
  that move from the mount to the definition. Knowing WHICH carrier does not
  determine WHAT a scope produced, so `Handler` still carries both phantoms.
- On the real `examples/app`, both sides measured from a worktree at the
  pre-change commit: 207,153 → 222,755 instantiations (+7.5%), check 0.36s →
  0.41s. A figure read out of a file is not a measurement — the number this
  table used to hold was stale, and reading it as the "before" turned +7.5% into
  a reported +65%.

## Left open

- The type-efficiency pass (780 → 615 per scope) — its own issue.
- `#53` streaming: `response(…)` on the http carrier is the door it walks
  through; nothing is built for it.
- `#51` key collisions in a scope's ctx — the phantoms here are all nameable
  maps read with `keyof`, so that gate applies to them unchanged.
