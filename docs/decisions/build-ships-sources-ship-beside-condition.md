---
title: "The build ships, the sources ship beside it, and one condition reaches them"
area: publication
status: accepted
---

# The build ships, the sources ship beside it, and one condition reaches them

**Decision.** Each package builds to ESM JavaScript with declarations, and
`exports` resolves `types` to the built `.d.ts` and both `import` and `require`
to the built `.js` — per subpath, so `@lntt/scope` keeps its six and `@lntt/wire`
its two. The frameworks stay optional peers.

Both packages declare `sideEffects: false`, which is a promise the code keeps
rather than a hint: nothing in the emitted graph does work at import time — the
one global touch, a registered marker symbol, is idempotent and matters only to
the module holding it. A module that ever needed an effect merely by being
imported would be one a bundler is then allowed to drop, and the breakage would
show up in a consumer's production build alone. The granularity a consumer
actually gets is the SUBPATH: importing one host reaches none of the others,
which `exports` delivers on its own.

`verify:tarball` puts a FLOOR under that promise and not a proof: it reads every
shipped module — the build and the sources beside it — and refuses a top-level
statement that stands there for its effect, binding nothing. What it does not
read is the INSIDE of a declaration: `const x = install()` passes, and so does a
class whose static block runs anything. Deciding that would mean annotating
every legitimate call this package already makes at module scope — three of them
in the host mounts — for a hazard the floor catches in the shape it actually
arrives in.

A value `enum` and a value `namespace` are refused by that floor, and the
refusal is kept: each emits an invoked function expression, the one construct
that turns a declaration in the source into a statement in the build. Nothing
here uses one, and introducing one is a decision rather than an edit. The
ambient forms pass, `declare enum` included — they have no runtime to speak of.
This is not an erasability rule: the sources keep a parameter property in the
chain, which is why the source path is a bundler's and not a stripping loader's.

ONE format, and `require` names the same file the `import` condition names: the
runtimes this package declares load ESM from `require`, so a CJS consumer is
refused by nothing but a missing condition, and what a missing one produces is
`ERR_PACKAGE_PATH_NOT_EXPORTED` — an entry point that exists, reported as
absent. The constraint that keeps this true is ours: a top-level await anywhere
in the emitted graph makes `require` throw while `import` still passes, so
`verify:tarball` loads every subpath BOTH ways.

The sources ship too, through three mechanisms that only work together:
`files: ["dist", "src", …]` puts the commented `.ts` inside `node_modules`;
`declarationMap` + `sourceMap` make "go to definition" land on them rather than
on a declaration; and a declared condition, `"@lntt/source"`, resolves to them
for whoever asks. Nobody else meets it — `types`/`import` are what a consumer
gets by default. Suites and fixtures are excluded from the tarball: a test is
never the destination of a "go to definition".

This workspace declares that condition itself, in two places — `customConditions`
in `tsconfig.base.json` and `resolve.conditions` in `vitest.shared.ts` — so
every package here imports `@lntt/*` BY NAME and reaches the sources. An edit
answers without a build in between, and the condition published for others is
exercised daily rather than merely declared. `LNTT_SOURCE=off` and the
`tsconfig.verify.json` files drop it: the same suites and the same type contract,
resolved the way a consumer resolves them, into `dist`.

**Alternatives.** *Sources only*, with `exports` pointing at `.ts`. Measured
against a scratch consumer outside the workspace, on TypeScript 7 with
`module: nodenext` and nothing else: it does not compile. The sources import
each other with explicit `.ts` specifiers, so every one of them is a `TS5097`
in the consumer's program until they set `allowImportingTsExtensions`, and
under node16/nodenext that flag then demands one of `noEmit`,
`emitDeclarationOnly` or `rewriteRelativeImportExtensions` — three decisions
about their build, to install a library.

Set those, and it typechecks: the gates fire with their real messages and the
emit is theirs alone. Then it does not RUN. From a real installation Node
refuses outright — `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`, naming a file
inside our package — because stripping types under `node_modules` is something
it declines to do at any flag, and a `private constructor(private readonly …)`
in the chain is syntax no stripping loader can erase anyway. So the source path
is a BUNDLER's path, never a runtime's: a consumer on plain Node cannot use it,
and one who tried would learn that at first boot, from a path they do not own.
And the sources stand on ambient types (`Request`, `File`, `URLSearchParams`),
so a narrowed `lib` is one more thing their config has to get right for our code
rather than for theirs.

What building does NOT remove is the half of the contract that is about
CHECKING rather than compiling: `strictFunctionTypes` carries the ctx lock,
being contravariance, so turning it off removes the refusal from `dist` exactly
as from the sources. That prerequisite is stated in the README and belongs to
every consumer.

*`dist` only*, the shape hono and react-router ship. It costs the comments: in
this library they carry the constraints, and a reader who follows a type into a
`.d.ts` loses every one of them.

*A second build in CJS*, so `require` reaches a format of its own. It buys
nothing the one file does not already give on these runtimes, and it costs the
hazard: two builds of one module are two copies in one process, and this library
decides things by IDENTITY — a marker symbol, an `instanceof` — so the copies
disagree silently rather than loudly. One file behind both conditions has one
identity by construction.

**Why.** The shape of `exports` is the package's public surface as much as the
types are, and it is the one thing that cannot be corrected without a breaking
change. Building moves the risk to where it is testable: declaration emit must
not widen a conditional, because our gates ARE branded conditionals and a
relaxed one turns a compile error into a silence in someone else's editor. That
is what `pnpm verify` exists to catch — build, then the `*.test-d.ts` contract
recompiled against the built declarations, every suite re-run through `exports`
into `dist` — they reach `@lntt/*` by NAME, so the built JavaScript is what
executes — and the tarballs packed, unpacked, imported entry point by entry
point and compiled in a consumer's own program. That last step is a check, not
a listing: a `files` list that drifted, a declaration map dangling over a source
that did not ship, an ambient type the package leans on without declaring it —
all of them pack successfully, and would reach the registry unnoticed.

Prior art, read off the packages this repo installs: zod resolves `types`/`import`
to built files and carries both `src` in `files` and a `"@zod/source"` condition;
`@trpc/server` ships `files: ["dist", "src", …]`. None of them points a default
export at a `.ts`.
