import { describe, expect, it } from 'vitest'
import { chain } from '../chain.ts'
import { forbidden } from '../scope/abort.ts'
import { scopeFor } from '../scope/kit.ts'
import { outcomeToBus, runJob } from './job-codec.ts'

// Evidence for the scope-KIND claim (issue #10): the same Outcome + fold serve
// a non-HTTP codec. Proves the OUTPUT facet is swappable and nails the error
// convention for messaging (abort → ack+dead-letter, throw → nack).
describe('message-bus codec — the scope-KIND output facet', () => {
  it('maps the same Outcome to ack / ack+dead-letter', () => {
    expect(outcomeToBus({ ok: true, value: { done: true }, cookies: [] })).toEqual({
      action: 'ack',
    })
    expect(outcomeToBus({ ok: false, abort: forbidden('nope'), cookies: [] })).toEqual({
      action: 'ack',
      deadLetter: { reason: { kind: 'status', status: 403, body: 'nope' } },
    })
  })

  it('runs a real handler over a message: result → ack, abort → dead-letter, throw → nack', async () => {
    const { app, dispose } = await chain.build({ env: { label: 'job' } })
    const kit = scopeFor(app)

    // one leaf, three outcomes: a domain result, a domain abort, an infra throw
    const process = kit.handle((deps) => {
      const kind = deps.params.kind
      if (kind === 'reject') return forbidden('domain rule')
      if (kind === 'boom') throw new Error('infra down')
      return { processed: kind }
    })

    expect(await runJob(process, { body: {}, params: { kind: 'ok' } })).toEqual({ action: 'ack' })

    const rejected = await runJob(process, { body: {}, params: { kind: 'reject' } })
    expect(rejected.action).toBe('ack')
    if (rejected.action === 'ack' && 'deadLetter' in rejected) {
      expect(rejected.deadLetter.reason).toEqual({ kind: 'status', status: 403, body: 'domain rule' })
    }

    const boomed = await runJob(process, { body: {}, params: { kind: 'boom' } })
    expect(boomed.action).toBe('nack')

    await dispose()
  })
})
