import { expect, test } from 'vitest'
import { scope } from './scope.ts'
import type { AnyStep } from './step.ts'

test('two extensions declaring the same verb name', async () => {
  const a = {
    methods: { tag: (v: string) => ((_app, ctx, next) => next({ ...ctx, a: v })) as AnyStep },
  }
  const b = {
    methods: { tag: (v: number) => ((_app, _ctx, _next) => `b:${v}`) as AnyStep },
  }
  const s = scope().extend(a).extend(b) as never as {
    tag: (v: never) => { (app: object, args: object): Promise<unknown> }
  }
  const run = s.tag('hello' as never)
  expect(await run({}, {})).toBe('b:hello')
})

test('a step calling next twice runs the tail twice', async () => {
  let n = 0
  const s = scope()
    .step(async (_app: {}, _ctx, next) => {
      await next({})
      return await next({})
    })
    .step((_app: {}, _ctx, _next) => {
      n += 1
      return n
    })
  const r = await s({}, {})
  expect([r, n]).toEqual([2, 2])
})
