import type { Outcome } from '@lntt/scope'
import { readCookies, type SetCookie } from '@lntt/scope/cookies'
import { readHeaders } from '@lntt/scope/headers'

// The HTTP outcome codec — the host-agnostic half of every pack, public so a
// host we ship no pack for composes the same pieces instead of copying them.
// A returned domain result → 200; a returned abort → its intent (redirect /
// 4xx); a THROW never reaches here — it stays infrastructure and the host maps
// it to 5xx. `outcomeToResponse` is for a Fetch host wired BY HAND — the shipped
// Fetch packs (Hono, React Router) inline their own codec, because each returns
// through its host's own channel (`c.json`, RR7's `data()`), not through a plain
// `Response`. Hosts on a node `ServerResponse` use `renderOutcome` from
// `./node.ts`, which speaks the same contract onto a different response object.
export function serializeCookie({ name, value, options }: SetCookie): string {
  const parts = [`${name}=${value}`]
  if (options.path !== undefined) parts.push(`Path=${options.path}`)
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`)
  if (options.httpOnly === true) parts.push('HttpOnly')
  return parts.join('; ')
}

export function outcomeToResponse(outcome: Outcome<unknown, object>): Response {
  // Each effect is read through the reader its own extension exports, so this
  // codec never touches `outcome.effects` directly. A scope that injected
  // neither extension reads back empty, and the branches below are unchanged.
  const headers = new Headers(readHeaders(outcome))
  for (const cookie of readCookies(outcome)) headers.append('set-cookie', serializeCookie(cookie))

  if (outcome.ok) {
    headers.set('content-type', 'application/json')
    return new Response(JSON.stringify(outcome.value), { status: 200, headers })
  }

  const { intent } = outcome.abort
  if (intent.kind === 'redirect') {
    headers.set('location', intent.location)
    return new Response(null, { status: intent.status, headers })
  }
  if (intent.body !== undefined) headers.set('content-type', 'application/json')
  return new Response(
    intent.body !== undefined ? JSON.stringify(intent.body) : null,
    { status: intent.status, headers },
  )
}
