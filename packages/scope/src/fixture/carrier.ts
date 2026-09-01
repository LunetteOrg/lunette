import type { Word } from '../words.ts'

// A CARRIER, as a FIXTURE — this directory ships nothing. Not a real carrier,
// but the same shape, so the tests read like real code instead of minting a
// word inline where it would be mistaken for something the core provides.
//
// What a carrier IS, in three parts, none of them the core's:
//
//   what a run BRINGS      — `Params`, the call's second argument
//   the WORDS it coins     — types of its own, and the values that build them
//   its VOCABULARY         — the intents those words carry, read by the gate
//
// Note what is NOT imported: no constructor, no brand, no predicate. The core
// contributes one TYPE, and types vanish — so at runtime a word here is a plain
// object this file wrote (§42).

// What a run of a scope on this carrier brings with it.
export interface Params {
  readonly token: string | null
  readonly params: Readonly<Record<string, string>>
}

// ── the words ────────────────────────────────────────────────────────────────
// Each carries its own NAME in its type. Nothing is declared by hand — the
// declaration IS what a step returned, so it cannot drift from the code beside
// it.

// Two words, ONE intent name: what a host must know how to render is "a
// refusal", and these differ in the reason they carry, not in what rendering
// them takes. The shared name is why they share a type here.
export interface Refusal extends Word<{ readonly refusal: true }> {
  readonly kind: 'refused' | 'gone'
  readonly intent: unknown
}

export const refused = (why: string): Refusal => ({ kind: 'refused', intent: { why } })

export const gone = (what: string): Refusal => ({ kind: 'gone', intent: { what } })

// A word with NO equivalent elsewhere — the reason a vocabulary belongs to a
// carrier rather than being shared. A host with nowhere to send the caller
// cannot render it, so it must be its OWN name: sharing `refusal`'s would let
// such a host accept it silently.
export interface Elsewhere extends Word<{ readonly elsewhere: true }> {
  readonly kind: 'elsewhere'
  readonly intent: unknown
  readonly location: string
}

export const elsewhere = (location: string): Elsewhere => ({
  kind: 'elsewhere',
  intent: { location },
  location,
})

// A word on the SUCCESS side. Its name is its own and does not share the abort
// side's: a host may render a refusal and have nowhere to put a success
// annotation, and a shared name would let it accept one silently.
//
// It carries the domain value, because with one channel there is nowhere else
// to put it — which is the price of the collapse, paid here in the open.
export interface Served<V> extends Word<{ readonly 'ok-served': true }> {
  readonly kind: 'served'
  readonly intent: unknown
  readonly value: V
}

export const served = <V>(value: V, at: string): Served<V> => ({
  kind: 'served',
  intent: { at },
  value,
})

// The carrier's own predicate. The core ships none — it knows nothing about
// what a word looks like here — so telling a word from a domain value is the
// carrier's job, and one line.
export const isWord = (x: unknown): x is Refusal | Elsewhere | Served<unknown> =>
  typeof x === 'object' && x !== null && 'intent' in x && 'kind' in x

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

export interface Code extends Word<{ readonly code: true }> {
  readonly kind: 'code'
  readonly intent: unknown
  readonly n: number
}

export const code = (n: number): Code => ({ kind: 'code', intent: { n }, n })
