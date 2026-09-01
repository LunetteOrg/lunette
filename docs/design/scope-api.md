# The scope API

The target surface, settled by spike and measurement rather than argument.
Decision 40 in `docs/decisions.md` records WHY a carrier owns its vocabulary,
and decision 41 why validation belongs to the carrier too — which retires the
core's `invalid` branch and, with it, the sections below that still describe a
generic `.validate` over an open set of ctx entries. This records the WHAT, plus
the traps that cost a measurement each.

## The lexicon

Every word below is used in exactly one sense, and the ones that were reused for
two are named as such.

| word | means |
|---|---|
| **scope** | the thing you declare: a carrier, its extensions, a step stack, a leaf |
| **scope execution** | one run of a scope — `postScope(app, params)` |
| **scope execution parameters** | the second argument: what belongs to THIS run. NOT `seed`, which wire already uses for the build-once (the other lifetime) |
| **carrier** | chosen exactly once, in `scope()`. Pure declaration — no runtime value; never a step |
| **extension** | a STEP that populates a ctx entry, and sometimes contributes a verb. Added like any other step |
| **step** | the primitive: wraps the rest of the fold. Distinct from wire's **layer**, which is a different mechanism (§33) |
| **verb** | a method a step contributes to the BUILDER (`.header(…)`). Not a WORD — a word is a value a step returns |
| **guard** | sugar for the step shape "enrich, or stop with one of the carrier's words". Named for the shape, not for authorization — one that never aborts is the degenerate case |
| **leaf** | the use case: the innermost step, the one that does not call `next` |
| **entry** | a ctx key that `validate` may name. Either ARRIVES in the execution parameters (`params`, `input`) or is DERIVED by an extension (`query`, `body`, …) |
| **enrichment** | what a guard returns. Also validatable, but declared by nobody — it is a return type |
| **transport feature** | what an extension needs (`body`, `query`, `request-headers`). One alphabet, read twice: against the carrier at `.extend`, against the host at the call. All three are READS — the outbound side needs none, it rides a carrier's word |
| **intent** | a word a carrier coins (`redirect`, `code`, `rr7-data`) |
| **registry** | the opaque map steps write and mounts read. The core never looks inside |
| **~~outcome~~** | RETIRED with §42. The fold produces nothing of its own: what a scope hands back is what its leaf returned, and whether that went well is the carrier's statement, not the core's |
| **word** | a value a step returns instead of a domain value, to SAY something. `Word<I>` is all the core knows of one — it carries an `intent` and declares its name — and a carrier writes the rest |
| **passed** | what `next` hands back: an opaque marker standing for "the rest of the fold answered, whatever it said". At runtime the inner answer comes back whole; the TYPE declines, because when a step is written the steps after it do not exist yet |
| **response envelope** | what a carrier's outbound word carries: status, content type, headers, cookies. `json`/`html`/`text` are `response(…)` with a content type filled in |

## The shape

```ts
const postScope = scope(carrier)   // a carrier brings what a run carries, and its words
  .step(query)                     // an extension is a step that populates an entry
  .step(body('json'))              // and one that asks for the request the body reads from
  .step(authenticated)             // a guard: enrich, or hand back one of the carrier's words
  .step(readPost)                  // the leaf: the innermost step, the one that stops

// A SCOPE IS THE FUNCTION THAT RUNS IT — from the first line, with nothing to
// close. This is a SCOPE EXECUTION.
const result = await postScope(app, { request, params })
```

**One verb.** `.step()` is the primitive and, in the base, the whole surface:
there is no `.guard`, no `.handle`, no `.extend` until one of them earns its
place against this (and `.handle` has lost the two things it was going to hide —
there is no termination to declare and no outcome to build). Which sugars come
back, and in what shape, is decided when the carriers and extensions are ported
onto this base, because that is where each one shows what it needs.

