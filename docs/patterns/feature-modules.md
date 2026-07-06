# Feature modules: a chain of exposes, not one returned object

A feature module is a fragment: a chain that *requires* its infrastructure
via its Seed and exposes bound leaves. This page fixes the canonical way
to write one — and names the two independent levers that get you there.

The executable specimens (with behavioural parity tests between the
shapes) live in [`research/module-shapes/`](../../research/module-shapes/).

## The shape

One chain step per wiring statement; the namespace via `.as()` at the
boundary; composition as step ORDER:

```ts
export const accessModule = lunette<AccessSeed>()
  // a PRIVATE named step: the transaction window, next to the publics
  .provide('verifyTx', (ctx) =>
    window(ctx.db.transaction.bind(ctx.db), toTxRepos(ctx)),
  )
  .expose((ctx) => bind({ requestCode })({ otpRepo: ctx.otpRepo, mailer: ctx.mailer }))
  .expose((ctx) => bind({ findUserByEmail, getUserById })({ userRepo: ctx.userRepo }))
  .expose((ctx) => bind({ verifyCode }).with(ctx.verifyTx))
  .as('access')
```

The host mounts it unchanged: `.expose(accessModule)` — only
`{ access: … }` crosses the boundary.

## Lever 1 — structure: steps instead of one object

The same module is often written as a single expose returning one bag:

```ts
lunette<Seed>().expose('access', (ctx) => ({
  ...bind({ requestCode })({ … }),
  ...bind({ verifyCode }).with(window(…)),   // window built inline
}))
```

Dissolving that object into steps does not shorten the code — it
*organizes* it, and three properties appear that the object form cannot
give:

1. **One grammar everywhere.** The module reads like the bootstrap: a
   chain of verb steps. The object form is a different sub-language (a
   JavaScript expression program) embedded inside the chain world.
2. **Composition is type-checked.** A read leaf that consumes a bound
   author leaf takes it from the ctx (`getAuthor: ctx.getAuthor`) — a
   key born in an earlier step. Move the read step above the authors
   step and the module DOES NOT COMPILE, with the error on the exact
   step. In the object form the ordering lived in local-const scoping;
   here it has the same guarantee the chain gives the bootstrap.
3. **Visibility is a per-step dial.** In the object form the returned bag
   is public wholesale. In steps, demoting a group is one verb:
   `expose` → `provide` (see `verifyTx` above — a private step among
   public ones). No restructuring.

This lever works with ANY leaf convention: even leaves with renamed,
narrowed deps (`getPost: ctx.postRepo.findById`) gain the structure —
each step keeps its explicit deps slice.

## Lever 2 — ctx-aligned leaves: the slices vanish

If the leaves name their deps AS the chain keys that provide them
(repositories narrowed with `Pick`), the binder applies point-free — the
binder IS a provider, so `expose` takes it directly and the ctx arrives
as the deps:

```ts
// the leaf declares: { postRepo: Pick<PostRepository, 'findById'>; getAuthor: … }
export const threadsModule = lunette<ThreadsSeed>()
  .expose(bind({ getAuthor, getAuthors }))
  .expose(bind({ publishPost, composeComment }))
  .expose(bind({ getPostForReading, listFeed, listCommentsForReading }))
  .as('threads')
```

Measured on the same module shape, this is the difference between ~40
lines of per-key slices and four statements (`research/module-shapes/`:
`code-oriented.ts` vs `fluent.ts`, behavioural parity proven by test).

Know what you are trading: the per-key slice documented, at the wiring
site, exactly which repo methods each leaf touches. That information does
not disappear — it moves into the leaf's signature (the `Pick`), which is
the single source. Use-case files still import nothing from wire: the
convention constrains *names*, not dependencies.

## Lever 3 — the vocabulary step: adapt the ctx to the leaves

Lever 2 renames the leaves to match the chain. The mirror lever renames
the CHAIN to match the leaves — and it is nothing new: *alias = a
provide*, applied systematically. One provide at the top of the module
translates the infrastructure into the leaves' function-shaped language;
every step below binds point-free, and **no leaf file is touched**:

