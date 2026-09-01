import { expect, it } from 'vitest'
import { scope, type Extension, type Scope, type State, type Surface } from './scope.ts'
import type { AnyStep, Next } from './step.ts'

it('2. un verbo chiamato `then`', async () => {
  const thenExt = { methods: { then: () => (async () => 'x') as unknown as AnyStep } }
  let refused = false
  let s: unknown
  try {
    s = scope<{}>().extend(thenExt as unknown as Extension<{}>)
  } catch {
    refused = true
  }
  console.log('   .extend lo rifiuta?', refused)
  if (!refused) {
    console.log('   own property `then`:', Object.prototype.hasOwnProperty.call(s, 'then'))
    const settled = await Promise.race([
      Promise.resolve(s).then(() => 'RISOLTA'),
      new Promise((r) => setTimeout(() => r('MAI RISOLTA — appesa'), 300)),
    ])
    console.log('   await su quello scope →', settled)
  }
  expect(true).toBe(true)
})

interface TagA { tag<S extends State>(this: Scope<S>, v: string): Surface<S> }
interface TagB { tag<S extends State>(this: Scope<S>, v: number): Surface<S> }
const seen: string[] = []
const mk = (label: string) => (v: unknown) =>
  (async (_a: {}, _c: {}, n: Next<{}>) => {
    seen.push(`factory ${label} ha ricevuto ${JSON.stringify(v)} (typeof ${typeof v})`)
    return n({})
  }) as unknown as AnyStep
const A: Extension<TagA> = { methods: { tag: mk('A') as (...a: never[]) => AnyStep } }
const B: Extension<TagB> = { methods: { tag: mk('B') as (...a: never[]) => AnyStep } }

it('3. due estensioni, stesso nome di verbo', async () => {
  const both = scope<{}>().extend(A).extend(B)
  // compila: la firma vista è quella di A, che accetta una stringa
  await both.tag('hello').step(async (_a: {}, _c: {}) => 'done')({}, {})
  console.log('  ', seen.join(' | '))
  expect(seen).toHaveLength(1)
})
