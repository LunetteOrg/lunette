---
title: "`lease` names the lending contract"
area: leaves-errors-leases
status: accepted
---

# `lease` names the lending contract

**Decision.** The callback-delimited grant of deps is a **lease** — one
word for the concept and for the API. The type is `Lease<Deps>`, the
builder is `lease(opener, bridge)`, and `.by(toLease)` derives one per
key. The property that consumes a lease keeps its name: `.with` follows
the `with-` convention that Haskell's `withFile` and Python's `with`
statement already gave to functions that lend through a callback, and the
lexicon in the repository guide, the package READMEs and this record use
the same noun the code does.

The word is chosen for what it claims about the grant. A lease is
**bounded, and the lender takes it back whatever happens** — the borrower
has nothing to give back. That is the guarantee of `(use) => open((raw) =>
use(toDeps(raw)))` exactly: `use` holds the deps for the length of its own
call, and no release is left on the callee's side to forget.

**Alternatives.**

- (a) `window`, the metaphor of the interval. It shadows a global that
  exists in every browser and in every file a bundler treats as browser
  code, and it shadows it **silently**: the import is legal, an editor
  offers it when the author types `window`, and the mistake surfaces later
  and elsewhere. That composition roots are server code does not settle it
  — a React Router route module is bundled for both sides, and its
  `loader` shares a file with its component.
- (b) `scope` / `scoped`, the word the surrounding art uses for this idea:
  Effect's `Scope` is the lifetime of one or more resources, and
  `transient` / `scoped` / `singleton` is the shared vocabulary of the DI
  containers. It is already spent — `@lntt/scope` names a different
  mechanism, a fold of steps over one run — and one library cannot hold
  two meanings for `scope` without charging the reader for both.
- (c) `borrow`. The pooling APIs that use the word (`borrowObject`,
  `borrow()`) put the RETURN on the consumer, which is the opposite of
  what is guaranteed here.
- (d) `bracket` / `acquireRelease`, from Haskell and cats-effect. They
  name the two ends, and the two ends are not the arguments: the opener
  arrives already callback-shaped (`db.transaction` is), so a name built
  on acquire-and-release would advertise a signature this function does
  not have.
- (e) `using`, which collides with the language's own `using` and
  `await using` declarations.
- (f) `loan`. The grammar works — one word serving as verb and noun — but
  it suggests a transfer of possession, and nothing moves.
- (g) Keeping `window` and answering the shadowing with a note telling the
  reader to import it renamed. The cheapest option, and the one that
  leaves every reader to meet the same surprise and re-open the question.

**Why.** [Leaves and leases](./leases-per-call-deps-first-class.md) is a
load-bearing principle, so the noun that carries it is read far more often
than it is typed — in the lexicon, in the READMEs, in the type contract's
own error messages. A name that is safe to type but hazardous to import
fails at the wrong end of that ratio. `lease` is the one candidate whose
documented meaning is the guarantee already implemented, and whose single
spelling serves both the concept and the function that builds one, so
`grep` over the repository answers with one thing.

Nothing is published, so the change costs no consumer a major. After
publication the same rename is a breaking one, which is why it is made
here rather than deferred.

**Consequences.**

- The exported type is `Lease<Deps>` and the exported builder is `lease`.
  `@lntt/wire`'s surface is verbs again, with no noun among them.
- The record's area label for this material is `leaves-errors-leases`, and
  [per-call deps as a first-class shape](./leases-per-call-deps-first-class.md)
  carries the semantics under the new noun: per call, never shared; `use`
  run 0, 1 or N times; atomicity as one named lease.
- Retry reads more truthfully than it did: N attempts are N separate
  grants, not one grant held open across them.
