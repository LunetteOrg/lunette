import { abort, ok, type Abort, type Ok } from '../words.ts'

// A CARRIER, as a FIXTURE — this directory ships nothing. Not a real carrier,
// but the same shape, so the tests read like real code instead of minting a
// word inline where it would be mistaken for something the core provides.
//
// What a carrier IS, in three parts, none of them the core's:
//
//   what a run BRINGS      — `Params`, the call's second argument
//   the WORDS it coins     — values a step returns
//   its VOCABULARY         — the intents those words carry, read by the gate

// What a run of a scope on this carrier brings with it.
export interface Params {
  readonly token: string | null
  readonly params: Readonly<Record<string, string>>
}

// ── the words ────────────────────────────────────────────────────────────────
// Each carries its own NAME in its return type. Nothing is declared by hand —
// the declaration IS what a step returned, so it cannot drift from the code
// beside it.

// Two words, ONE intent name: what a host must know how to render is "a
// refusal", and these differ in the reason they carry, not in what rendering
// them takes.
export const refused = (why: string): Abort<{ readonly refusal: true }> =>
  abort({ kind: 'refused', why })

export const gone = (what: string): Abort<{ readonly refusal: true }> =>
  abort({ kind: 'gone', what })

// A word with NO equivalent elsewhere — the reason a vocabulary belongs to a
// carrier rather than being shared. A host with nowhere to send the caller
// cannot render it, so it must be its OWN name: sharing `refusal`'s would let
// such a host accept it silently.
export const elsewhere = (location: string): Abort<{ readonly elsewhere: true }> =>
  abort({ kind: 'elsewhere', location })

// A word on the SUCCESS side. Its name is its own and does not share the abort
// side's: a host may render a refusal and have nowhere to put a success
// annotation, and a shared name would let it accept one silently.
export const served = <V>(value: V, at: string): Ok<V, { readonly 'ok-served': true }> =>
  ok(value, { kind: 'served', at })

// ── the carrier's VOCABULARY ─────────────────────────────────────────────────
// What the gate reads a returned word against. A word this carrier does not
// coin is an error where the step is WRITTEN, not where the scope is mounted.
export interface FixtureCarrier {
  readonly __args?: Params
  readonly __vocabulary?: {
    readonly refusal: true
    readonly elsewhere: true
    readonly 'ok-served': true
  }
}

// PURE DECLARATION — no runtime value at all. Chosen once, in `scope()`, and
// never a step.
export const fixture = {} as FixtureCarrier

// A SECOND carrier, coining a different vocabulary, so the gate has something
// to refuse. Same runs, none of the same words.
export interface OtherCarrier {
  readonly __args?: Params
  readonly __vocabulary?: { readonly code: true }
}

export const other = {} as OtherCarrier

export const code = (n: number): Abort<{ readonly code: true }> => abort({ kind: 'code', n })
