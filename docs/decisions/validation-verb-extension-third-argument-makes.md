---
title: "Validation is a VERB in an extension, and its third argument is what makes it carrier-free"
area: scope-runtime
status: accepted
---

# Validation is a VERB in an extension, and its third argument is what makes it carrier-free

**Decision.** `@lntt/scope/guard` ships three verbs over one machine, and the
four read extensions ship from the carrier subpaths as plain steps. #62 and #64
land together, because the second is what the first fails WITH.

```ts
guard(check, onError)               // ADDS an entry; its name is DEDUCED
refine(name, check, onError)        // REPLACES one; its name is WRITTEN
validate(name, schema, onError)     // refine, with the check given by a schema
```

**`onError` is the third answer to the question [validation belonging to the carrier](./validation-belongs-carrier-outcome-has-two.md) left open.** That entry removed
validation from the core because a carrier-free `validate` had nothing to fail
WITH — the core carried an `invalid` branch to give it somewhere to land — and
[a carrier being `__args` alone](./carrier-needs-no-vocabulary-at-all.md) removed the vocabulary, the other candidate. Neither is needed once the
CALLER supplies the failure: the verb hands back what `onError` built, and from
there it is an ordinary value. The core needs no branch and no word.

It cannot be optional. The only carrier-free default is to THROW, and under
[the returned/thrown convention](./errors-returned-domain-thrown-infrastructure.md) a throw means infrastructure — while a malformed input is a domain outcome that
commits and acks. A default would ship a lie about the kind of the error, on the
pivot the whole library turns on. The repetition it costs is answered by
composition, one `const invalid = …` per app, which is already this package's
posture for `body('json')`.

`onError`'s return joins `returns`, so **`AnswerGate` ([the mount as a gate too](./mount-gate-too-checked-verb-has.md)) checks it at the
mount with no machinery of this extension's own**: an `onError` building
something the host will never send is refused at the call site.

**The name is deduced where that is safe, and written where it is not.** Adding
is fully deducible from what the check returned. Replacing is not — a check
returning `{ body: … }` where `body` exists cannot be told from one that reused a
name by accident, and the core's own step gate already says why: "the difference between a
refinement and a collision is INTENT, which no type can read". Deducing
everywhere would also give one mistake two verdicts: `.step(x).step(x)` is
refused, so a silently-replacing `guard` would be the same composition error
allowed under a different verb.

**A check says it failed with `fail(issues?)`, and a THROW is never caught.**
The sentinel is a symbol key private to the module. It is not the vocabulary [a carrier being `__args` alone](./carrier-needs-no-vocabulary-at-all.md) retired,
returning: that was an OPEN ALPHABET coined per carrier and checked twice, this
is ONE value owned by one extension. And what [`.step` as the whole fold surface](./neither-sugar-comes-back-step-whole.md) could not separate was an
enrichment from a HOST RESPONSE — two arbitrary values — where here the response
never passes through the check at all, since `onError` builds it. Catching a
throw would invert [the returned/thrown convention](./errors-returned-domain-thrown-infrastructure.md) inside one verb and would swallow the real errors too:
precisely the bug #62 records, a malformed payload reported when the connection
had broken.

**This annotates [`.step` as the whole fold surface](./neither-sugar-comes-back-step-whole.md).** That entry refused `guard` as a SUGAR with ONE return,
which genuinely cannot tell an enrichment from a stop without a brand, and that
part stands. A verb with TWO FUNCTIONS dissolves the problem instead of working
around it — success and failure arrive from different places in the signature —
and its own condition for reopening was "a real case in hand". Validation is
that case.

**Where it lives.** Not the core: principle 6 forbids grafting verbs there, the
inference cost is paid by every scope that never calls them (`CtxGate` alone,
reading two `keyof`s, measured +9.9% instantiations), and [`.step` as the whole fold surface](./neither-sugar-comes-back-step-whole.md) refused two sugars
there on the same day. Not per carrier: nothing inside is host-specific, since
the only part that knew about a host now lives in the caller. So a carrier-free
extension on its own subpath, added with `.extend()`.

ONE extension rather than two, with the **Standard Schema interface INLINED**.
A type import of a package the consumer has not installed fails in THEIR
program — declarations are read by their compiler, where a missing module is an
error we cannot catch here; the bug fixed in #86 by adding `@types/express` to
the peers. The spec is designed to be implemented
structurally and its version rides the property name (`~standard: { version: 1 }`),
so drift is visible. It showed up immediately: the first copy added a
`value?: undefined` to the failure branch and no real schema fitted any more. A
test against a real implementation beside a hand-written one is what caught it,
and is why both are kept.

**Note there is no dependency between extensions in any case.** `Extension`'s
own contract states that "a factory never receives the builder", so a verb
cannot call another verb. `validate` calls the refine MACHINE — a plain function
— never the `refine` VERB.

**Deferred, with a trigger.** Moving these into the core reopens if `.extend()`
proves to be real and repeated friction in #59, where the call sites are finally
read as a whole. What must be re-measured then is inference.
