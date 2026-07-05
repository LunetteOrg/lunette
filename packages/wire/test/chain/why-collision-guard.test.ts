// WHY the collision guard exists — a documentation test.
//
// TypeScript intersections merge object types DEEPLY:
//   { area: { a } } & { area: { b } }  ⇒  area has BOTH a and b.
// A runtime spread replaces the key WHOLESALE:
//   { ...{ area: { a } }, ...{ area: { b } } }  ⇒  area has ONLY b.
//
// On object literals TypeScript's spread typing models the replacement
// correctly — the lie cannot be written directly. It is born inside any
// GENERIC accumulator (a builder folding patches into Ctx & P), which
// needs exactly this cast:

import { describe, expect, expectTypeOf, it } from 'vitest'

const accumulate = <A extends object, B extends object>(a: A, b: B): A & B =>
  ({ ...a, ...b }) as A & B
//               ^^^^^^^^ the cast every chain/builder needs — and where
//                        an unguarded engine starts lying

describe('why the collision guard exists', () => {
  it('an unguarded accumulator: the type promises both areas, the runtime lost one', () => {
    const first = { area: { login: (): string => 'ok' } }
    const second = { area: { logout: (): string => 'bye' } }

    const merged = accumulate(first, second)

    // The type promises both... (type-only assertions: the value form
    // would CRASH at runtime — which is the point)
    expectTypeOf<typeof merged.area.login>().toEqualTypeOf<() => string>()
    expectTypeOf<typeof merged.area.logout>().toEqualTypeOf<() => string>()

    // ...the runtime kept only the last patch:
    expect(merged.area.logout()).toBe('bye')
    expect((merged.area as { login?: unknown }).login).toBeUndefined() // 💥 silently

    // This is why wire forbids the collision instead: the same duplicate
    // key is a compile-time error naming the key (see
    // collision-guard.test-d.ts) and a runtime throw as the safety net
    // (see stress.test.ts) — and the convention becomes one top-level
    // key per area.
  })
})
