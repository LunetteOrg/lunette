---
title: "Windows: per-call deps as a first-class shape"
area: leaves-errors-windows
status: accepted
---

# Windows: per-call deps as a first-class shape

**Decision.** `With<Deps> = <T>(use: (deps) => Promise<T>) => Promise<T>`
— a callback-delimited validity window (transaction, span, timeout,
tenant connection). `bind` accepts a window in place of fixed deps (one
unified name, two overloads — same first-argument dispatch as the keyed
verbs); `within(opener, bridge)` builds a window from its two parts;
`bindBy(toWindow, leaf)` derives the window from call arguments
(single-leaf by design: key derivation differs per leaf).

**Alternatives.** (a) Re-running a whole sub-chain per call
(`block.run({ db: tx }, scope)`): remains available for blocks with their
own layers/teardown, but for plain transactional use cases the window is
lighter. (b) A curried per-call runner on the chain (`wrap`): implemented,
compared side by side, removed — only cosmetically different from the
manual form. (c) A separate `bindWith` name: merged into `bind` as an
overload. (d) An effect-only `Around` type plus composers: deferred —
windows compose by nesting openers, and most "effect-only" windows turn
out to lend something useful (the span, the attempt number, the abort
signal). (e) Ambient transactions via AsyncLocalStorage: rejected —
implicit join is the behaviour you debug in postmortems.

**Semantics fixed by tests.** The window is per call, never shared
(three leaves bound to one window = one fresh window per invocation,
closed at the leaf's return). A window may run its callback 0 times
(breaker), 1 (normal) or N (retry). Atomicity = one *named* window: an
all-or-nothing group is one composed leaf; a sequence of bound leaves is
a saga. Windows narrower than the function (a lock around a critical
section) are **deps**, applied inside the leaf where the arguments
already are.

**Superseded:** the per-call runner `wrap` (implemented, compared side by
side, removed) and the separate `bindWith` name (merged into `bind` as an
overload).

**Updated by [the single-arity `bind`](./bind-single-arity-binder-unit.md).** The "one unified name, two overloads" packaging is
reversed now that the family has three forms: the per-call form lives on
the binder (`bind(record).with(window)`) and `within` is renamed
`window`. The semantics fixed by tests here are unchanged.

**Updated by [`.by` on the binder](./binder-derivation-key-not-leaf-argument.md).** `bindBy` is superseded by `.by` on the binder — and
the derivation key is no longer one of the leaf's arguments.
