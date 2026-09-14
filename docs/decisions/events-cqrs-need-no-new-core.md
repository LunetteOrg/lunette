---
title: "Events and CQRS need no new core concepts"
area: meta-contract
status: accepted
---

# Events and CQRS need no new core concepts

**Decision.** The bus is a dep; emitting is calling a dep; a handler is a
bare leaf `(deps, event)`; a subscription is a layer (the onion provides
unsubscribe); a consumer is a separate chain with a per-call window per
message; the transactional outbox is a bridge
(`window(db.transaction, (tx) => ({ db: tx, events: outboxEmitter(tx) }))`).
Delivery semantics fall out of [the returned/thrown convention](./errors-returned-domain-thrown-infrastructure.md) (ack/nack). A dedicated
`listener` dialect is planned for the engine-swap ergonomics, not for new
semantics.
