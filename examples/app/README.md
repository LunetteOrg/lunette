# example-app — a real-shaped composition root (issue #1)

The lead adoption example. A faithful, anonymized replica of a real React Router
7 + Drizzle composition root (`createApp`, ~25 hand-wired use cases) **dissolved
into an `@lntt/wire` chain**, with its use cases **exposed as `@lntt/scope`
scopes** and wired into React Router 7 via `@lntt/integration`. It anonymizes
names and domain but **preserves form and cardinality** — same layer count, same
transactional window, same feature-flag/cookie/memoized-infra stressors — so it
stresses the design the way the real bootstrap would.

## What it proves

- A real-shaped composition root collapses into one readable chain
  (`app/bootstrap/chain.ts`).
- `build()` / `run()` deliver **only the public surface**; db, repos, services
  and the render leaves never reach a route — verified at runtime
  (`app/bootstrap/chain.test.ts`) and at compile time
  (`app/bootstrap/chain.test-d.ts`).
- The **transaction window** (`window(db.transaction, bridge)`) realizes the
  error convention against real Postgres (PGlite): a returned domain error
  **commits** (OTP `attempts++` persists), a thrown infra error **rolls back**
  (a half-created user vanishes).
- The **seed is the mock boundary**: scopes run against fakes, the real db is
  never created (`app/use-cases/render/render-cache.test.ts`).
- The chain's use cases are **exposed as `@lntt/scope` scopes** (`app/handlers.ts`):
  guards read the app's Pub surface, the leaf only shapes the response, and the
  scopes wire into React Router 7 via `@lntt/integration/react-router`
  (the `getLoadContext` + promise-memo recipe).

## The scope model (how `app/handlers/` is organized)

A **scope** is one route dissolved into pure pieces: an **input contract**
(`.input` for route params, `.body` for a JSON body, `.form` for a
multipart/urlencoded body), then a chain of **guards**, then a single **leaf**.
It is composed once and mounted per host (`w.handler(scope)` /
`pack.toLoader(scope)` / `toProcedure(...)`), or composed INLINE at the
`to*` call site when the app has a single host (see below).

### Guards vs leaves

Both are plain `(deps, ctx)` functions — the same shape. The difference is the
return, and a **suffix convention** names the role so a scope reads as
declarative wiring:

- A **guard** (`*Guard`) enriches the ctx (returns `{ … }`, merged into the bag
  the next step reads) or **aborts** (returns `unauthorized()` / `notFound()` /
  an `httpError`). It never writes the final response.
- A **leaf** (`*Handler`) is the terminal step: it returns the final response
  (or a `redirect` / abort).

| guards (`*Guard`) | leaves (`*Handler`) |
|---|---|
| `sessionGuard` — reads the session (nullable) | `feedHandler` — shapes `{ feed }` |
| `authGuard` — narrows it or 401 | `identityHandler` — the gated profile read |
| `pendingGuard` — the pending-cookie gate | `commentsHandler` — lists a post's comments |
| `feedGuard` — fetches the feed | `publishHandler` — the shared publish step |
| `postGuard` — prefetches a post or 404 | `commentHandler` — the shared comment step |
| `loginGuard` — validates + requests the code | `verifyHandler` — the windowed verify step |
| | `preferenceHandler` — the surface write |

The shared bases in `guards.ts` layer these: `gated()` = `sessionGuard` +
`authGuard`; `gatedWith(schema)` fixes a route param FIRST, then gates. An
anonymous read composes guards directly rather than through a base — the feed
(`scope().guard(feedGuard).handle(feedHandler)`, no session at all) and the
post (`sessionGuard` for a nullable session, then `postGuard`).

### Two testing levels

- **Pure functions, unit-tested in isolation** — the colocated
  `handlers/*.test.ts` call each guard/leaf directly with a typed `(deps, ctx)`:
  no carrier, no fold, no fake session to satisfy a gate. Every fetch, mapping
  and abort branch is proven here.
- **Thin composition, proven per host** — the per-host `surface.test.ts`
  (real chain, each request judged on its own) and `e2e.test.ts` (sign in →
  publish → read back, one journey) exercise the wiring. There is deliberately NO per-scope `runScope`
  layer, since the fold itself is proven once in `@lntt/scope` — the one
  exception is `verify`, whose fold interaction (a real transaction window) is
  scope-specific and kept in `auth.test.ts`.

