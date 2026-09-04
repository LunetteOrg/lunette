// `@lntt/scope/guard` — the three verbs that compute a ctx entry, or stop.
//
// ONE MACHINE, three names. At runtime all three are the same thing: run a
// check, and on failure hand back what `onError` produced instead of calling
// the rest of the fold. The whole difference is type-level.
//
//   guard(check, onError)              ADDS an entry; its name is DEDUCED from
//                                      what the check returned
//   refine(name, check, onError)       REPLACES an entry; its name is WRITTEN
//   validate(name, schema, onError)    refine, with the check given by a schema
//
// WHY THE NAME IS DEDUCED IN ONE AND WRITTEN IN THE OTHER. Adding is fully
// deducible — the check returns `{ actor }`, the verb grows `acc` by its keys,
// and repeating the name would say nothing the type does not carry. Replacing is
// not: a check returning `{ body: … }` where `body` already exists cannot be
// told apart from one that reused a name by accident, and the core says exactly
// why — "the difference between a refinement and a collision is INTENT, which no
// type can read". There is a consistency cost too: `.step(x).step(x)` is refused,
// so a `guard` that silently replaced would give one mistake two verdicts
// depending on the verb used.
//
// WHY THESE ARE VERBS AND THE READ EXTENSIONS ARE NOT. A verb is what may
// REPLACE a ctx entry: `.extend`'s wrapper pushes its step directly, past the
// gate that refuses a step re-populating a key. The four read extensions only
// ADD, so they stay plain steps. The line falls where the gate already is.
//
// WHY THIS IS NOT IN THE CORE. Principle 6 — extensions are dialects, never
// verbs grafted into the core — and the cost of a verb there is paid by every
// scope that never calls it. Nor is it per carrier: nothing in here is
// host-specific, because the one part that knew about a host (how to fail) lives
// in the caller now.

import type { AnyStep, Collides, Ctx, Extension, Scope, State, Surface } from '../index.ts'

// ── Standard Schema, INLINED rather than depended on ─────────────────────────
// This package ships `.ts` sources with no build step, so an import a consumer
// has not installed fails in THEIR build. The spec is designed to be implemented
// structurally — libraries satisfy it by shape, not by importing it — and its
// version rides the property name itself, so drift is visible rather than
// silent. That buys ONE extension instead of two, and a `guard` usable with no
// schema library anywhere in the picture.
//
// COPIED TO THE LETTER, and that is the discipline the copy lives by. The first
// version of this block "improved" it — a `value?: undefined` added to the
// failure branch, which the spec does not have — and no real schema fitted any
// more. The test against a real implementation is what caught it, and is why
// one is kept: an inlined spec is only as good as the thing that proves it
// still matches.
export interface StandardPathSegment {
  readonly key: PropertyKey
}

export interface StandardIssue {
  readonly message: string
  readonly path?: ReadonlyArray<PropertyKey | StandardPathSegment> | undefined
}

export interface StandardSuccess<Output> {
  readonly value: Output
  readonly issues?: undefined
}

export interface StandardFailure {
  readonly issues: ReadonlyArray<StandardIssue>
}

export type StandardResult<Output> = StandardSuccess<Output> | StandardFailure

export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: string
    readonly validate: (value: unknown) => StandardResult<Output> | Promise<StandardResult<Output>>
    readonly types?: { readonly input: Input; readonly output: Output } | undefined
  }
}

// What a schema says it produces. Read off `types`, which is where the spec puts
// it and what every implementation fills in.
export type OutputOf<Sch extends StandardSchemaV1> = NonNullable<
  Sch['~standard']['types']
>['output']

// ── how a check says it FAILED ───────────────────────────────────────────────
// A symbol key private to this module, so a failure cannot collide with any
// enrichment a check produces.
//
// This is NOT the vocabulary §43 removed, and the difference is worth stating
// because it looks like one. That was an OPEN ALPHABET of words coined per
// carrier and checked twice; this is ONE value, owned by one extension, meaning
// exactly one thing. And the host's response never passes through a check at
// all — `onError` builds it — so what is left to say is one bit, optionally with
// issues. A sentinel covers it.
//
// A THROW IS NOT A FAILURE SIGNAL and is never caught here. Under the error
// convention a thrown error is INFRASTRUCTURE — rollback, retry, nack — so a
// verb catching it and answering with a domain response would invert the pivot
// inside itself, and would catch the real errors too: a repository losing its
// connection served to the client as "invalid input". Reading and parsing fail
// for opposite reasons, and a single `catch` over both is a measured bug.
const FAILED: unique symbol = Symbol('lntt.scope.guard.failed')

export interface Failure {
  readonly [FAILED]: true
  readonly issues: readonly StandardIssue[]
}

export const fail = (issues: readonly StandardIssue[] = []): Failure => ({
  [FAILED]: true,
  issues,
})

const isFailure = (value: unknown): value is Failure =>
  typeof value === 'object' && value !== null && FAILED in value

