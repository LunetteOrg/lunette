import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Handler } from '../scope/fragment.ts'
import { runScope } from '../scope/run-fold.ts'
import type { JobScope, Message, Outcome } from '../scope/scope.ts'

// The message-bus codec — the SAME host-agnostic `Outcome` the HTTP codec
// renders, mapped to a bus acknowledgement instead. This makes the "codec =
// facet" claim concrete on the OUTPUT side, and — with `fragmentFor<JobScope>`
// + `runJob` over the SAME `runFold` — proves the INPUT carrier generalizes
// too: an HTTP `Request` and a bus `Message` are sibling carriers, not a
// special case. Groundwork for issue #10 (@lntt/listener).
//
// The error convention (§3) meets messaging, mirroring HTTP exactly:
//   returned domain result  → ack                (2xx: processed)
//   returned domain abort   → ack + dead-letter  (4xx: processed, do NOT retry
//                                                 — retrying a domain rejection
//                                                 cannot help — but flagged)
//   THROWN infrastructure   → nack               (5xx: retry). A throw yields
//                                                 no Outcome, so it is the
//                                                 consumer's job (runJob), not
//                                                 the codec's.

export type BusAck =
  | { readonly action: 'ack' }
  | { readonly action: 'ack'; readonly deadLetter: { readonly reason: unknown } }

export type BusResult = BusAck | { readonly action: 'nack'; readonly error: unknown }

export function outcomeToBus(outcome: Outcome<unknown>): BusAck {
  if (outcome.ok) return { action: 'ack' }
  return { action: 'ack', deadLetter: { reason: outcome.abort.intent } }
}

// Runs a bus handler over a message: the JobScope carrier holds the `message`,
// params ride the dedicated second arg. A thrown infra error never became an
// Outcome — nack it (retry).
export async function runJob<Need extends object, S extends StandardSchemaV1, R>(
  handler: Handler<Need, S, R>,
  app: object,
  envelope: { message: Message; params?: unknown },
): Promise<BusResult> {
  try {
    // The job params are validated against the fragment's schema before the
    // fold: a bad param → a RETURNED 422 → ack + dead-letter (domain rejection,
    // do NOT retry). A thrown infra error never became an Outcome → nack (retry).
    return outcomeToBus(
      await runScope<JobScope, S, R>(
        handler,
        app,
        { message: envelope.message },
        envelope.params ?? {},
      ),
    )
  } catch (error) {
    return { action: 'nack', error }
  }
}
