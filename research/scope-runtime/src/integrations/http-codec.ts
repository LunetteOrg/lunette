import type { Outcome, SetCookie } from '../scope/kit.ts'

// The HTTP outcome codec, shared by the Fetch-based hosts (React Router,
// Hono). A returned domain result → 200; a returned abort → its intent
// (redirect / 4xx); a THROW never reaches here — it stays infrastructure and
// the host maps it to 5xx.
export function serializeCookie({ name, value, options }: SetCookie): string {
  const parts = [`${name}=${value}`]
  if (options.path !== undefined) parts.push(`Path=${options.path}`)
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`)
  if (options.httpOnly === true) parts.push('HttpOnly')
  return parts.join('; ')
}

export function outcomeToResponse(outcome: Outcome<unknown>): Response {
  const headers = new Headers()
  for (const cookie of outcome.cookies) headers.append('set-cookie', serializeCookie(cookie))

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
