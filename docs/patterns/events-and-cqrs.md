# Events and CQRS

No new core concepts: events fall onto the existing vocabulary.

| event concept | in wire's vocabulary |
|---|---|
| the bus (emitter, queue) | a DEP — infrastructure in the chain, private |
| emitting | calling a dep: `deps.events.emit(...)` — the leaf stays bare |
| an event handler | a BARE LEAF: `(deps, event) => error \| result` |
| subscribing | a LAYER: registers bound leaves on the bus, teardown unsubscribes |
| a consumer/worker | a vertical CHAIN processing messages in a per-call window |

## Subscription is a layer

The onion gives subscribe/unsubscribe lifecycle for free — subscriptions
live exactly as long as the app:

```ts
.use('subscriptions', async ({ events, db }, next) => {
  const handlers = bind(
    within(db.transaction, (tx) => makeRepos(tx)),
    { onUserRegistered, onOrderPlaced },
  )
  const offs = [
    events.on('user.registered', handlers.onUserRegistered),
    events.on('order.placed', handlers.onOrderPlaced),
  ]
  try {
    return await next({})
  } finally {
    for (const off of offs) off()   // dies at dispose, in order
  }
})
```

## The transactional outbox is a bridge

CQRS's most delicate problem — atomicity between the write and the event
(if the commit fails the event must not exist; if it exists it must be
durable) — lands on a piece that already exists: the **bridge** of a
transactional window. The emitter *writes into the same transaction*:

```ts
const outboxEmitter = (tx: DbHandle) => ({
  emit: (event: AppEvent) =>
    tx.query('INSERT INTO outbox (type, payload) VALUES ($1, $2)', [
      event.type,
      JSON.stringify(event),
    ]),
})

.expose('commands', ({ db }) =>
  bind(
    within(db.transaction, (tx) => ({
      db: tx,
      events: outboxEmitter(tx),   // emits BY WRITING into the tx
    })),
    { registerUser },
  ))
```

The leaf calls `events.emit(...)` knowing nothing about any of this.
Commit ⇒ the event is durable (a relay moves it to the bus); rollback ⇒
the event evaporates together with the writes.

## The consumer is another wire app, somewhere else

A listening app on an external bus (Redis, SQS, ...) is a separate chain —
command app and listener app are **two composition roots over the same
module graph**: they share the bare leaves, each mounts its own
infrastructure, the bus is the boundary. The planned `@lntt/listener`
dialect shape:

```ts
// worker.ts — separate process
lunette<{ env: Env }>()
  .use('db', withDb)
  .pipe(listener)
  .on('user.registered', sendWelcome)        // bare leaves (deps, event)
  .on('order.placed', updateReadModel)
  .listen(redisEngine({ url }), seed)        // or bullmqEngine, sqsEngine...
```

## Ack/nack falls out of the error convention

Every message runs in a per-call window, and the returned-vs-thrown
convention decides delivery:

- **returned** domain error (`new MalformedPayload()`) → it is a value:
  **ack**, no retry, optionally dead-letter with the reason;
- **thrown** infrastructure error (db down) → the window reacts:
  **nack**, redelivery.

The same pivot that drives commit/rollback and retry drives event
delivery — nobody had to program the policy.

## CQRS, assembled

- **Command side**: transactional leaves with outbox emission (above).
- **Query side**: read models updated by leaves listening in the worker.
- In-process vs distributed = swapping the bus dep implementation
  (an EventEmitter vs a queue) — same handlers, like swapping http
  engines.
- Sequences of decorated leaves are **sagas** (each step commits its
  own); compensations are leaves too. All-or-nothing groups must be one
  named leaf — atomicity never spans windows.
