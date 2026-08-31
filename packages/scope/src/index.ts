// The host-agnostic scope runtime. ONE primitive — a STEP wrapping the rest of
// the fold — and a scope IS the function that runs it, from the first line.
//
// Read `step.ts` first: it carries the formula, and four things is the whole of
// what a step says. `scope.ts` is the builder over it, with `.step()` as the
// only verb. Everything a carrier or an extension adds lives in its own
// subpath and is named nowhere here — the core owns the MECHANISM and never the
// alphabet.
//
// Being rebuilt (#30): the carriers, the extensions and the host mounts land on
// this next, in that order. `docs/design/scope-api.md` is the contract.

// WHAT IS EXPORTED, AND WHAT IS NOT. There are exactly three things written
// against this package — a CARRIER, an EXTENSION, and a host MOUNT — and the
// barrel carries what those three need and nothing else. A type that appears
// only inside another type's signature is reachable through it and needs no
// name here; exporting it anyway is terminology the reader has to carry with no
// call site to attach it to.
//
// So `runSteps` is absent (a scope IS the function that runs it, and the fold
// would be a second entry point to the same thing), and so are the gates and
// the shapes the builder uses on itself: `Grown`, `DepGuard`, `VerbGate`,
// `Verbs`, `isAbort`/`isOk`, `outcomeOf`. Each is used at exactly one place
// inside the core, and none of the three authors above ever writes one.

// The builder, and what a scope IS once it holds steps.
export { scope } from './scope.ts'
// `Carrier` is what a carrier declares itself against; `State`/`Surface`/`Ctx`
// are what an extension writes a verb's signature with; `StateOf` and its two
// readers are how a MOUNT asks what a scope accumulated without going through
// the builder.
export type {
  Scope,
  Surface,
  State,
  Carrier,
  Ctx,
  StateOf,
  IntentsOf,
  ResultOf,
} from './scope.ts'

// The primitive a carrier or an extension is written against. `invalid` is the
// one outcome an extension builds by hand — the core's own branch, which a
// schema extension returns.
export { invalid } from './step.ts'
export type { Step, AnyStep, Extension, Next, Outcome, Invalid, Issue } from './step.ts'

// The two brands a carrier's words carry. What a word MEANS is the carrier's
// business; the core only ever checks the brand. The READERS are not here: the
// fold normalises on the way out, so a mount receives an outcome and never a
// raw word.
export { ABORT, OK } from './abort.ts'
export type { Abort, Ok } from './abort.ts'
