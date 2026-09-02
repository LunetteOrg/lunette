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
// The rule as a FUNCTION, so it can be asked about sources this repo does not
// contain. Run only over the real files it was silent about both kinds of
// mistake it can make — a line it wrongly accuses, and one it wrongly lets
// through — because neither is in any file here today.
//
// Line-shaped and not a parser, deliberately: it reads a directory of test
// files, and the shapes below are what those contain. What it does NOT do is
// decide cleverly — an accusation it cannot rule out is left standing, which
// costs a visible failure and never a silent pass.
// A block comment is BLANKED, not skipped by the look of its first characters.
// Skipping the line was the wrong shape and traded one mistake for a worse one:
// `/* note */ expect(x)` and an assertion written after a `*/` both start with
// a comment and both carry live code, so the check went silent on exactly the
// class it exists to catch. Blanking the comment's own characters and keeping
// the newlines leaves whatever was around it on the line where it was written,
// so the line numbers still point at the file.
//
// Where it is still a heuristic and not a parser: a `/*` inside a string
// literal opens a block that is not one. That direction blanks real code and so
// can pass silently — the one silent path left, named rather than implied,
// and no `.test-d.ts` here writes such a string.
const withoutBlockComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))

const runtimeAssertionsIn = (source: string): readonly (readonly [number, string])[] =>
  withoutBlockComments(source)
    .split('\n')
    .map((line, i) => [i + 1, line] as const)
    // What is left of a comment is the line kind, which no blanking reaches.
    .filter(([, line]) => !line.trimStart().startsWith('//'))
    // `expectTypeOf(` needs no exemption and never did: it does not CONTAIN
    // `expect(` — the character after `expect` is `T` — so it never reaches
    // here. The exemption that used to sit below said `!/expectTypeOf\(/` on a
    // line it had first stripped every `expectTypeOf(` from, which is `true`
    // for every line ever written. Two ways of doing nothing, stacked.
    .filter(([, line]) => /(^|[^A-Za-z])expect\(/.test(line))

describe('the rule that finds them', () => {
  it('accuses a bare `expect(`, which is the whole point', () => {
    expect(runtimeAssertionsIn('expect(x).toBe(1)')).toEqual([[1, 'expect(x).toBe(1)']])
  })

  it('leaves `expectTypeOf(` alone, which is what these files are FOR', () => {
    expect(runtimeAssertionsIn('expectTypeOf<A>().toEqualTypeOf<B>()')).toEqual([])
  })

  it('leaves a name that merely ENDS in expect alone', () => {
    expect(runtimeAssertionsIn('myexpect(x)')).toEqual([])
  })

  it('leaves a line comment alone', () => {
    expect(runtimeAssertionsIn('  // expect(x).toBe(1) would be dead here')).toEqual([])
  })

  it('CATCHES an assertion beside a closed block comment, which skipping the line hid', () => {
    // The regression this shape exists to undo: a filter reading the line's
    // first characters called both of these comments and saw neither
    // assertion.
    expect(runtimeAssertionsIn('/* note */ expect(x).toBe(1)')).toEqual([
      [1, '           expect(x).toBe(1)'],
    ])
    expect(runtimeAssertionsIn('*/ expect(x).toBe(1)')).toEqual([[1, '*/ expect(x).toBe(1)']])
  })

  it('keeps the line NUMBERS right across a blanked block, so the report still points', () => {
    const source = ['/* one', ' * two', ' */', 'expect(x).toBe(1)'].join('\n')
    expect(runtimeAssertionsIn(source)).toEqual([[4, 'expect(x).toBe(1)']])
  })

  it('leaves a BLOCK comment alone, where these files do most of their talking', () => {
    const source = ['/* a note about the rule:', ' * expect(x).toBe(1) is dead in here', ' */'].join(
      '\n',
    )
    expect(runtimeAssertionsIn(source)).toEqual([])
  })

  it('reports the line NUMBER, so the failure names where to look', () => {
    expect(runtimeAssertionsIn('const a = 1\n\nexpect(a).toBe(1)')).toEqual([
      [3, 'expect(a).toBe(1)'],
    ])
  })
})

describe('a type-only test file contains no runtime assertions', () => {
  const dir = join(import.meta.dirname, '.')
  const typeOnly = readdirSync(dir, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith('.test-d.ts'))

  it('finds the type-only files at all, so the check cannot pass by looking at nothing', () => {
    expect(typeOnly.length).toBeGreaterThan(0)
  })

  it.each(typeOnly)('%s has no `expect(` outside a comment', (file) => {
    expect(runtimeAssertionsIn(readFileSync(join(dir, file), 'utf8'))).toEqual([])
  })
})
