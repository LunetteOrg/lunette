// The host-agnostic scope runtime. ONE primitive — a STEP wrapping the rest of
// the fold — and a scope IS the function that runs it, from the first line.
//
// Read `step.ts` first: what a step says, and what the fold produces. `scope.ts`
// is the builder over it, and holds the fold itself. A carrier or an extension
// lives in its own subpath and is named nowhere here — the core owns the
// MECHANISM and never the alphabet.
//
// Three things are written against this package — a CARRIER, an EXTENSION and a
// host MOUNT — and the barrel carries what those three need and nothing else.
// What is missing is missing on purpose: the fold is private to `scope.ts`,
// because a host calls the scope and never the fold, and a type reachable
// inside another's signature needs no name of its own.

// The builder. `Carrier` is what a carrier declares itself against;
// `State`/`Surface`/`Ctx`/`Extension` are what an extension writes a verb with;
// `StateOf` and its readers are how a mount asks what a scope accumulated.
export { scope } from './scope.ts'
export type {
  Scope,
  Surface,
  State,
  Carrier,
  Ctx,
  Extension,
  StateOf,
  IntentsOf,
  ResultOf,
} from './scope.ts'

// What a step is written against.
export type { Step, AnyStep, Next, Outcome } from './step.ts'

// How a carrier COINS a word — the constructors, not the brands they carry. A
// carrier never touches the symbol; only the fold reads that.
export { abort, ok } from './words.ts'
export type { Abort, Ok } from './words.ts'
