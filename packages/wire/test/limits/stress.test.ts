import { describe, expect, it } from 'vitest'
import { lunette } from '../../src/index.ts'

describe('runtime stress', () => {
  it('rejects at runtime two layers providing the same key', async () => {
    // The collision is already a compile-time error (see collision-guard
    // .test-d.ts). The runtime remains the safety net and fails loudly —
    // and since the guard rejects the ARGUMENT, the chain stays runnable.
    const chain = lunette()
      .provide(() => ({ useCases: { a: 1 } }))
      // @ts-expect-error — compile-time guard; this test exercises the runtime net
      .provide(() => ({ useCases: { b: 2 } }))

    await expect(chain.run(async () => {})).rejects.toThrow(
      /Keys already present in the context: useCases/,
    )
  })

  it('a layer failing during construction fails run and closes the previous ones', async () => {
    const teardowns: string[] = []

    const chain = lunette()
      .use(async (_ctx, next) => {
        try {
          return await next({ a: 1 })
        } finally {
          teardowns.push('a')
        }
      })
      .provide(() => {
        throw new Error('construction failed')
      })

    await expect(chain.run(async () => {})).rejects.toThrow('construction failed')
    expect(teardowns).toEqual(['a'])
  })

  it('build() rejects if construction fails', async () => {
    const chain = lunette().provide(() => {
      throw new Error('no db')
    })

    await expect(chain.build()).rejects.toThrow('no db')
  })
})
