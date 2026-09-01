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

// What a step is written against, and what it may hand back. `Word` is how a
// carrier DECLARES one of its words — a type and nothing else, since the core
// builds none and recognises none at runtime. `Passed` is what `next` gives
// back; read `step.ts` for why it says nothing, and who pays for that (§42).
//
// `UnknownIntent` is NOT here. It exists so that a `Word` written without its
// parameter fails CLOSED, and nothing else: no carrier writes it, and the gate
// reports the key rather than the name. It is exported the day a case needs it.
export type { Step, AnyStep, Next, Passed, Word } from './step.ts'
