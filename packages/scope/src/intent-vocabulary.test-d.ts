import { describe, expectTypeOf, it } from 'vitest'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Abort } from './abort.ts'
import type { Capability } from './carrier.ts'
import type { Handler } from './scope.ts'
import { scope } from './scope.ts'
import { forbidden, http, notFound, redirect } from './extensions/http.ts'
import type { IntentGuard } from './adapter-guard.ts'

// THE INTENT AXIS — negatives on the model of `capability-alphabet.test-d.ts`,
// one per guarantee measured in `research/outcome-vocabulary/`. Each mistake
// below is read as the message a user would see; removing the
// `@ts-expect-error` is how each was verified rather than assumed.

// Every OTHER position is captured with its own `infer`, not matched against
// a literal `any`: `__cap`/`__int` are INVARIANT function-typed phantoms, and
// when the actual value at one of those positions is `never` (as it is for
// `Cap` throughout this file — none of these scopes need a capability),
// `(x: never) => never` does not structurally extend `(x: any) => any` —
// the same trap `capability-alphabet.test-d.ts`'s `CapOf` had to work around.
type IntOf<H> = H extends Handler<infer _N, infer _S, infer _R, infer _C, infer I, infer _E>
  ? I
  : never

// ── guarantee 1: an undeclared intent is rejected AT THE GUARD ──────────────
// `notFound()` is `http`'s word — using it on a scope that never
// `.extend(http)`s is caught where the guard is written, not deferred to
// `.handle()` or the mount.
describe('an undeclared intent', () => {
  it('is rejected at the guard, naming the intent', () => {
    scope()
      // @ts-expect-error ⛔ this scope does not declare the intent: status
      .guard(() => notFound())
  })

  it('the cure is `.extend()`, and nothing else changes', () => {
    scope()
      .extend(http)
      .guard(() => notFound())
      .handle(() => ({ ok: true }))
  })
})

// ── guarantee 2: a bare `Abort` fails CLOSED, not open ───────────────────────
// Written without its parameter, `Abort` means "an intent nobody declared" —
// it must be refused even on a scope that DID extend a carrier, because the
// unparameterized form could be hiding anything. Collapsing to `never` here
// (the fail-open decision §34 closed on the capability axis) would let it
// mount anywhere instead.
declare const mystery: () => Abort

describe('a bare Abort', () => {
  it('fails closed even on a scope that extended a carrier', () => {
    scope()
      .extend(http)
      // @ts-expect-error ⛔ this scope does not declare the intent: __unknown_intent
      .guard(() => mystery())
  })
})

// ── guarantee 3: a guard returning TWO intents keeps BOTH ────────────────────
// The load-bearing shape (`IntentKeysOf` distributing over the whole return
// type, inferred at once, rather than from inside a union constituent) is
// what makes this compile at all — and what makes the accumulated set carry
// both names, not just the first candidate TypeScript would otherwise pick.
const throttled = scope()
  .extend(http)
  .guard((deps: { readonly banned: boolean }) => (deps.banned ? forbidden() : redirect('/login')))
  .handle(() => ({ ok: true }))

describe('a guard returning two different intents', () => {
  it('compiles, and the handler carries BOTH in its declared set', () => {
    expectTypeOf<IntOf<typeof throttled>>().toEqualTypeOf<'status' | 'redirect'>()
  })
})

// ── guarantee 4: naming the type arguments by hand does not defeat the gate ─
// The same hole §34 had to close on the capability axis (`Cap`): a caller
// who names a call's type arguments must not be able to satisfy a brand the
// inferred call would have failed. `__int` is INVARIANT for exactly this
// reason — a contravariant phantom would let `never` through vacuously.
describe('a mount that names its type arguments', () => {
  it('cannot declare away an intent the scope requires', () => {
    scope()
      // @ts-expect-error ⛔ naming the parameter does not make `status` declared
      .guard<{}, ReturnType<typeof notFound>>(() => notFound())
  })
})

// ── bonus: the MOUNT-side gate (`IntentGuard`), the other half of the pair ──
// The scope below is RIGHT — it declared `redirect` correctly by extending
// `http` — so only the PAIRING with a host that cannot render it is wrong,
// and that error cannot move earlier: the same scope mounts fine elsewhere.
const redirecting = scope()
  .extend(http)
  .guard(() => redirect('/login'))
  .handle(() => ({ ok: true }))

const statusOnly = scope()
  .extend(http)
  .guard(() => forbidden())
  .handle(() => ({ ok: true }))

// Written the way a real mount is (`capability-alphabet.test-d.ts`'s
// `httpMount`): `Need`/`S`/`R`/`Cap`/`Int` are the FUNCTION's own generic
// parameters, unified directly against the concrete `Handler` argument at the
// call site — not read back via a separate `H extends Handler<any, …>`
// constraint, which is the shape that hits the invariant-`any`-vs-`never`
// trap above.
declare const toRpcLikeMount: <
  Need extends object,
  S extends StandardSchemaV1,
  R,
  Cap extends Capability,
  Int extends PropertyKey,
>(
  h: Handler<Need, S, R, Cap, Int> & IntentGuard<Int, 'status'>,
) => void

describe('IntentGuard — the host does not handle that scope', () => {
  it('rejects a scope whose intent the host cannot render', () => {
    // @ts-expect-error ⛔ this host cannot render the intent: redirect
    toRpcLikeMount(redirecting)
  })

  it('accepts a scope whose every intent the host DOES render', () => {
    toRpcLikeMount(statusOnly)
  })
})
