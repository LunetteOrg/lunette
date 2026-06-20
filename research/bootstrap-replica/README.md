# bootstrap-replica — the design's proving ground (TODO story 1)

Research validation, **not a product**. A faithful, anonymized replica of a
real React Router 7 + Drizzle composition root (`createApp`, ~25 hand-wired use
cases) **dissolved into an `@lntt/wire` chain**. It anonymizes names and domain
but **preserves form and cardinality** — same layer count, same transactional
window, same feature-flag/cookie/memoized-infra stressors — so it stresses the
design the way the real bootstrap would.

## What it proves

- A real-shaped composition root collapses into one readable chain
  (`app/bootstrap/chain.ts`).
- `build()` / `run()` deliver **only the public surface**; db, repos, services
  and the render leaves never reach a route — verified at runtime
  (`app/bootstrap/chain.test.ts`) and at compile time
  (`app/bootstrap/chain.test-d.ts`).
- The **transaction window** (`within(db.transaction, bridge)`) realizes the
  error convention against real Postgres (PGlite): a returned domain error
  **commits** (OTP `attempts++` persists), a thrown infra error **rolls back**
  (a half-created user vanishes).
- The **seed is the mock boundary**: fragments run against fakes, the real db is
  never created (`app/use-cases/render/render-cache.test.ts`).
- The chain integrates with **two hosts**: the RR7 `getLoadContext` + promise-memo
  recipe (`app/integrations/react-router.ts`) and a raw **Express** server that
  actually serves over HTTP (`app/integrations/express.ts`).

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
pnpm --filter @lntt/research-bootstrap-replica test       # runtime + *.test-d.ts
pnpm --filter @lntt/research-bootstrap-replica typecheck   # tsc --noEmit
```

PGlite runs in-process (`memory://`), so transactions are real and the suite
needs no external services.

## Type-checker time (the checker is a feature)

Full-package `tsc --noEmit --extendedDiagnostics`, real-size chain (12 keyed
layers + 4 fragments + ~19 leaves + window + brand + double-bind +
fragment→fragment Seed), Node 24 / TS 5.9:

| metric | value |
|---|---|
| Check time | **0.28s** |
| Total time | 0.54s |
| Instantiations | 129,883 |
| Files / LoC | 647 / 3,782 |

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
