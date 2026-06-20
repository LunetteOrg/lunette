import type { Session, SessionRepository } from '../domain/access.ts'
import type { SessionCookie } from '../lib/cookies.ts'

// Reads the signed session id off the request and resolves the session. A
// missing/blank cookie is simply "no session" (null); an infrastructure
// failure from the repo THROWS and surfaces as a 5xx at the boundary.
export const sessionReader =
  (cookie: SessionCookie, sessions: Pick<SessionRepository, 'findById'>) =>
  async (request: Request): Promise<Session | null> => {
    const id = await cookie.read(request)
    if (!id) return null
    return sessions.findById(id)
  }
