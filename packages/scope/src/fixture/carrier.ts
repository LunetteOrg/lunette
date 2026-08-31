import { abort, ok, type Abort, type Ok } from '../abort.ts'

// A CARRIER, as a FIXTURE — this directory holds nothing that ships. Not a real
// carrier — `@lntt/scope/http` and
// `@lntt/scope/trpc` are those — but the same shape, so the examples read like
// real code instead of minting a word inline where it would be mistaken for
// something the core provides.
//
// What a carrier IS, in three parts, and the core owns none of them (§40):
//
//   what a run BRINGS       — `Params` below, the second argument of the call
//   the WORDS it coins      — `refused`, `gone`: values a guard or leaf returns
//   what it DECLARES        — the intents those words carry, read by the gate
//
// The core owns the BRAND (`ABORT`) and nothing else: what `refused` MEANS is
// this carrier's business, and the fold never reads it.

// What a run of a scope on this carrier brings with it.
export interface Params {
  readonly token: string | null
  readonly params: Readonly<Record<string, string>>
}

// ── the words ────────────────────────────────────────────────────────────────
// Each carries its own NAME in its return type. That is the whole mechanism:
// nothing is declared by hand — the declaration IS what a step returned, which
// is why it cannot drift from the code beside it. The brand comes from the
// core's `abort`/`ok`; what the intent MEANS is this carrier's business, and
// the fold never reads it.

// The caller may not have this. Two words, ONE intent name: what a host has to
// know how to render is "a refusal", and `refused`/`gone` differ in the reason
// they carry, not in what rendering them takes.
export const refused = (why: string): Abort<{ readonly refusal: true }> =>
  abort({ kind: 'refused', why })

export const gone = (what: string): Abort<{ readonly refusal: true }> =>
  abort({ kind: 'gone', what })

// A word with NO equivalent elsewhere — the reason a vocabulary belongs to a
// carrier rather than being shared. A host with nowhere to send the caller
// cannot render this one, and it must therefore be its OWN name: sharing
// `refusal`'s would let such a host silently accept it.
export const elsewhere = (location: string): Abort<{ readonly elsewhere: true }> =>
  abort({ kind: 'elsewhere', location })

// A word on the SUCCESS side: the fold carries on, the value is the domain's,
// and the intent rides beside it saying how to render it. Its name is its own
// and does not share the abort side's — a host may know how to render a refusal
// and have nowhere to put a success annotation, and the shared name would let
// it accept one silently (§40's trap 6, the reason `ok-status` is not
// `status`).
export const served = <V>(value: V, at: string): Ok<V, { readonly 'ok-served': true }> =>
  ok(value, { kind: 'served', at })

// ── the carrier's VOCABULARY ─────────────────────────────────────────────────
// The set the definition-side gate reads a returned word against. A word this
// carrier does not coin is a compile error where the step is WRITTEN, not where
// the scope is mounted.
export interface FixtureCarrier {
  readonly __args?: Params
  readonly __vocabulary?: {
    readonly refusal: true
    readonly elsewhere: true
    readonly 'ok-served': true
  }
}

// A carrier is PURE DECLARATION here — no runtime value at all, exactly like
// the shipped `trpc` and `react-router`. It is chosen once, in `scope()`, and
// is never a step.
export const fixture = {} as FixtureCarrier

// A SECOND carrier, coining a different vocabulary, so the definition-side gate
// has something to refuse. It admits the same runs and none of the same words.
export interface OtherCarrier {
  readonly __args?: Params
  readonly __vocabulary?: { readonly code: true }
}

export const other = {} as OtherCarrier

export const code = (n: number): Abort<{ readonly code: true }> => abort({ kind: 'code', n })
