// THE WORDS a carrier coins — what a step returns when it has something to SAY
// beyond a domain value. `unauthorized()`, `redirect('/')`, `json(v, 201)`: each
// is a value of the CARRIER's own type, and the core builds none of them.
//
// What the core knows about a word is one SHAPE, and it is this whole file. Not
// a wrapper, not a brand, not a constructor — a declaration, read off a type.
// So a carrier shapes its words however its host needs (an envelope, a tagged
// union, whatever it already uses for errors) and the core stays out of it: a
// scope is a COMPOSER, not an error handler (§42).
//
// Read this file asking "what does it know about HTTP?" The answer is nothing —
// every HTTP name lives in the carrier that offers HTTP.

// Written without its parameter, `Word` means "an intent nobody declared" and
// fails CLOSED — refused wherever a gate checks it — rather than collapsing to
// `never` and mounting anywhere: a word that declares nothing is admitted by
// every gate, which is fail-OPEN.
export interface UnknownIntent {
  readonly __unknown_intent: true
}

// `intent` is REQUIRED, and that requirement is what makes the declaration
// readable without a brand. A phantom alone would not do: an all-optional shape
// is matched by nearly every type, so the gate would fire `infer` on plain
// domain values too and read their intent as `UnknownIntent`. Hanging the
// declaration on a member a word carries ANYWAY separates the two for free —
// and the core still never reads what an intent MEANS, only whether it is there
// and what it is called.
//
// `__i` is phantom and INVARIANT: a contravariant one would let a caller name
// the gate away by supplying `never`.
export interface Word<I extends object = UnknownIntent> {
  readonly intent: unknown
  readonly __i?: (i: I) => I
}