> **Reading the rest of this document.** The sections below still write
> `.extend(query)` and `.validate('params', schema)`. Neither is shipped. The
> read extensions are #62 and today are `.step(…)`; VALIDATION left the core
> altogether with §41 — a carrier-free `validate` had nothing to fail with, so
> the core carried an `invalid` branch to give it somewhere to land, and both
> are gone. It comes back per carrier, each failing in its own words (#64).
>
> Read them for WHAT they do, which stands: an extension populates an entry, and
> a validation verb refines one. What changed is WHO owns the verb and the word
> it fails with.

Two arguments, split by LIFETIME. The first is the built chain — the
DEPENDENCIES, alive as long as the process (§33 tier 1). The second is the
**scope execution parameters**: everything belonging to this one run (§33 tier
2), which on HTTP is the request and the params the router matched, on tRPC the
request and the payload, on a bus the message. Who passes them is the same
adapter either way, so that is not the axis; how long they live is.

The word is not `seed`, and deliberately: wire already uses `seed` for what the
build-once reads (`seedFrom(c.env)`, `SeedOf<C>`), which is the OTHER lifetime.
Both appeared within twenty lines of `@lntt/integration/hono` meaning different
things — the same one-word-two-meanings fusion §40 removed from `.input`.

There is no `runFold`/`runScope` beside the call: a hand-wired host calls the
scope.

The gates ride those two arguments, so a direct call is checked exactly as a
mount is — `DepGuard` on the app, and the mount's capability gate on it too.

A **carrier** is the thing you pick exactly one of: who is on the other end and
what language it speaks, and it is PURE DECLARATION — no runtime value, chosen
once, never a step. An **extension** IS a step: one that populates a ctx entry,
and sometimes contributes a verb. So the two are disjoint by what they ARE
rather than by a brand: a carrier is not a step, and `scope()` is the only place
one can be named. Deriving the category from behaviour instead ("it is a carrier
if it coins a vocabulary") reads the consequence rather than the definition, and
that is how `react-router` was miscategorised once: at the moment it was judged
it coined nothing, and it later grew words.

`scope()` with no carrier stays a real thing, and is the common case for the
simplest scopes — nothing to read, no failure vocabulary, mounts everywhere by
construction. The real examples have several (`feedScope`, `listScope`,
`aboutScope`).

## One primitive: a step, and what it says

Everything the builder offers is sugar over ONE thing. A **step** wraps the rest
of the fold: it reads the app and the ctx as they stand, and either continues
inward with what it populates or hands back something of its own and stops.

A step says THREE things, and every one of them rides a position the signature
already has — so a step is a plain FUNCTION, declares nothing, and nothing can
drift from the code beside it:

| what it says | where it lives |
|---|---|
| what it knows of the app | the first parameter's type |
| what it knows of the ctx | the second parameter's type |
| what it populates | `next`'s parameter type — ANNOTATED |

```ts
async (deps: Repos, ctx, next: Next<{ session: Session }>) => { … }
```

Enriching the BUILDER is a different axis and a different verb — see **Two
verbs, two axes** below.

**What it populates is NOT inferable from the body** — measured. `Add` occurs
only in a parameter position of `next`, so `(app, ctx, next) => next({ user })`
infers the bare constraint and declares nothing. Annotating the parameter IS the
declaration, and it sits on the parameter it describes rather than in a phantom
beside it.

**A step returns one of three things, and the fold touches none of them.** What
`next` gave it, a WORD from the carrier's vocabulary, or a plain domain value —
and whichever arrives is what the caller gets (§42). There is nothing to
normalise and nothing to tell apart, because the core no longer needs to know
which it was: that question belongs to the carrier, which coined the words and
also writes the mount that reads them.

Returning the WORD rather than a pre-built result is what closes the intent
fail-open rather than documenting it. While a step had to hand back a built
outcome, a real word was cast down to an intent-less one and its name was gone
before the builder could read it — so the same refusal contributed `status`
through the sugar and `never` through a raw step. Returning the word keeps its
TYPE, and the builder distributes over the whole return (trap 1) to collect
every word the step can say.

### Two verbs, two axes

```ts
.step(fn)        // acts on the FLOW    — the step list grows
.extend(ext)     // acts on the BUILDER — the step list does not
```

An extension contributes VERBS, and a verb is a function from its own arguments
TO A STEP — so the fold work happens when the verb is CALLED, not when the
extension is added. That is why `.extend` needs no step of its own, and why it
is not a second primitive: `.step` remains the only thing that ever adds to the
fold, and **an extension never appears in the step list**, which is checkable
rather than assertable.

The evidence for the split is that the two never co-occur. Of the ten extensions
the previous core shipped, five did fold work and contributed no verb, two
contributed verbs and did no fold work, two were carriers doing neither — and
the ONE that did both was the response-header sink, which the returned-response
decision retired. A step value carrying both was a shape nobody used.

**A verb's signature is DECLARED, and that is a measurement rather than a
preference.** Computing it from the factory removes a duplicate, which is a real
gain — but `infer` through a GENERIC factory instantiates its type parameters to
their constraints, and every verb that matters is generic:

| form | `.pin(201)` yields | duplication |
|---|---|---|
| declared | `201` | the argument list, written twice |
| computed | `number` | none |

`validate` loses more than a literal: it loses the entry's name AND the schema's
output type, which is its whole job. So the duplicate stays, and `Extension<M>`
ties the declaration to the factories BY NAME — a verb with no factory, or a
factory no verb declares, is a compile error at the extension, which closes the
half of the duplication that can be closed.

A verb reads the scope it was called on through `this: Scope<S>`. That works
because it is a METHOD call; on the scope's own call signature `this` binds to
`void`, which is the reason the accumulated state lives in a type parameter.

### There is no closing verb, and nothing to terminate

A step that does not call `next` ends the fold, and the fold has always seen
that at RUNTIME. A declaration was only ever needed so the TYPE could turn the
builder into a callable — because a call signature cannot read state accumulated
in an intersection: `this` binds to the receiver of a METHOD call, and calling
an object directly binds it to `void` (measured).

Carrying the state in a type PARAMETER removes the need, and
`research/parameterised-builder` measured what that costs: **less** — about −54
instantiations per scope and −11 per step, types down ~16%. The prediction was
that rebuilding a state object at every `.step` would cost more; it is the
INTERSECTION that is expensive, because `Self` gains a member per verb and every
later read walks all of them.

So a **scope IS the function that runs it, from the first line**, and two things
follow that the intersection form could not express:

- **`R` accumulates as a UNION.** Under intersection it cannot — `A & B` over a
  type that is not a key collapses, which is why the other union-valued axes are
  maps of NAMES. A guard that can hand back a domain value of its own now
  appears in what the scope produces, where before only the closing step did.
- **A base with no leaf has `R = never`**, which is the honest statement that it
  produces nothing. Running one THROWS: `never` has no inhabitant, so there is
  nothing to hand back, and a function whose return type is `never` is exactly
  one that does not return normally. The error convention agrees (principle 3) —
  a scope with no leaf, run, is a construction bug, and handing back `undefined`
  would render a bug to its caller as a value. §42 removed the caveat this used
  to need: while the outcome had two branches, `Outcome<never>` was NOT empty
  because `abort` stayed inhabited, so a base that refuses was a separate case.
  With one channel a refusing base has `R` = its word, and `never` means never.

`research/terminal-step` asked whether a step COULD close the builder and
answered yes, with a number. The question that mattered was whether the builder
needs closing at all, and it does not.

**A carrier is NOT a step; it is pure declaration.** It brings what a run carries
and the words it coins, has no runtime value, and is chosen exactly once in
`scope()`. An extension IS a step — one that populates a ctx entry, and
sometimes contributes a verb.

**Everything runs where it was written.** One ordered list, no category hoisted.
The consequence is worth stating because it changes behaviour: a body-reading
step added after an authenticating one reads the body only for requests that got
past the guard, so an anonymous request is refused without a 10MB parse.

### The lock is the ctx, not an alphabet

"What I need from the transport" was going to be a declared NAME, checked
against a set the carrier publishes. It does not need to be. Under
`strictFunctionTypes` a function-typed parameter is contravariant, so a step
ANNOTATING a ctx wider than the scope holds is refused **at the argument**:

```
Types of parameters 'ctx' and 'ctx' are incompatible.
  Property 'arrayBuffer' is missing in type '{ readonly url: string }'
```

A step reading what the scope does not hold is therefore not a rule the core
enforces — it is not expressible. `RequestHead` (§34) does the rest: a carrier
publishes a request with no body accessors, so only a step that ASKS for the
full request can read the body, and asking is what makes it visible.

Of the five transport features the alphabet was going to name, three
(`query`, `request-headers`, and reading cookies) never needed one: they read
`url` and `headers`, both already on `RequestHead`. Only the body did, and
assignability covers it.

**What does NOT go away is the MOUNT-side gate.** "Does this host actually
stream the request body into the Web `Request`?" is a claim about MACHINERY, not
a type — Express supplies the same `Request` type whether or not `toWebRequest`
filled it. So `Capability`/`CarrierGuard` survive for the mount, with §34's
asymmetry intact: demand open, supply a written-out set.

## Extensions populate the ctx; a validation verb refines it

> **§41 moved the verb.** This section was written when `validate` was a
> carrier-FREE extension in the core, and the paragraph below still argues for
> that. It is superseded: a carrier-free verb has no word to fail with, which is
> why the core had to carry an `invalid` branch for it to land on. Both are gone
> (#64). What still stands is everything about the ENTRIES — who populates them,
> which are validatable, and why the registry is opaque.

A carrier or an extension POPULATES ctx entries, always, by being extended.
Extending IS reaching: `.extend(query)` means `ctx.query` is there, typed as
what a query string actually carries, readable with no schema at all. Some
entries are also marked VALIDATABLE, and `validate(name, schema)` is a further
step over one of them: same key, narrower type.

```ts
ctx.headers.authorization           // read, no schema, typed Record<string, string>
ctx.query.page                      // read, no schema, string | string[]
scope(http).extend(query).validate('query', pageSchema)
ctx.query.page                      // after validating: number
```

This keeps the capability axis exactly as §34 built it — the claim is made by
`.extend`, because extending is what reaches the machinery. There is no
per-call declaration to forget and no second place to look.

~~`validate` is a CHANNEL, and a carrier-free one: running a schema over a value
asks nothing of the transport, so it composes on a bare `scope()` and on every
carrier.~~ **Reversed by §41.** Running the schema asks nothing of the
transport, but REFUSING does: a rejection has to be said, and every way of
saying it is a word from some carrier's vocabulary. The carrier-free version had
none, so the core grew a branch to hold the answer — the core owning a piece of
the alphabet after all, which is the thing this split exists to prevent. The
verb belongs to the carrier, and fails in its words (#64).

What the core keeps either way is the MECHANISM and never the ALPHABET: the
`ABORT`/`OK` brands with no intent of its own (§40), the capability gate with no
capability (§34), and no schema engine — Standard Schema is a spec, and whoever
passed the schema owns what runs.

`Validatable` stays a core concern in shape: what a scope HAS is what the
carrier and the extensions populated, and only the builder knows that set. The
verb knows how to run a schema over one of them, and nothing more.

**A guard's enrichment is validatable too**, and excluding it was arbitrary: a
guard that calls an external service returns data as untrusted as a request
body, and narrowing it with a schema is an ordinary thing to want. The rule
falls out of the axes that already exist — validatable is what the scope holds
as DATA (`__validatable`, the declared entries, plus `__acc`, the enrichments),
never the transport handle or the write sinks, which live on `__ctx`. So
`ctx.request` — the transport handle, which is not data — is not nameable, and
everything else is. There is no `ctx.response` to exclude any more.

It also keeps a REGISTRY, opaque: a step may record something under its own
keys (`Step.registers`), and the built `Handler` carries it out. The core never
reads it. The validation extension writes the schema there, and a host mount reads
it back for its native validator (`sValidator('param', h.registry.params)`) —
neither of which the core knows about.

The cost is one line per validating scope, and it is real: 37 of the scopes in
the tests validate something, and each now carries an `.extend(standardSchema)`
it did not before.

The name is CONSTRAINED, not gated: the parameter's type is the union of the
entries this scope has, so an editor completes it and a typo is told what it
could have written (`"wrong"` is not assignable to `"params" | "query"`). The
gate idiom (`ReturnGate`, §40) is the wrong tool here — it types the parameter
`string` and loses completion. The one case a union cannot express is the EMPTY
one, where it degrades to `never` and names nothing, so the alias substitutes a
sentence there:

```ts
type Nameable<Self> = keyof (ValidOf<Self> & AccOf<Self>)
type Validatable<Self> = [Nameable<Self>] extends [never]
  ? '⛔ this scope has nothing to validate — did you give it a carrier?'
  : Nameable<Self> & string
```

The tuple wrap is trap 3, not decoration. The schema parameter is NOT
constrained against the entry's raw type — see below for the measurement that
rules that out — so it is an ordinary `X extends StandardSchemaV1` whose OUTPUT
refines the entry; a `.test-d.ts` pins that name and schema both still infer.

| ctx entry | contributed by | its raw type | capability |
|---|---|---|---|
| `params` | `http`, `react-router` | `Record<string, string>` | none |
| `input` | `trpc` | `unknown` | none |
| `body` | `body('json')` | `unknown` | `body` |
| `body` | `body('form')` | `Record<string, string \| File>` | `body` |
| `query` | `query` | `Record<string, string \| string[]>` | none |
| `cookies` | `requestCookies` | `Record<string, string>` | none |
| `headers` | `requestHeaders` | `Record<string, string>` | none |

The raw type is what the entry HOLDS before anyone validates it, and that is
its whole job: `ctx.query.page` is `string | string[]` and readable as it is.
It is `ValidationTargets` from `hono/types` reproduced as an open map (Hono,
`dist/types/types.d.ts:539`), except that ours is the ctx type rather than a
callback's parameter.

**It does NOT gate the schema, and cannot.** Measured against real zod: the
test `Raw extends InferInput<S>` rejects every schema including the valid ones,
and the reverse test `InferInput<S> extends Raw` rejects
`z.object({ page: z.coerce.number() })` — the most ordinary query schema there
is. The reason is in zod's own types: `z.coerce.number()` reports its
`InferInput` as `number`, which is exactly what the schema that genuinely
mishandles a query string reports. The two are indistinguishable at the type
level, so no test on the input face can separate them, and the rule that
governs this codebase's gates says rejecting a valid declaration is worse than
catching nothing (see the route gate below). A wrong schema over a source is
therefore a 422 at runtime, as it is today.

**The body extension is a FACTORY, because a populated `ctx.body` has already
been parsed.** `.extend(body('json'))` or `.extend(body('form'))` — one ctx
key either way, so a leaf shared between an API route and a browser-form route
reads `ctx.body` in both and needs no adaptation. The shape difference lives in
the SCHEMA (a form coerces its strings), which is where it belongs, and the
ENCODING lives at the wiring, which is where the host knows it: a React Router
action extends `body('form')`, a JSON route extends `body('json')`.

**One body extension per carrier FAMILY, never one with a branch inside.** It
reads `ctx.request` and calls `.arrayBuffer()`, which holds for any Fetch-based
carrier and for none of a bus, whose message body is already an object. A branch
per carrier would be one thing meaning two by where it lands — §40 in reverse.
And nothing has to be defended at runtime: a bus carrier does not admit `body`,
so `.extend(body('json'))` there is a compile error, and the bus brings its own
way in. That is the gate doing the work the branch would have done badly.

We ship no `json`/`form` aliases. A codebase that wants them writes
`const json = body('json')` once (principle 5: sugar the caller can build is
not API we owe).

**Restricting an encoding needs no mechanism.** A carrier that reads JSON but
cannot parse multipart admits `json` and not `form`; fewer admitted names IS
the restriction, and there is no alphabet to narrow. Every carrier we ship
admits both, so the negative that proves this is written against a fixture
carrier.

**A populated `ctx.body` costs a read per request** — the parse runs whether or
not a guard ever looks, and a guard that aborts first still paid it. That is
the deliberate price of `ctx.body` being honest: it is there, so it was read.
A lazy getter was rejected — an async accessor in a synchronous ctx is worse
than the read, and it is ambient magic (principle 7).

## The outbound side is a RETURNED value

`response(body, init)` is the general word, and `json`/`html`/`text` are sugar
over it — particular content types, nothing more. The same envelope rides an
abort, because a logout drops a cookie AND redirects:

```ts
response(v, { status?, contentType?, headers?, cookies? })
json(v, 201)            // = response(v, { status: 201, contentType: 'application/json' })
redirect('/', { cookies: [dropped] })
```

**Nothing is written through a sink.** A step that wants to decorate what comes
back wraps `next` and modifies what it was handed — which is the middleware
shape the primitive already has, and the case that once justified sinks. It is
also the ONE shape that pays for §42: `next` returns a `Passed` that says
nothing, so a decorating step states what it expects, and a carrier does that
once in a helper its decorators are written against:

```ts
.step(async (app, ctx, next) => {
  const out = await next({})          // let it run
  return withCookie(out, 'sid', fresh) // and change what came back
})
```

A rolling-expiry session refresh is exactly that, and the leaf never learns
about a cookie that is not its business.

**What this removes.** `outcome.effects` has exactly three readers —
`readCookies`, `readHeaders`, `readDefaultStatus` — and all three fold into the
envelope. So the whole EFFECTS axis goes with them: `Outcome.effects`,
`Handler`'s `__eff` and its `Eff` parameter, `__effects` on extensions, and the
two write extensions themselves. With no sinks there is nothing under
`ctx.response`, so the ctx's two-halves rule goes too — it existed only because
reads and writes collided over `ctx.cookies`/`ctx.headers`, and with the writes
gone those names are free for the reads with no renaming.

It also settles the §40 inconsistency instead of paying for it: `Set-Cookie`
becomes carrier vocabulary like `redirect()`, because it rides the same returned
value, and its capability flows from the RETURN type the intent axis already
reads. And `response(…)` is the door #53 (streaming) was already named for.

**The static form survives as a carrier verb.** `.headers({…})` is sugar for
`.step(withHeaders({…}))` — a method is already a function returning a step —
and it moves from an extension to the CARRIER, since the response is the
carrier's. That gates it for free: `scope(rpc).headers({…})` fails with
*Property 'headers' does not exist*, because a carrier with no response to
decorate simply does not offer the verb. No capability, no `__needs`.

**Why `.headers({…})` has a verb and cookies do not — and it is not symmetry.**
Mechanically they are the same: both ride the envelope, and a wiring verb is
sugar for `.step(with…({…}))`. What differs is WHEN the value is known. A header
is usually a policy (`cache-control` on a read, `x-served-by`) and you can write
it where you wire the route; a cookie is usually a computed value — the session
just created, the token just signed — which does not exist yet at the wiring. So
the envelope is the general form, and a static verb is justified only by how
often the static case occurs: often for headers, rarely for cookies. `.cookie()`
is one line the day a real case turns up, and shipping it now FOR symmetry would
be API with no caller (principle 5).

**And `set-cookie` stops being a capability.** Cookies can only ride a
carrier's outbound word, and those words are exported from the CARRIER's own
subpath — `@lntt/scope/trpc` has no `response`, so on an RPC carrier the verb
does not exist. Import http's into a tRPC scope and `ReturnGate` refuses it at the
definition (it coins `status`/`redirect`/`ok-status`; tRPC's vocabulary is
`code`), and
an http scope cannot mount on tRPC anyway — `IntentGuard` refuses it for the
same intents. The capability was the net under that case; the intent axis holds
it, on both sides, and holds it better.

**What is left uncovered, and how it changed shape.** A host that speaks HTTP
and does not flush `Set-Cookie` still drops one. But with sinks the host had to
opt IN to reading `effects`, so forgetting was easy and silent for the user;
with an envelope the codec is handed the response and must render it, so a
missing field is a bug in the six files WE own, not in anyone's app. It moves
from silently-yours to testably-ours.

## Ctx has one half now

Everything in `ctx` is something the scope READS: the entries, plus each guard's
enrichment. Nothing is written through it.

```ts
ctx.params.postId            // a validated entry
ctx.body                     // whichever encoding this scope extended
ctx.cookies.session          // an incoming cookie — the name is free, see below
ctx.headers.authorization    // an incoming header
```

This is a REVERSAL, and worth keeping the reason: while the response was written
through sinks, `ctx.cookies` and `ctx.headers` were taken by them, and the
incoming cookie and header — the natural owners of those names — had to be
pushed under a `ctx.response` split, or distinguished by number (`ctx.cookie`
against `ctx.cookies`, too fine to survive a reader). With the outbound side
returned instead of written, the sinks are gone and the names go back to the
reads, which is where they belonged.

#51's ctx-key collision gate is still missing, and this removes the one
collision the design was creating for itself rather than closing it.

## Carriers

| carrier | ctx | validatable | words it coins | it admits |
|---|---|---|---|---|
| `@lntt/scope/http` | `request: RequestHead`, `params` | `params` | `notFound` `forbidden` `unauthorized` `httpError` `redirect`; `response(v, init)` and its sugar `json` `html` `text` | `body` `query` `request-headers` |
| `@lntt/scope/trpc` | `request: RequestHead`, `input` | `input` | `notFound` `unauthorized` `forbidden` `conflict` `tooManyRequests` `unprocessableContent`, as CODES. No redirect: an RPC reply has nowhere to go | `request-headers` |
| `@lntt/scope/react-router` | `request: RequestHead`, `params` | `params` | http's words, plus RR7's own response values (`data(v, {status})`, thrown `redirect`) which nothing else can render | `body` `query` `request-headers` |

The carrier is the PROTOCOL FAMILY, not the host. Hono, Express and a
hand-wired `node:http` share `http` because they render the same words — there
is no `.extend(hono)`. React Router earns its own not because a 404 differs
there, but because its escape hatch is a response value no other host can
render. It admits `json` as well as `form`: `FormEncType` in RR7 includes
`application/json` (`react-router@7/dist/development/data-*.d.ts`), so both
encodings are things an action really receives.

**What tRPC excludes, and why it is not a permission problem.** `body` and
`query` are both refused there, for the SAME reason: the surface exists but
belongs to tRPC's protocol, not to the app. A tRPC mutation does have a request
body — it is the input envelope — and the query string carries `input`, `batch`,
`connectionParams` and `lastEventId` (verified in `@trpc/server@11.18.0`). What
differs is only how hard the refusal is: the body is unreachable anyway, since
`RequestHead` is headless on every carrier (§34), while the URL is right there
on `ctx.request` and a guard can parse it by hand.

So the gate on `query` is ADVISORY, not enforcement, and that distinction is
worth keeping straight — conflating the two is the "false safety" #38 warns
about. It declines to offer a typed convenience for a case that does not exist,
and points at validating `input`, which is the declared way in (#64).

What is actually missing there is not a permission but an EXTENSION. tRPC
exposes its own structured surface per request — `type`, `isBatchCall`, each
call's `path`, and `connectionParams`, which is genuinely app-level (it is how a
client passes credentials on a websocket) — and `@lntt/scope/trpc` should ship
extensions over THAT, rather than borrowing HTTP's and having them gated off.
It is `.params` versus `.input` again: every carrier names its own way in.

`request-headers` is admitted, and stays admitted: an auth header is the app's,
not the protocol's.

tRPC admits the READ extensions and neither write one: it reads headers and
incoming cookies like anything else holding a `RequestHead`, has no readable
body, and drops `Set-Cookie`. It admits no `query` either — nothing in an RPC
contract lives in the query string. That asymmetry is why reading and writing
cookies are two different extensions with two different capabilities: one
extension with an all-or-nothing capability would have gated a session-reading
RPC scope off tRPC for a `Set-Cookie` it never wrote.

`RequestHead` is a core TYPE — url/method/headers, no body accessors — so the
body stays unreachable except through a declared extension (§34). Every carrier
that holds one exposes it; there is no shared `request` extension.

## Extensions

| extension | contributes | what its step ANNOTATES |
|---|---|---|
| validation — per CARRIER, not an extension (§41, #64) | a verb that refines an entry, failing in the carrier's own word | the entry it refines |
| `@lntt/scope/body` — `body('json' \| 'form')` | `ctx.body`, parsed | a request whose body can be read |
| `@lntt/scope/query` | `ctx.query` | `{ request: RequestHead }` — `url` is enough |
| `@lntt/scope/cookies` | `ctx.cookies` | `{ request: RequestHead }` — `headers` is enough |
| `@lntt/scope/headers` | `ctx.headers` | `{ request: RequestHead }` |

There is no separate alphabet to declare: a step asks for the ctx it reads, and
a carrier either publishes it or does not. Three of these ask for nothing a
carrier does not already publish, which is why they never needed a name.

The two WRITE extensions are retired by the returned-response decision above:
what they did is part of the envelope a carrier's words carry, and a step that
decorates on the way out wraps `next`. Their subpath names come free with them,
so the READ extensions take them back — `@lntt/scope/cookies` reads the incoming
cookie, `@lntt/scope/headers` the incoming header, and neither needs a
`request-` prefix to say it is not the other one.

**An extension declares ONCE what it needs from the transport, and that one
name is read twice.** The alphabet is one; what differs is the SET it is
checked against and the moment:

| the question | asked at | against |
|---|---|---|
| does the PROTOCOL have it at all? | `.extend` | the carrier's set (`__admits`) |
| does THIS HOST provide it? | the call / the mount | the host's written-out set |

tRPC has no readable body — not as an implementation gap but because an RPC
call carries none — so `scope(rpc).extend(body('json'))` is wrong where it is
WRITTEN, and no tRPC host could redeem it. Hono, Express and React Router all
speak HTTP and all have bodies, but a hand-wired host may simply not flush
`Set-Cookie`; that scope is legal to write and is refused where it is MOUNTED.
Knowable-where-written versus knowable-only-where-mounted is why both exist,
and why §34's "narrowing a host's set is always legitimate" still holds.

The name is a TRANSPORT FEATURE, not the extension's own name — a carrier lists
the features it has rather than the extensions it knows, which would mean
knowing every extension anyone might write. A third-party extension over a
feature already there composes with no change to us; only one needing a
genuinely new feature (SSE wanting a streamable response) needs whoever wrote
the carrier, which is §34's machinery rule at the definition site.

An extension that needs NOTHING declares `__needs: {}` and composes anywhere, a
bare `scope()` included — validation is the first shipped one, and #55 lists the
rest (tracing, metrics, a clock). The field stays REQUIRED, so an omission is
still a compile error; `{}` is a statement, not a silence.

The two write extensions' features are named for the MACHINERY they need, not
for the subject they concern: what a host either does or does not do is flush a
`Set-Cookie` and write response headers. Naming them `cookies`/`headers` would
have collided with the read entries in the one map both gates read.

`query` and `request-headers` appear in no host's set today, and that is not a
third category: OUR code satisfies them from the request the carrier already
holds, so nothing is asked of the host. When the two sides are unified they
belong in a host's set as well — a host that speaks HTTP does have a URL and
request headers — and the extension stops declaring the same name twice.

## The gates, and where each error lands

Every one names the thing that is wrong, and lands on the line that contains it.

| the mistake | where it lands | what it says |
|---|---|---|
| a carrier passed to `.extend` | the argument | `Rpc` is not assignable to `Extension` — structural, a category error |
| an extension whose transport feature the PROTOCOL lacks | the `.extend` argument | ⛔ this carrier has no `body` to speak of |
| `validate` on an entry the scope has not got | the name argument | the valid names, listed: `"wrong"` is not assignable to `"params" \| "query"` |
| `validate` on a scope with NO entries at all | the name argument | ⛔ this scope has nothing to validate — did you give it a carrier? |
| a word the carrier does not coin | the guard/leaf argument | ⛔ this scope does not declare the intent: `code` — is it the right carrier? |
| a host that cannot render what the scope produces | the mount argument | ⛔ this host cannot render the intent: `rr7-data` |
| a host that does not implement a capability | the mount argument | §34's capability gate, unchanged |

Two of these are the SAME question asked twice, and both are needed: what the
protocol admits is knowable where the scope is WRITTEN, what a given host
implements only where it is MOUNTED — §34's "narrowing a host's set is always
legitimate" still holds.

## The bridges into each framework's own knowledge

The route pattern and the `params` schema are two declarations, and nothing
kept them aligned: renaming `:postId` to `:wrongName` produced no error at any
mount and failed at runtime with a 422 (verified). The gate compares them — and
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

The gate reads the schema `validate('params', …)` fixed, and must find that
call among the scope's others — a scope validating both `query` and `params` is
ordinary, and the route pattern says nothing about the first. An unvalidated
`params` (the raw `Record<string, string>` every carrier populates) leaves the
gate with nothing to compare and therefore no opinion, which is the safe
direction.

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
   `g: (ctx) => E | Word<I>` makes TypeScript pick the first word candidate
   and REJECT the rest, so a guard returning two different intents stops
   compiling. Variance does not help — invariant, covariant and contravariant
   phantoms behave identically — and inferring the whole word union collapses
   to the constraint (§39's negative). Infer the whole RETURN type and
   distribute afterwards.
2. **The gate goes on the ARGUMENT, not in the return type.** The return-type
   form is cheaper (616 instantiations per scope against 780) and wrong: it
   only fires when the next call touches the poisoned type, so a BASE — extends
   and guards, no `.handle` — compiles clean and defers the mistake to
   whichever file finally calls `.handle`, pointing at a guard its author never
   wrote. The same applies to `validate`'s name gate: it is a conditional over
   the name, not an inference site, so the name still infers.
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
5. **Branding BOTH categories collapses.** Carrier `[BRAND]: true` plus extension
   `[BRAND]?: never` reduces `Scope & Http & Cookies` to `never` on the
   conflicting property — and carrier-plus-extension is the ordinary case. Brand
   one side only.
6. **The success side needs its own word.** `json(v, 201)` sharing the refusal
   side's `status` lets a host that declares it renders status refusals silently
   accept a success status it cannot express.
7. **A bare `Word` must fail closed**, and the consequence reaches every call
   site: annotating a guard `Promise<{ post } | Word>` ERASES the intent the
   word's type declared. Drop such annotations and let the return type infer —
   an alias to annotate with reintroduces the promise-to-keep-aligned this
   design removes.
8. **Defaulted type parameters used as let-bindings must live on a type ALIAS**,
   never on a method's own parameter list: there a caller can name them, and
   `guard<…, never>(bad)` then satisfies the gate AND empties the accumulated
   set. The same holds for `validate`'s lookup.
9. **A refinement cannot ride the ctx INTERSECTION.** `Ctx` is assembled as
   `CtxOf<Self> & AccOf<Self>`, and an intersection does not replace: refining
   `query` from `Record<string, string | string[]>` to `{ page: number }`
   yields `(string | string[]) & number`, which is `never` — no error, just a
   field nobody can use, diagnosed two files away. The body case survives by
   accident (`unknown & X` is `X`), which is what makes this easy to ship. The
   validated key must OVERRIDE (`Omit<CtxOf<Self>, keyof AccOf<Self>> &
   AccOf<Self>`), with a negative pinning it.
10. **A declaration read by VALUE cannot survive an ordinary `const`.** A step
    value written `{ run, closes: true }` and assigned to a variable WIDENS the
    property to `boolean`; an absent one also resolves to `boolean` through its
    constraint. By value the two are the same type, so a builder reading the
    value either refuses a real declaration or accepts every step. Read the KEY.
11. **A generic's CONSTRAINT is what a conditional sees when the other branch
    of a union parameter is taken.** With `S extends { run: unknown; closes?:
    boolean }`, a bare function left `S` unresolved, `keyof S` still contained
    `closes`, and an ordinary enriching step CLOSED the builder — the same
    fail-open a vacuous `extends` produces (§3), by a different road. A
    constraint must name only what every branch really has.
12. **A `this` parameter does not bind on a direct call.** It binds to the
    receiver of a METHOD call; `obj(x)` binds `this` to `void`. So a call
    signature cannot read state accumulated through `Self`, and every axis the
    call depends on is invisible to it. This is why the builder's state moved
    into a type PARAMETER — and intersecting a fresh concrete signature per step
    does not rescue it either, because two call signatures in an intersection
    become OVERLOADS and the stale one resolves first.
13. **An intersection accumulates a union only over KEYS.** `Self & { r?: A } &
    { r?: B }` is `A & B`, so a union-valued axis collapses — which is why
    `__intents` and `__caps` are maps of NAMES and why `R` could not be one of
    them. In a parameterised state it is simply `S['result'] | …`.
14. **`infer` through a GENERIC factory instantiates its type parameters to
    their constraints.** So a verb's signature COMPUTED from its factory reports
    `number` where the factory would have produced `201`, and a computed
    `validate` loses both the entry's name and the schema's output type. This is
    the trap that decided verbs are declared: removing the duplicate removes the
    generics with it, and the verbs that matter are all generic.
15. **A gate whose message is a template literal is SILENT on a call.** Made the
    method itself, the property resolves to a string literal and the call error
    prints its apparent type — `Type 'String' has no call signatures` — so the
    reason never reaches the reader. Naming the message as a PROPERTY, the way
    `DepGuard` does, puts it back: an object type is printed whole.
16. **A phantom that is INVARIANT blocks inference, not only assignment.** An
    invariant `__int` on the scope made `S` unresolvable from a verb's `this`,
    so every verb saw the widest possible scope instead of the one it was called
    on. The trap-4 family, one step further in: with the state in a type
    parameter no phantom is needed at all, and reading it directly is both
    cheaper and correct.
17. **A state member constrained to the WRONG shape fails silently upward.**
    `State['verbs']` was constrained to the runtime factory map while it held
    declared signatures, so a concrete state failed its own constraint and `S`
    fell back to the constraint EVERYWHERE it was inferred. No error names the
    constraint; the symptom is every read seeing the widest type.
18. **Reading and parsing an entry fail for opposite reasons.** The I/O
    (`req.arrayBuffer()`) rejects when the stream dies — a reset socket, an
    aborted upload — and that THROW is infrastructure, left to propagate.
    Parsing the bytes in hand is the client's mistake, and is a WORD the carrier
    coins (§41 — it was the core's `Invalid` branch when this was measured). A
    single `catch` over both told the client its payload was malformed when the
    connection had broken, hiding a 5xx behind a 4xx.

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
- **The builder's state in a type PARAMETER against phantoms read through
  `Self`**, on 24 scopes with a carrier, enriching steps, a guard that can stop
  with a word, and a leaf (`research/parameterised-builder`, three runs each,
  identical every time):

  | workload | `Self &` | parameterised | delta |
  |---|---|---|---|
  | 2 fold steps + leaf | 24,941 | 22,871 | **−2,070 (−8.3%)** |
  | 5 fold steps + leaf | 55,037 | 52,181 | **−2,856 (−5.2%)** |

  Types −15.8% and −16.9%. Solving the two rows gives ≈ **−54 per scope and −11
  per step**: cheaper in both directions, and the advantage does not decay.
  **The prediction was that it would cost MORE** — a state object rebuilt at
  every `.step` against a phantom intersected once. It is the intersection that
  is expensive: `Self` gains a member per verb and every later read walks all of
  them, while a parameterised read is one indexed access.
- **Where the builder's cost actually is**, on a 21-step chain with a carrier and
  words (24,349 instantiations), removing one piece at a time:

  | piece | share |
  |---|---|
  | `Ctx` = `Omit<args, keyof acc> & acc`, recomputed per step | **16%** |
  | `Surface` = `Scope<S> & S['verbs']`, per step | **15%** |
  | the word check in `ReturnGate` | 11% |
  | the `result` accumulation | 6% |
  | one whole member of `State` | **1.3%** |
  | `DepGuard` | ~0 — it rides the call, not each step |

  So the seven state members are ~9% together and two DERIVED types are 31%.
  The members are not the cost, which also means a new axis is affordable when
  one is needed. Neither derived type is reducible: `Ctx`'s `Omit` is what makes
  refinement expressible at all, and the obvious `Surface` shortcut — skip the
  intersection when `verbs` is empty — breaks the inference of `S` through
  `this`, so every verb sees `Scope<State>`.

- **DRYing `Grown`'s seven-line rebuild** with `With<S, P> = Omit<S, keyof P> & P`
  so it lists only the members it changes: 24,349 → **35,769 (+47%)**, types
  +28%. The repetition IS the optimisation, and this is the same intersection
  cost measured above from the other direction.

- **`result` and `intents` as two projections against one raw union.** Storing
  what the steps RETURN and projecting at the two readers: 24,349 → 24,057, a
  wash — the raw union GROWS where the extracted one did not, since a
  pass-through step used to contribute `never`. Kept for legibility, and for one
  thing that was not expected: the eager extraction is LOSSY, so a WRAP step
  replacing `value` was dropped from what the scope reports. The raw form keeps
  the material to narrow that.

- **The check for a step that returns nothing**: +9.1% as a gate of its own,
  **+7.1% merged into the word check** — the two ask about the same type, so
  `ReturnGate` holds both — sharing the `Awaited<Ret>` is worth 2%. What it
  buys: forgetting `return` in front of `next(…)` otherwise hands back the
  wrapper's `undefined`, discarding work the inner steps really did. It surfaces
  without the gate as `string | void` at whoever consumes the result, in another
  file, and not at all in a test that only checks the happy value.

### At runtime

Node, ns per run, warmed. Absolute values drift between processes, so only
comparisons within one run are meaningful.

  | | 5 steps | 20 steps | |
  |---|---|---|---|
  | continuation passing (shipped) | 749 | 4,670 | |
  | composed once, memoised on first call | 700 | 4,522 | −6.5% / −3.2% |
  | | | | |
  | ctx merged by spread (shipped) | 1,251 | 6,213 | |
  | ctx as a prototype chain | 3,193 | 12,336 | **+155%** |
  | steps synchronous, no `await` per level | 649 | 3,580 | −48% |
  | | | | |
  | continuation passing | 810 | 4,626 | |
  | generators + an interpreter | 2,210 | 10,637 | **+173%** |

  Three findings. **The whole fold is 1–6 µs**, against an HTTP request of
  hundreds of µs to milliseconds — under 1%, so pre-composing its closures buys
  3-6% of something that is not where the time goes. **A prototype-chain ctx is
  2.5x SLOWER**, not faster: the chain deepens per step and every read walks it,
  so principle 7 costs nothing here and earns something. **Generators are 2.7x**,
  with a simplified interpreter; a real effect runtime does more.

- **Effect systems do not discover parallelism either.** `Effect.all([a, b])` is
  the same authored claim `.parallel(a, b)` would be, and a program written in
  sequence stays sequential. What owning a scheduler buys is what happens on
  FAILURE: `Promise.all` rejects while the losing branch runs to completion, its
  errors unhandled and its resources unreleased; an interpreter interrupts it and
  runs its finalizers. The axis is the quality of the concurrency once asked
  for, never its discovery.

- **A verb's signature declared against computed**, on an identical workload
  that uses NO verb at all: 6,637 → 5,056 instantiations (**−23.8%**), types
  −19.8%. The computed machinery — a conditional plus four extraction types,
  resolved on every `Surface<S>` — was paid for by every scope, verbs or not.
  Reading the factory's return had cost +5.5% when it was added; dropping the
  whole mechanism gives back four times that.
- **The step primitive and the callable scope are otherwise UNMEASURED.** They replace
  three runtime concepts with one and remove an entry point, but the type layer
  gained a `Seed` parameter on `Handler` and the runtime gained a closure per
  step. Neither direction is obvious enough to guess.
- **`validate` is UNMEASURED.** It replaces four monomorphic methods with one
  generic over a map of ctx entries, so it moves work from each method's own
  signature into a lookup per call, and the direction is not obvious enough to
  guess. Measure both sides from a worktree at the pre-change commit before
  this line is replaced by a number.

## Left open

- ~~Whether a transport feature could be a CTX REQUIREMENT instead of a declared
  name.~~ **SETTLED: it is one.** The objection was that it would undo §34 — a
  request type with body accessors lets a guard reach past the declaration. It
  does not, because the ctx a step sees is the ctx it ANNOTATED: a guard that
  annotates nothing is contextually typed by what the scope holds, which is a
  headless request, and one that annotates more is refused at the argument by
  contravariance. Asking IS the declaration. The alphabet, the `__admits` gate
  and the cast in `body.ts` all go; only the MOUNT-side capability survives, for
  a question that is not a type.
- The type-efficiency pass (780 → 615 per scope) — its own issue.
- Gating a schema against its entry's raw type. Both directions were measured
  and neither ships (above). What could work is a check that reads the schema's
  OUTPUT rather than its input, or one that a schema opts into; both need a real
  case, and the 422 that stands in for it is not silent.
- Splitting `body` into two transport features, if a host ever appears that
  reads JSON but cannot parse multipart. The encoding is already an argument at
  the extension, so the split needs a second feature name and no new verb.
- WHEN a step's after-work runs. The fold gives it a place; scheduling is the
  host's (`await` on Node, `waitUntil` on a Worker), and nothing carries it there
  yet (#55).
- `#53` streaming: `response(…)` on the http carrier is the door it walks
  through; nothing is built for it.
- `#51` key collisions in a scope's ctx. The gate is still missing, and two
  extensions contributing the same ctx entry are silent. The returned-response
  decision REMOVES the one collision the design was creating for itself (reads
  and writes fighting over `ctx.cookies`) rather than closing it — the general
  case is untouched.

## Where this goes next

The formula is settled and the core is built on it. What remains is one issue
per slice, deliberately — the branch that produced this document also produced a
206-file pull request, and that is the shape to avoid from here.

### Built and green

`@lntt/scope`: `src/{index,scope,step,words}.ts`, and nothing else — no
extension ships, and the package has ZERO dependencies. `src/fixture/` holds
what does not ship. Every negative is
mutation-tested. `research/parameterised-builder` and `research/terminal-step`
carry the two measurements the builder's form was settled on.

### In order

| | |
|---|---|
| **#60** | port the carriers — `http`, `trpc`, `react-router`. `RequestHead` comes back with them, and it is what makes the body lock work. Blocks the rest |
| **#66** | a translating step: a leaf reports domain errors as VALUES, and something has to turn the ones a host must render into the carrier's words. Belongs with the carriers, and is the first real consumer of the shape §42 left behind |
| **#51** | two steps populating the same ctx key: the types say `never`, the runtime says last-writer-wins, and nothing errors. Moved UP from orthogonal — the gate lives in `.step`, beside the two already there, and the ctx goes from two entries to six once #62 lands. It is also the prerequisite for any parallel step, where last-writer-wins stops being deterministic |
| **#64** | validation per carrier: one factory, each carrier's own word. The core's `invalid` branch is gone with the carrier-free `.validate` (§41), so this is what gives a scope a way to refuse an input again |
| **#61** | the outbound side as a returned value: `response(v, init)`, with `json`/`html`/`text` as its sugar. Adds the envelope; the effects axis it replaces is already gone. ALSO closes the known limit above `ValueOf` — a WRAP step that replaces `value` is invisible to what the scope reports, and it only becomes expressible once the outbound side is a value a step RETURNS |
| **#62** | port the read extensions: `body`, `query`, `cookies`, `headers` — none of which needs the retired transport-feature alphabet |
| **#63** | decide which sugars come back — `guard`, `handle`, or neither. Both have already lost the reasons they were going to exist, so the failure mode is silence, not a wrong answer |
| **#67** | composable scopes: a guard written once against a DECLARED vocabulary and no carrier, mounted on any carrier that coins it. Sharing a prefix already works and costs nothing; what this adds is splicing a fragment built elsewhere, and the second type parameter that lets one demand words without choosing a carrier. #51 is a prerequisite — splicing intersects `acc` |
| **#58** | bring `@lntt/integration` back, with its route/intent/capability gates |
| **#59** | rewrite `examples/` — LAST, and the real proof: an API that cannot be written naturally in an example is not settled, whatever the type tests say |

Parked, and deliberately unscheduled — neither has a case in hand, which is the
discipline that removed `validate` from the core:

- a **`.parallel(a, b)`** verb. The shape is settled: children take no `next`, so
  wrapping is inexpressible; both read `Ctx<S>`, so cross-dependency is refused
  by contravariance. Two of the three safety conditions come free from the
  signature, and the third is #51. What is missing is a real pair of independent
  guards slow enough to be worth it.
- a **`@lntt/scope/effect`** dialect — an extension, never a core change, whose
  verb runs an `Effect` and maps its error channel onto a carrier's words. The
  interesting part is the bridge from `ctx.request.signal` to the runtime's
  interruption, which is where cancellation stops being cooperative. Measured
  cost of making the FOLD itself effectful: +173%, so this stays a dialect.

### The reference implementation

`origin/story-30/scope-impl` is the branch to read while doing all of the above.
It carries the previous core's carriers and extensions (35 files under
`packages/scope/src`), `@lntt/integration` complete (27 files, the route, intent
and capability gate tests among them), and `examples/` (191 files). Its API is
SUPERSEDED — do not copy it — but the things it paid for are there: the workerd
constraints, the origin in `toWebRequest`, the `Set-Cookie` that appends, and
the framework route-pattern readers that beat a hand-written parser.

The last state of the removed code on THIS branch is in the commits before the
removal, which is the other place to look.

### This document, at the end

It is three things at once today: the CONTRACT, the work order, and the
engineering record of what each decision cost. That is right while the work is
live and wrong once it is finished — the contract wants to become the published
API documentation, and the traps and measurements want to stay as the record
that explains why the API is shaped the way it is. Splitting the two is a job
for the end, tracked with #42.
