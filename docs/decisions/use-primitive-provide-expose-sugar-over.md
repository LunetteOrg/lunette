---
title: "`use` is the one primitive; `provide`/`expose` are sugar over it"
area: verb-model
status: accepted
---

# `use` is the one primitive; `provide`/`expose` are sugar over it

**Decision.** `use((ctx, next) => …)` is the single primitive. Its `next`
is two-armed: `next(priv)` contributes `priv` privately (to `Ctx` only);
`next(priv, pub)` additionally publishes `pub` (to `Ctx` **and** `Pub`).
The token widens to `Provided<All, Pub>` — `All` (= `priv & pub`) flows to
`Ctx`, `Pub` to the public surface, both by return-position inference
([patch types flow through `next`'s return](./patch-types-flow-through-next-return.md)). `provide(fn, destroy?)` and `expose(fn, destroy?)` are
**literally pre-built `use` layers**: they compute a value, contribute it
(privately / publicly), and — if `destroy` is given — wrap `next` in
`try/finally`. So a public resource with a lifecycle is one call,
acquire/release colocated:
`expose(() => createPool(env), (pool) => pool.end())`.

```
provide(fn)          = use((c, next) => next(fn(c)))
expose(fn)           = use((c, next) => next({}, fn(c)))
provide(fn, destroy) = use((c, next) => { const v = fn(c)
                         try { return next(v) }     finally { destroy(v) } })
expose(fn, destroy)  = use((c, next) => { const v = fn(c)
                         try { return next({}, v) } finally { destroy(v) } })
```

**Alternatives — measured by spike (the `*.test-d.ts` error quality is the
oracle, not opinion):**
- (a) **One verb with both a provider and a layer overload** (`use`
  accepts `(ctx)=>P` *or* `(ctx,next)=>…`): rejected. The two overloads
  compete for the *same* function argument, so on any wrong body
  TypeScript abandons contextual typing and `ctx`/`next` collapse to
  implicit `any` (a TS7006 cascade on top of "No overload matches"). The
  chosen design puts the variation in `next` (arg-count, non-callback
  args), not in `use` (function shape), so `use` keeps a single
  function-first overload and the parameters stay typed — the spike
  confirmed clean errors across patch + keyed + mount.
- (b) **A visibility flag** (`use(layer, { public: true })`): rejected. A
  value-dependent return type means a non-literal flag desyncs the type
  from the runtime — the types would lie (principle 1) — plus conditional
  inference on the hottest path.
- (c) **Boundary projection / terminal `expose(ctx => ({ … }))`**:
  rejected. It is the NestJS `exports` model — reopens [visibility living in the verb](./visibility-lives-verb-module-was-removed.md)
  (scattered contract, visibility as an afterthought).
- (d) **Key promotion `expose('db')`** (Guice's `PrivateModule.expose`):
  viable and clean, but **dropped**. The `destroy` sugar fills the matrix
  hole in one call, so promotion earned no real case (YAGNI). Reconsider
  only if "publish an already-private key later" ever has one.

**Why.** It realizes the truest model — one primitive, everything else
sugar — while keeping visibility in the verb for the common case
(`provide` private, `expose` public) and offering per-key visibility from
a raw layer (`next(priv, pub)`) as the max-control escape (breaker, retry,
wrap). The split is rarely needed in practice (truly-internal state is a
closure variable), so its real payoff is the conceptual unity. Closest
prior art: Effect's `Layer.scoped` + `acquireRelease` and `provide` vs
`provideMerge` — minus the Tag ceremony ([symbol keys supported, strings recommended](./symbol-keys-supported-strings-recommended.md)).

**Consequences.**
- `Provided` becomes two-axis (`Provided<All, Pub>`). The request-time
  Response channel reserved by [the opaque token `next` returns](./next-returns-opaque-token-mandatory.md) moves from slot 2 to slot 3
  (`Provided<All, Pub, R>`) *if/when* the request-time axis lands
  (TODO story 2) — and that Response is itself speculative (the HTTP
  dialect owns the per-request onion; request scope is planned as a
  window, not as a core-onion return).
- "No lifecycle API: it is just try/finally" softens to: the `destroy`
  argument is the acquire/release **sugar** over that try/finally; the raw
  `use` onion stays the full-control mechanism. It is sugar, not a new
  mechanism.