// ── the machine all three share ──────────────────────────────────────────────
// `wrap` is what makes one function serve both shapes: `guard`'s check returns
// the addition itself, `refine`'s returns the VALUE for the entry it named — so
// the caller never writes a name twice.
const stepFor = (
  check: (app: object, ctx: object) => unknown,
  onError: (issues: readonly StandardIssue[], ctx: object) => unknown,
  wrap: (out: unknown) => object,
): AnyStep =>
  async (app: object, ctx: object, next: (delta: object) => Promise<unknown>) => {
    const out = await check(app, ctx)
    if (isFailure(out)) return onError(out.issues, ctx)
    return next(wrap(out))
  }

const asIs = (out: unknown) => out as object
const under = (name: string) => (out: unknown) => ({ [name]: out })

// ── the signatures, DECLARED ─────────────────────────────────────────────────
// Computed from the factories they would be useless: `infer` through a generic
// factory instantiates its type parameters to their constraints, and a verb that
// refines an entry would lose the entry's NAME and the schema's OUTPUT — which
// is its whole job.
//
// `this: Scope<S>` is how a verb reads the scope it was called on. `Need2` is
// inferred from the check's first parameter exactly as `.step` infers it, so a
// guard declares what it needs of the app by annotating it and nothing else.
//
// `R` joins `returns`, which is what makes `onError` checkable at the MOUNT: a
// host that cannot send what it built refuses the mount, with no gate of ours.
export interface GuardVerbs {
  guard<S extends State, Need2 extends object, Add extends object, R>(
    this: Scope<S>,
    check: ((app: Need2, ctx: Ctx<S>) => Add | Failure | Promise<Add | Failure>) &
      AddGate<S, Add>,
    onError: (issues: readonly StandardIssue[], ctx: Ctx<S>) => R | Promise<R>,
  ): Surface<{
    need: S['need'] & Need2
    args: S['args']
    acc: S['acc'] & Add
    returns: S['returns'] | Awaited<R>
    verbs: S['verbs']
  }>

  // `N` is constrained to a key the ctx ALREADY holds. Refining what nothing
  // populated is not a refinement — it is an addition, and `guard` is the verb
  // for that. The check returns the VALUE, not `{ [name]: value }`: the name is
  // in the signature already.
  refine<S extends State, N extends keyof Ctx<S> & string, Need2 extends object, T, R>(
    this: Scope<S>,
    name: N,
    check: (app: Need2, ctx: Ctx<S>) => T | Failure | Promise<T | Failure>,
    onError: (issues: readonly StandardIssue[], ctx: Ctx<S>) => R | Promise<R>,
  ): Surface<{
    need: S['need'] & Need2
    args: S['args']
    // REPLACES, where a step's `Grown` would INTERSECT — and an intersection on
    // a key that is not a key collapses to `never` silently, which is what the
    // gate exists to refuse.
    acc: Omit<S['acc'], N> & { readonly [K in N]: T }
    returns: S['returns'] | Awaited<R>
    verbs: S['verbs']
  }>

  // `refine` with the check supplied by a schema, and the ONLY place the
  // inlined spec is read. A schema IS a check once its result is mapped onto
  // `fail`, which is why this is a specialization and not a parallel path.
  validate<
    S extends State,
    N extends keyof Ctx<S> & string,
    Sch extends StandardSchemaV1,
    R,
  >(
    this: Scope<S>,
    name: N,
    schema: Sch,
    onError: (issues: readonly StandardIssue[], ctx: Ctx<S>) => R | Promise<R>,
  ): Surface<{
    need: S['need']
    args: S['args']
    acc: Omit<S['acc'], N> & { readonly [K in N]: OutputOf<Sch> }
    returns: S['returns'] | Awaited<R>
    verbs: S['verbs']
  }>
}

// ── gate: `guard` ADDS, so it may not land on a key already populated ────────
// A verb goes past the core's own ctx gate — that bypass is what lets `refine`
// replace — so `guard`, which does NOT replace, has to say it itself. Without
// this the two keys would INTERSECT, and an intersection on a key that is not a
// key collapses to `never` silently: assignable to everything, complained about
// nowhere, while the runtime hands back the second value.
//
// The COMPARISON is the core's — `Collides`, the same formula `.step`'s own gate
// reads, so the two cannot drift apart — and only the message is written here,
// because a verb can point at its own sibling where the core can only say "an
// extension may replace it". The core's `Add = any` limit is inherited with the
// formula: once `Add` is inferred `any`, assignability short-circuits before any
// intersected gate is read, and that is true here for the same reason.
type AddGate<S extends State, Add> = [Collides<S, Add>] extends [never]
  ? unknown
  : `⛔ this ctx key is already populated: ${Collides<S, Add> & string} — \`refine\` replaces an entry, \`guard\` may only add`

type Factory = (...args: never[]) => AnyStep

export const guards: Extension<GuardVerbs> = {
  methods: {
    guard: ((check: never, onError: never) =>
      stepFor(check, onError, asIs)) as unknown as Factory,

    refine: ((name: string, check: never, onError: never) =>
      stepFor(check, onError, under(name))) as unknown as Factory,

    validate: ((name: string, schema: StandardSchemaV1, onError: never) =>
      stepFor(
        // The schema reads the entry the name points at, and nothing else: what
        // `validate` validates is what is already there.
        async (_app, ctx) => {
          const result = await schema['~standard'].validate(
            (ctx as Record<string, unknown>)[name],
          )
          return result.issues ? fail(result.issues) : result.value
        },
        onError,
        under(name),
      )) as unknown as Factory,
  },
}
