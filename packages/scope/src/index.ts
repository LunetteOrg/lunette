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

// The builder, and what a scope IS once it holds steps.
export { scope } from './scope.ts'
export type { Scope, Surface, State, Carrier, Ctx, DepGuard } from './scope.ts'

// The primitive a carrier or an extension is written against.
export { outcomeOf, invalid, runSteps, readStep, OUTCOME } from './step.ts'
export type {
  Step,
  StepValue,
  AnyStep,
  AnyStepValue,
  Next,
  Outcome,
  Invalid,
  Issue,
  Verbs,
} from './step.ts'

// The two brands a carrier's words carry, and the readers the fold uses. What a
// word MEANS is the carrier's business; the core only ever checks the brand.
export { ABORT, OK, isAbort, isOk } from './abort.ts'
export type { Abort, Ok, UnknownIntent } from './abort.ts'
