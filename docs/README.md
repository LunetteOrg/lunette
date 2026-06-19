# docs

Extended, code-complete companions to the package READMEs. The READMEs
state the rules; these documents show them at full length.

## Design decisions

- [decisions.md](./decisions.md) — the record of every significant
  decision, the alternatives considered, and why they were discarded.
  Read this before proposing an API change: your idea may already have a
  verdict.

## Patterns

- [Singletons and vertical chains](./patterns/singletons-and-verticals.md) —
  who owns shared infrastructure when an app splits into feature blocks,
  in one process or across many.
- [Events and CQRS](./patterns/events-and-cqrs.md) — the bus as a dep,
  handlers as leaves, subscriptions as layers, the transactional outbox
  as a bridge, ack/nack from the error convention.

Planned (see [TODO.md](../TODO.md)): a windows deep-dive (0/1/N
semantics, retry/breaker composition), the testing cookbook, a migration
guide from a hand-written composition root.
