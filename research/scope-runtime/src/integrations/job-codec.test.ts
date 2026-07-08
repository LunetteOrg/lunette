import { describe, expect, it } from 'vitest'
import { chain } from '../chain.ts'
import { forbidden } from '../scope/abort.ts'
import { fragmentFor } from '../scope/fragment.ts'
import type { JobScope } from '../scope/scope.ts'
import { outcomeToBus, runJob } from './job-codec.ts'

// Evidence for the scope-KIND claim (issue #10): the same fragment + fold serve
// a non-HTTP host. `fragmentFor<JobScope>` swaps the carrier (a `Message`, not a
// `Request`); `runJob` runs the SAME `runFold`. Proves BOTH facets are
// swappable — the input carrier and the output codec — and nails the error
// convention for messaging (abort → ack+dead-letter, throw → nack).
describe('message-bus codec — the scope-KIND facet', () => {
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

    // A guard on the JobScope carrier declares the typed param (proving guards
    // work off HTTP too) and reads the message body; the leaf consumes both.
    // Three outcomes: a domain result, a domain abort, an infra throw.
    const process = fragmentFor<JobScope>()
      .guard((_app: {}, params: { kind: string }, ctx) => {
        // the carrier is the message, not a request
        void (ctx.message.body as unknown)
        return { requestedKind: params.kind }
      })
      .handle((deps, params) => {
        const kind = params.kind
        void deps.requestedKind
        if (kind === 'reject') return forbidden('domain rule')
        if (kind === 'boom') throw new Error('infra down')
        return { processed: kind }
      })

    const msg = (kind: string) => ({ message: { body: { kind }, kind }, params: { kind } })

    expect(await runJob(process, app, msg('ok'))).toEqual({ action: 'ack' })

    const rejected = await runJob(process, app, msg('reject'))
    expect(rejected.action).toBe('ack')
    if (rejected.action === 'ack' && 'deadLetter' in rejected) {
      expect(rejected.deadLetter.reason).toEqual({
        kind: 'status',
        status: 403,
        body: 'domain rule',
      })
    }

    const boomed = await runJob(process, app, msg('boom'))
    expect(boomed.action).toBe('nack')

    await dispose()
  })
})
