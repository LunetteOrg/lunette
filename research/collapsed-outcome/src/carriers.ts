// ONE carrier, written three times — once per kernel, with the same three words
// and the same vocabulary. Reading them side by side is half the finding: what
// the carrier AUTHOR has to write differs, and it differs before any caller is
// involved.

import * as TwoBranch from './kernel-two-branch.ts'
import * as CollapsedA from './kernel-collapsed-a.ts'
import * as CollapsedB from './kernel-collapsed-b.ts'
import type * as Transparent from './kernel-transparent.ts'

// The three words, chosen so the question bites:
//
//   served    a SUCCESS that also has something to say        (value + intent)
//   refused   a refusal with NOTHING to hand back             (intent only)
//   notFound  a refusal that CARRIES A BODY — and the body is
//             the same type as the success value              (value + intent)
//
// The third is the whole experiment. `notFound('gone')` and a leaf returning
// `'u1:hello'` are both a string reaching the host; whether the scope's type can
// still tell them apart is what separates kernel 2 from kernel 3.

export interface Vocabulary {
  readonly 'ok-served': true
  readonly refusal: true
}

// ── kernel 1: today ──────────────────────────────────────────────────────────
// The body of a 404 has nowhere to be a VALUE, so it rides inside the intent.
export const twoBranch = {} as { readonly __args?: Args; readonly __vocabulary?: Vocabulary }

export interface Args {
  readonly token: string | null
}

export const tbServed = <V>(v: V): TwoBranch.Ok<V, { readonly 'ok-served': true }> =>
  TwoBranch.ok(v, { kind: 'served' })

export const tbRefused = (why: string): TwoBranch.Abort<{ readonly refusal: true }> =>
  TwoBranch.abort({ kind: 'refused', why })

export const tbNotFound = (body: string): TwoBranch.Abort<{ readonly refusal: true }> =>
  TwoBranch.abort({ kind: 'not-found', body })

// ── kernel 2: collapsed, R carries the payload ───────────────────────────────
// The body is a VALUE now, which is the point of the collapse — a 404 with a
// body and a 200 with a body are the same thing on the wire.
export const collapsedA = {} as { readonly __args?: Args; readonly __vocabulary?: Vocabulary }

export const caServed = <V>(v: V): CollapsedA.Word<V, { readonly 'ok-served': true }> =>
  CollapsedA.word({ kind: 'served' }, v)

export const caRefused = (why: string): CollapsedA.Word<undefined, { readonly refusal: true }> =>
  CollapsedA.word({ kind: 'refused', why })

export const caNotFound = (body: string): CollapsedA.Word<string, { readonly refusal: true }> =>
  CollapsedA.word({ kind: 'not-found' }, body)

// ── kernel 3: collapsed, R carries the word ──────────────────────────────────
// Written IDENTICALLY to kernel 2 — the carrier author cannot tell the two
// apart. Everything that differs is downstream, in what `R` becomes.
export const collapsedB = {} as { readonly __args?: Args; readonly __vocabulary?: Vocabulary }

export const cbServed = <V>(v: V): CollapsedB.Word<V, { readonly 'ok-served': true }> =>
  CollapsedB.word({ kind: 'served' }, v)

export const cbRefused = (why: string): CollapsedB.Word<undefined, { readonly refusal: true }> =>
  CollapsedB.word({ kind: 'refused', why })

export const cbNotFound = (body: string): CollapsedB.Word<string, { readonly refusal: true }> =>
  CollapsedB.word({ kind: 'not-found' }, body)

// ── kernel 4: transparent ────────────────────────────────────────────────────
// There is no core word to build, so the carrier's words are ITS OWN TYPES. All
// the core asks is that they carry an `intent` and declare its name — which is
// what `Coined` says, and nothing more. No brand, no constructor, no import of
// a core value at all: `Transparent.Coined` is a type, and types vanish.
export interface TrRefusal extends Transparent.Coined<{ readonly refusal: true }> {
  readonly kind: 'refusal'
  readonly intent: unknown
  readonly body?: string
}

export const trRefused = (why: string): TrRefusal => ({ kind: 'refusal', intent: { why } })

export const trNotFound = (body: string): TrRefusal => ({
  kind: 'refusal',
  intent: { status: 404 },
  body,
})

// The carrier's own predicate — the core ships none, because it knows nothing
// about what a refusal looks like here.
export const isTrRefusal = (x: unknown): x is TrRefusal =>
  typeof x === 'object' && x !== null && 'kind' in x && x.kind === 'refusal'

// Three words coined, so the SUPPLY side admits all three and the DEMAND side
// (a host) is free to render fewer.
export const transparent = {} as {
  readonly __args?: Args
  readonly __vocabulary?: Vocabulary & { readonly elsewhere: true }
}

// A THIRD word for the transparent carrier, so a host can render two of three
// and the mount gate has something to refuse.
export interface TrElsewhere extends Transparent.Coined<{ readonly elsewhere: true }> {
  readonly kind: 'elsewhere'
  readonly intent: unknown
}

export const trElsewhere = (to: string): TrElsewhere => ({
  kind: 'elsewhere',
  intent: { to },
})
