import type { Passed } from '../index.ts'

// A CARRIER, as a FIXTURE — this directory ships nothing. Not a real carrier,
// but the same shape, so the tests read like real code instead of building an
// ad hoc object inline.
//
// What a carrier IS: what a run BRINGS — `Params`, the call's second argument
// — and nothing else. No constructor, no brand, no predicate: the core
// contributes one TYPE, and types vanish at runtime.

// What a run of a scope on this carrier brings with it.
export interface Params {
  readonly token: string | null
  readonly params: Readonly<Record<string, string>>
}

// ── domain shapes a guard or a leaf can stop with ────────────────────────────
// Plain values, nothing coined — a guard "enrich, or stop with a value" (the
// value is the carrier's own domain shape, same as a bare wire leaf).

export interface Refusal {
  readonly kind: 'refused' | 'gone'
  readonly why: string
}

export const refused = (why: string): Refusal => ({ kind: 'refused', why })

export const gone = (what: string): Refusal => ({ kind: 'gone', why: what })

export interface Elsewhere {
  readonly kind: 'elsewhere'
  readonly location: string
}

export const elsewhere = (location: string): Elsewhere => ({ kind: 'elsewhere', location })

export interface Served<V> {
  readonly kind: 'served'
  readonly at: string
  readonly value: V
}

export const served = <V>(value: V, at: string): Served<V> => ({ kind: 'served', at, value })

// ── reaching what came back ──────────────────────────────────────────────────
// `next` hands back a `Passed`, which says nothing on purpose: when a step is
// written, the steps it will wrap do not exist yet. A step that DECORATES has
// to read it anyway, and the reading is the CARRIER's — it knows what its own
// steps can produce and the core does not. One assertion, written here, never
// at each step.
//
// It hands back a READ-ONLY view, and that is this carrier doing on the way out
// what `Ctx` does on the way in. The core cannot do it: where `next` is typed
// there is no type yet to make read-only. Here there is one.
//
// It does not COPY, and must not. Cloning what comes back loses a class's
// prototype, and THROWS on a response or a stream — and by the error convention
// a throw is infrastructure, so a defensive clone would turn a successful run
// into a retry. The view is a statement about who may write, not a wall: what
// is in there is often the APP's object, alive as long as the process, and a
// decorator writing through it edits the app's own state. Nothing at runtime
// stops that, here or anywhere, which is why it is said in a type.
export type Answered<V> = Readonly<V>

export const answered = <V>(passed: Passed): Answered<V> => passed as unknown as Answered<V>

// ── a carrier written WRONG, on purpose ──────────────────────────────────────
// `ArgsOf` has a fallback for a carrier that declares something unusable, and
// the branch was dead in the suite — nothing ever declared a non-object
// `__args`, so nothing checked that the fallback fails CLOSED rather than open.
//
// A carrier is a hand-written declaration, so this is not contrived: it is
// what a typo produces.

// `__args` that is not an object. `ArgsOf` falls back to `{}`, so a run brings
// nothing rather than bringing whatever the carrier meant.
export interface BadArgsCarrier {
  readonly __args?: string
}

export const badArgs = {} as BadArgsCarrier

export interface FixtureCarrier {
  readonly __args?: Params
}

// PURE DECLARATION — no runtime value at all. Chosen once, in `scope()`, and
// never a step.
export const fixture = {} as FixtureCarrier
