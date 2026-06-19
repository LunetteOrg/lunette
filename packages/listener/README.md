# @lntt/listener

**Status: planned — design discussion pending.**

The event-consumer dialect for [`@lntt/wire`](../wire): a listening app
over an external bus, with swappable engines (Redis, BullMQ, SQS, ...):

```ts
lunette<{ env: Env }>()
  .use('db', withDb)
  .pipe(listener)
  .on('user.registered', sendWelcome)        // bare leaves (deps, event)
  .on('order.placed', updateReadModel)
  .listen(redisEngine({ url }), seed)
```

Each message runs in a per-call window, where wire's error convention maps
onto delivery semantics: a returned domain error → ack (dead-letter with a
reason), a thrown infrastructure error → nack (redelivery).
