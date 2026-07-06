import { describe, expect, it } from 'vitest'
import { memDb, windowModule } from './window-step.ts'

const post = (title: string, body = 'ok') => ({ authorId: 'u1', title, body })
const seq = () => {
  let n = 0
  return () => `id-${++n}`
}

describe('the window as a named chain step', () => {
  it('a RETURNED domain error commits the work done before it', async () => {
    const db = memDb()
    await windowModule.run({ db, generateId: seq() }, async (app) => {
      const out = await app.threads.publishPair(post('A'), post('A')) // duplicate title
      expect(out).toEqual({ kind: 'duplicate-title' })
    })
    expect(db.rows).toHaveLength(1) // the first insert survived the window
  })

  it('a THROWN infra error rolls back everything in the window', async () => {
    const db = memDb()
    await windowModule.run({ db, generateId: seq() }, async (app) => {
      await expect(app.threads.publishPair(post('A'), post('B', 'boom'))).rejects.toThrow(
        'storage exploded',
      )
    })
    expect(db.rows).toHaveLength(0) // the first insert vanished with the tx
  })

  it('the window is per call: a failed call does not poison the next one', async () => {
    const db = memDb()
    await windowModule.run({ db, generateId: seq() }, async (app) => {
      await expect(app.threads.publishPair(post('A'), post('B', 'boom'))).rejects.toThrow()
      expect(await app.threads.publishPair(post('A'), post('B'))).toBe(2)
    })
    expect(db.rows).toHaveLength(2)
  })
})