### The write-seam: one step, two channels

A value-returning write is authored twice around a SHARED `*Handler` step:

- an HTTP scope on `.body` (`publishPostScope` → `publishHandler`), and
- a tRPC procedure whose whole input is the `.input` payload
  (`publishPostProcedure` → the same `publishHandler`), mounted as a mutation.

The auth guards (they read only headers) and the `*Handler` are shared; only
where the fields come from differs (`ctx.body` vs `ctx.params`). `login` /
`verify` / `logout` stay HTTP-only — cookies and redirects have no RPC meaning,
so they carry the `body`/`form` capability that compile-gates them off tRPC.

### Compose at the `to*` (single-host) vs the shared scope (multi-host)

The exported `*Scope` modules are a **multi-host portability device**: this
example mounts the same scopes on four hosts, so they live once in
`handlers/`. A REAL app has one host and can compose at the wiring instead — the
**single-host idiom**, shown here by the feed, whose
`scope().guard(feedGuard).handle(feedHandler)` is written INLINE in each host
entry (`examples/{hono,express,rr7,trpc}/src/*`) rather than imported. Both
authorings are the same fold over the same pure pieces; `feedScope` still
ships as the documented shared form.

## Anonymization map (form preserved)

| real (pelion/community) | replica |
|---|---|
| translation cache (lang fan-out, body/title) | **render** cache (surface fan-out, body/title) |
| auth / OTP | **access** |
| discussions (posts+comments) | **threads** |
| profile, translation provider, storage, email | profile, **renderer**, **blobs**, **mailer** |

4 areas · 6 repos · 1 disposable (db) · 3 feature-flagged services · 2 signed
cookies · ~19 bare leaves · 1 transaction window · the title-variant double-bind.

## Run

```sh
pnpm --filter @lntt/example-app test       # runtime + *.test-d.ts
pnpm --filter @lntt/example-app typecheck   # tsc --noEmit
```

PGlite runs in-process (`memory://`), so transactions are real and the suite
needs no external services.

## Type-checker time (the checker is a feature)

Full-package `tsc --noEmit --extendedDiagnostics`, real-size chain (12 keyed
layers + 4 scopes + ~19 leaves + window + brand + double-bind +
scope→scope Seed), Node 24 / TS 5.9:

| metric | value |
|---|---|
| Check time | **0.29s** |
| Total time | 0.56s |
| Instantiations | 134,614 |
| Files / LoC | 647 / 3,848 |

On par with the synthetic 20-step stress (~0.3s): the real shape does **not**
blow up the checker.

## Findings fed back to the design

- **`make*` disappears** — wire's bare leaf `(deps, …args)` (decision 13)
  removes pelion's curried `makeX(deps)(args)` factory ritual entirely.
- **The sugar dominates** — `provide`/`expose` cover every resource; the raw
  `use` onion is needed exactly **once**, for the disposable `db` (decision 26
  confirmed on a real bootstrap).
- **`layer()` is asymmetric** — it types the patch/onion form only; reusable
  *keyed* layers are hand-annotated `ValueLayer<Ctx,V>`. Whether a
  `valueLayer()` helper earns its place is left as an evidence-gated question
  (principle #5 / YAGNI).
- **Point-free registration works** — factories that destructure their ctx
  slice (`otpRepo = ({ db }) => …`) register as `.provide('otpRepo', otpRepo)`.
- **The error convention dissolves boilerplate** — pelion's manual
  `if (result instanceof InfrastructureError) throw result` inside the tx
  disappears: the leaf throws infra / returns domain, and `db.transaction`
  reacts on its own.
- **The mailer splits along the keyed/patch line** (a DELIBERATE deviation
  from the source's `mailer.send` service object, the only one): the
  transport is a keyed resource — the feature-flag conditional never runs
  when substituted — while the sending behaviour is a bound leaf
  (`bind({ sendMail })`), the seam where a retry window would attach. The
  split follows the three rates of change: the PORT in `lib/mailer/`,
  the ADAPTERS one per file (`http.ts`, `logging.ts`), the SELECTION
  POLICY at the composition root — swapping vendors touches `chain.ts`,
  never the port's module (decision 29). The taxonomy of the
  feature-modules pattern ("keyed for what costs, patch for wiring")
  proven on a real flagged service.
