# examples/ — what these are, and how they are judged

Usage references. Each is a real package, built on the shipped `@lntt/wire` and
`@lntt/scope`, meant to be READ and COPIED. They are the last check on the API:
a surface that cannot be written naturally in an example is not settled,
whatever the type tests say.

Not `research/`, which proves behaviour and is nobody's model.

## The question that decides everything here

**Does this represent a use case someone really has, on this host?** Not "is it
formally correct", not "is it production-grade" — whether the shape is one a
reader would recognise and copy into their own app.

That question has teeth. It is what refuses:

- a `<Form method="post">` whose action reads `body('json')` — a browser form
  sends url-encoded fields, so the pair cannot work and the example teaches a
  shape that fails on first contact;
- an action guarded by a custom header on a browser-facing host — a form cannot
  send one, so the guard is unreachable by the thing that submits to it;
- a route that answers a request nobody would make, or a step ordered a way no
  real handler would order it.

It is also what makes the SAME shortcut fine in one entry and wrong in another:
what a host's users really do is part of the question.

## What is explicitly NOT a defect

These are PoCs. Weakness in any of them is expected and must not be "fixed":

- **auth** — an actor read from a header or a cookie with no signature, no
  session store, no expiry, no CSRF. It stands for "the request carries an
  identity", and that is all it has to stand for;
- **persistence** — an in-memory `Map` as the repository;
- **production hardening** — concurrency and races, pagination and unbounded
  reads, retry and backoff, N+1 access, exhaustion limits, rate limiting,
  observability;
- **completeness** — no listing endpoint, no delete, no error page, no styling.

Simplifying is often what makes the point legible: an eager read is what makes
build-once observable at all, where a realistic lazy handle would demonstrate
less. Where a shortcut could genuinely mislead someone copying it, the answer is
a COMMENT stating the limit — never hardening the example.

## What IS a defect

- **A claim in prose that is not true.** Every sentence in a comment is part of
  the deliverable here. If it says a call does not compile, that has to be
  measured; if it says a value arrives typed, something has to assert it.
- **A shape that would not work.** See the question above.
- **A demonstration of a mechanism the reader cannot reuse** — a cast or an
  escape hatch presented as the normal path.
- **Divergence between entries with no reason.** The four per-host entries mount
  the same app on purpose: what they differ in should be exactly what the host
  makes different, and a comment should say which.

## Conventions

- **A comment describes the code, never the change that produced it.** No "used
  to", no "no longer", no naming what was removed or renamed. A reader arrives
  at the file as it is. Counterfactuals that still constrain them — "returning
  it renders normally where throwing reaches the ErrorBoundary" — stay.
- **No citations**: no decision numbers, no issue or PR numbers, in comments,
  test names or strings. State the constraint inline.
- Each entry is its own package with its own `package.json`, `tsconfig.json` and
  `vitest.config.ts`, and imports `@lntt/example-app` for the shared chain.
- English everywhere, as in the rest of the monorepo.
- The gates are the monorepo's: `pnpm -r test` and `pnpm -r typecheck`.
