import type { Outcome } from '../scope/kit.ts'

// The message-bus outcome codec — the SAME host-agnostic `Outcome` the HTTP
// codec renders, mapped to a bus acknowledgement instead. This makes the
// "codec = facet" claim concrete on the OUTPUT side: one fold, one Outcome,
// two renderings. Groundwork for issue #10 (@lntt/listener).
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
//
// NOTE — scope: this proves the output codec is swappable. Generalizing the
// INPUT payload (an HTTP `Request` → a bus `Message`) is the remaining #10
// work; here the message is faked onto the request-shaped scope so the codec
// claim can be shown without pretending the input side is done.

export type BusAck =
  | { readonly action: 'ack' }
  | { readonly action: 'ack'; readonly deadLetter: { readonly reason: unknown } }

export type BusResult = BusAck | { readonly action: 'nack'; readonly error: unknown }

export function outcomeToBus(outcome: Outcome<unknown>): BusAck {
  if (outcome.ok) return { action: 'ack' }
  return { action: 'ack', deadLetter: { reason: outcome.abort.intent } }
}

export async function runJob<R>(
  handler: (scope: {
    request: Request
    params: Record<string, string>
  }) => Promise<Outcome<R>>,
  message: { body: unknown; params?: Record<string, string> },
): Promise<BusResult> {
  try {
    const request = new Request('job://message', {
      method: 'POST',
      body: JSON.stringify(message.body),
      headers: { 'content-type': 'application/json' },
    })
    return outcomeToBus(await handler({ request, params: message.params ?? {} }))
  } catch (error) {
    // A thrown infra error never became an Outcome — nack it (retry).
    return { action: 'nack', error }
  }
}
