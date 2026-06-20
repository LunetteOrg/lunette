import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Env } from '../config/env.ts'

// Signed client-side state: a base64url payload plus an HMAC signature. The
// read side verifies in constant time and returns null on any tampering — no
// db row exists for the pending-auth flow before the code is confirmed.
export type Cookie<T> = {
  read(request: Request): Promise<T | null>
  write(value: T): string // a Set-Cookie header value
  clear(): string
}

const sign = (payload: string, secret: string): string =>
  createHmac('sha256', secret).update(payload).digest('base64url')

const makeCookie = <T>(opts: {
  name: string
  secret: string
  maxAge: number
  secure: boolean
}): Cookie<T> => {
  const encode = (value: T): string => {
    const payload = Buffer.from(JSON.stringify(value)).toString('base64url')
    return `${payload}.${sign(payload, opts.secret)}`
  }
  const decode = (raw: string): T | null => {
    const [payload, signature] = raw.split('.')
    if (!payload || !signature) return null
    const expected = sign(payload, opts.secret)
    const a = Buffer.from(signature)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    try {
      return JSON.parse(Buffer.from(payload, 'base64url').toString()) as T
    } catch {
      return null
    }
  }
  const serialize = (raw: string, maxAge: number): string =>
    `${opts.name}=${raw}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${
      opts.secure ? '; Secure' : ''
    }`
  return {
    async read(request) {
      const header = request.headers.get('cookie')
      if (!header) return null
      const found = header
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith(`${opts.name}=`))
      return found ? decode(found.slice(opts.name.length + 1)) : null
    },
    write(value) {
      return serialize(encode(value), opts.maxAge)
    },
    clear() {
      return serialize('', 0)
    },
  }
}

// The session cookie carries only the opaque session id.
export type SessionCookie = Cookie<string>

export const sessionCookie = ({ env }: { env: Env }): SessionCookie =>
  makeCookie<string>({
    name: 'session',
    secret: env.SESSION_SECRET,
    maxAge: 60 * 60 * 24 * 7,
    secure: env.NODE_ENV === 'production',
  })

// The pending-auth cookie carries the signed state of an in-flight login: the
// email being verified, an anti-replay nonce, an optional return path and, for
// newcomers, the pending registration. TTL > otp ttl by design.
export type PendingAuth = {
  email: string
  nonce: string
  returnTo?: string
  registration?: { displayName?: string; locale?: string; termsAccepted: boolean }
}

export type PendingCookie = Cookie<PendingAuth>

export const pendingCookie = ({ env }: { env: Env }): PendingCookie =>
  makeCookie<PendingAuth>({
    name: 'pending-auth',
    secret: env.SESSION_SECRET,
    maxAge: 60 * 15,
    secure: env.NODE_ENV === 'production',
  })
