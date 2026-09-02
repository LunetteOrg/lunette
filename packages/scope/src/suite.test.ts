import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// ── the suite's own integrity ────────────────────────────────────────────────
// A `*.test-d.ts` file is TYPECHECKED and never RUN: `vitest.config.ts` includes
// `src/**/*.test.ts` for tests and this pattern only under `typecheck`. So an
// `expect(...)` written in one is dead code that READS like coverage — the most
// expensive kind of mistake a test suite can make, because it subtracts
// confidence while looking like it adds it.
//
// It really happened: four runtime assertions sat unexecuted in
// `contract.test-d.ts`, and one of them was the only check that a scope with no
// leaf THROWS rather than handing back `undefined`. Replacing that throw with
// `return undefined` left all 69 tests green.
//
// Nothing in the toolchain reports this, so the rule is checked here rather
// than remembered — the same move the reserved alphabet made: ask the question
// mechanically instead of trusting that everyone knows the answer.
describe('a type-only test file contains no runtime assertions', () => {
  const dir = join(import.meta.dirname, '.')
  const typeOnly = readdirSync(dir, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith('.test-d.ts'))

  it('finds the type-only files at all, so the check cannot pass by looking at nothing', () => {
    expect(typeOnly.length).toBeGreaterThan(0)
  })

  it.each(typeOnly)('%s has no `expect(` outside a comment', (file) => {
    const offending = readFileSync(join(dir, file), 'utf8')
      .split('\n')
      .map((line, i) => [i + 1, line] as const)
      .filter(([, line]) => !line.trimStart().startsWith('//'))
      .filter(([, line]) => line.includes('expect('))
      // `expectTypeOf(` is the point of these files, and contains `expect`
      .filter(([, line]) => !/\bexpectTypeOf\(/.test(line.replace(/expectTypeOf\(/g, '')))
      .filter(([, line]) => /(^|[^A-Za-z])expect\(/.test(line))

    expect(offending).toEqual([])
  })
})
