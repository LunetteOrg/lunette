---
title: "Conditional providers are ternaries, not combinators"
area: verb-model
status: accepted
---

# Conditional providers are ternaries, not combinators

**Decision.** A feature-flagged resource is a plain conditional at its
keyed birth — `provide('transport', ({ env }) => env.MAILER_API_KEY ?
httpTransport(env.MAILER_API_KEY) : loggingTransport())` — and wire adds
no conditional vocabulary around it. PLACEMENT is part of the decision:
the conditional lives at the COMPOSITION ROOT, never inside the port's
module — adapters are one file each behind the port type, and the port
module knows no implementations (choosing implementations is the root's
job; the port/adapter split separates the three rates of change: port ≪
adapters ≪ policy). Growth path, still combinator-free: at the third
implementation the selection becomes DATA — a discriminated provider
union parsed in the env plus an exhaustive record
(`satisfies Record<Provider, (env: Env) => Transport>`): adding an
adapter is a file, a union member and a record line, and the checker
lists every touchpoint. When the choice is per-DEPLOYMENT rather than
per-flag, it leaves the code entirely: the chain requires the transport
and each entry point seeds its own ([two-sided composition](./two-sided-composition-seed.md)).

**Alternatives.** Hono-style combinators (`some`/`every`/`except` from
`hono/combine`) were considered. They are the right call THERE because
Hono middleware are opaque units composed by the engine: conditionality
must be the composer's vocabulary. A wire provider is a plain function
returning a value, so the language's own control flow works inside it —
with a decisive typing bonus the helper would lose: the ternary NARROWS
the flag (`env.MAILER_API_KEY` is `string` in the true branch, no `!`).
Any `when(pred, then, else)` either degrades to non-null assertions or
becomes a generic Option fold — FP vocabulary, not wire's. The one
transferable semantic, `some()` as try-the-real-fall-back-to-the-fake,
is an ANTI-pattern at resource birth: silent infrastructure degradation
(prod logging mails to the console because the provider was down at
boot). Resources fail loud at boot.

**Why.** The absence of combinators is not a gap — it is the design's
founding bet paying off: providers are plain functions precisely so that
plain JavaScript is the composition language (principle 7, [`.as(name)` as the only namespacing sugar](./name-only-namespacing-sugar.md)).
Open question, evidence-gated: boot OBSERVABILITY of flag choices
("booted with logging transport") — a diagnostics convention, not a
combinator; revisit with the real bootstrap.