```ts
export const threadsModule = lunette<ThreadsSeed>()
  // ── the vocabulary step: infra → the leaves' language, once
  .provide((ctx) => ({
    getPost: ctx.postRepo.findById,
    createPost: ctx.postRepo.create,
    getCommentCounts: ctx.commentRepo.countByPosts,
    listComments: ctx.commentRepo.listByPost,
  }))
  .expose(bind({ getAuthor, getAuthors }))
  .expose(bind({ publishPost, composeComment }))
  .expose(bind({ getPostForReading, listFeed, listCommentsForReading }))
  .as('threads')
```

This is the strongest form for a codebase whose leaves already declare
function-shaped deps (`getPost`, `createPost`): those signatures are the
loosest coupling a leaf can have (it depends on *functions*, not on repo
shapes), the renaming appears ONCE instead of repeated per slice, and the
table is the module's adapter boundary — ports and adapters, greppable in
one place. Bonus for tests: each projection is a top-level ctx key, so
`test(module)` can substitute a single function (`getPost: fake`) without
faking the whole repository.

Three rules keep it honest:

- **One vocabulary per module.** After the step, `postRepo` and `getPost`
  both live in the ctx. The convention: leaves speak the FUNCTION
  vocabulary; repo objects exist only to feed the table (a leaf that
  genuinely wants the whole repository — `listFeed` above — may still
  take it from the seed).
- **The table is per-module**, inside the fragment's own bag. A
  chain-level table serving every module becomes a god-layer and forces
  unrelated modules to share names.
- **Mind `this` when the source is a class instance.** Extracting a
  method detaches it: if `postRepo` is a class, the table needs
  `ctx.postRepo.findById.bind(ctx.postRepo)` — or, better, the class
  declares its methods as arrow fields (`findById = (id) => …`), which
  are extractable by construction. Closure factories (the replica's
  repos) are immune.

What the table cannot express: the DOUBLE-BIND — the same factory bound
twice with different deps (a body path and a title path). Two values
cannot share one ctx key, so that case stays an ADAPTER APPLICATION,
spelled inline with plain JavaScript:

```ts
.expose((ctx) =>
  bind({ renderUpfrontTitle: renderUpfront })({ ...ctx, format: 'text', sanitize: identity }),
)
```

No helper needed: the spread-with-overrides IS the adapter, one line,
typed against the binder's parameter (a missing key is named at this
exact expose).

For a codebase whose leaves already use renamed deps, the levers migrate
independently: adopt the step structure now (lever 1), then either add a
vocabulary step per module (lever 3, zero leaf edits) or align leaf deps
leaf-by-leaf when you touch them (lever 2).

## Testing interplay: keyed for what costs, patch for wiring

`test(chain)` substitution (the REPLACE) works on every top-level key,
patch form included — bound leaves and vocabulary projections are all
individually fakeable. What only the KEYED form adds is the SKIP: a
substituted keyed layer never executes. The two forms divide the work
along exactly that line:

- **Keyed** (`provide('mailer', …)`, `provide('verifyTx', …)`) names ONE
  value — and the things that deserve a single name are the things whose
  execution has effects: resources, windows, expensive derivations.
  Substituted in a test, they never run.
- **Patch** (the vocabulary step, `.expose(bind({ … }))`) births many
  keys at once — pure wiring, free to execute (method extractions and
  closures). The layer runs in tests, harmlessly, and its substituted
  keys are dropped at birth.

If a patch-form step ever grows something expensive, the fix is one
verb: give it a name (`.provide('searchIndex', (ctx) => buildIndex(ctx))`)
and it becomes skippable — or, if it is a real resource, that is the
signal it belongs to the Seed (the fragment requires it; the host owns
it).

## When the single object is still fine

A trivial module — two leaves, no composition, uniform visibility — loses
nothing in the object form, and `expose('profile', (ctx) => ({ … }))`
also spells the namespace without `.as()`. The steps earn their keep as
the module grows: a composition edge, a window, mixed visibility — each
is a reason to switch.
