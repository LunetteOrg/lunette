import type { RequestHead } from '@lntt/scope'
import type { Session, SessionRepository } from '../domain/access.ts'
import type { SessionCookie } from '../lib/cookies.ts'

// Reads the signed session id off the request and resolves the session. A
// missing/blank cookie is simply "no session" (null); an infrastructure
// failure from the repo THROWS and surfaces as a 5xx at the boundary. Takes the
// headless `RequestHead` (headers only) — the type `ctx.request` exposes.
export const sessionReader =
  (cookie: SessionCookie, sessions: Pick<SessionRepository, 'findById'>) =>
  async (request: RequestHead): Promise<Session | null> => {
    const id = await cookie.read(request)
    if (!id) return null
    return sessions.findById(id)
  }
