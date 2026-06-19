# lunette

Typed dependency wiring as a chain of layers — Effect-grade composition
with plain functions: no monads, no decorators, no reflection.

> **Status: Request for Comments.** Pre-1.0, pre-publication. This
> repository is a *fully worked design* put out for critique before it
> ossifies into a published library. The engine runs and is covered by
> tests; the API is deliberately frozen enough to argue about and open
> enough to change. **Challenge it.**

## Why this exists

Dependency injection usually forces a choice: the type-driven composition,
lifecycle and visibility of something like Effect, *or* the directness of
plain functions and objects. lunette is the bet that you can have both —
the same guarantees with no monads, no decorators, no reflection. It is
the philosophy of errors-as-values applied to wiring.

The whole design is anchored on one real composition root (a React
Router 7 + Drizzle app wiring ~25 use cases by hand) and every piece was
shaped to dissolve that file.

## The design at a glance

- **The chain.** Dependencies compose through a builder:
  `lunette().use(...).provide(...).expose(...)`. Linear order *is* the
  topological sort — checked by the compiler, performed by you.
- **Visibility lives in the verb.** `use`/`provide` are private, `expose`
  is public. `run`/`build` deliver only the public surface — in the type
  *and* at runtime.
- **The error convention.** A *returned* error is domain (commit, ack, no
  retry); a *thrown* error is infrastructure (rollback, nack, retry). This
  single distinction is the pivot of transactions, retries and queues.
- **Leaves and windows.** Use cases are flat functions
  `(deps, ...args) => error | result`; a window (`With`) is a per-call
  validity scope (transaction, span, timeout), never shared.

## The RFC body

The substance of the proposal lives in the design record, not in this
README:

- **[`docs/decisions.md`](./docs/decisions.md)** — the heart of the RFC:
  25 numbered decisions, each with the alternatives considered and *why
  they were discarded*. The "why nots" are the point.
- **[`docs/`](./docs/)** — extended patterns (singletons & verticals,
  events & CQRS) and the docs index.
- **[`TODO.md`](./TODO.md)** — open work as stories, each carrying its
  full reasoning; the unresolved design questions are flagged there.

## How to weigh in

- **Open-ended thoughts, questions, "have you considered…"** →
  [Discussions](https://github.com/LunetteOrg/lunette/discussions).
- **Disagree with a specific decision?** Open a *Challenge a decision*
  issue and cite its number from `decisions.md`. **Read the decision
  first** — your objection may already have a recorded verdict.
- **Want a new API or a changed signature?** Open a *Propose an API
  change* issue with the real case in hand (the design follows YAGNI:
  new surface only with a concrete case).

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the process and the
non-negotiables.

## Packages

| package | what it is |
|---|---|
| [`@lntt/wire`](./packages/wire) | the core: the chain (`use`/`provide`/`expose`/`override`/`as`/`pipe`), two-sided composition (Seed), mounting with lexical scoping, leaves (`bind`), windows (`With`/`within`/`bindBy`), helpers (`layer`, `lazy`, `circular`). Test utilities at `@lntt/wire/testing` |
| [`@lntt/http`](./packages/http) | HTTP dialects: routes-as-data with swappable engines (`.`), plus the full native frameworks at `@lntt/http/hono` and `@lntt/http/express` |
| [`@lntt/cli`](./packages/cli) | command-line dialect — *planned* |
| [`@lntt/listener`](./packages/listener) | event consumers over external buses (Redis, SQS, ...) — *planned* |
| [`@lntt/flow`](./packages/flow) | flow orchestration on top of events — *planned* |

## Development

```sh
pnpm install
pnpm test        # every package: runtime + type tests
pnpm typecheck
```

## License

[MIT](./LICENSE) © Gabriele Consiglio
