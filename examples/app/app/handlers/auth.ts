import { z } from 'zod'
import { httpError, redirect } from '@lntt/scope/http'
import type { CookieSink } from '@lntt/scope/cookies'
import type { UserRegistration } from '../domain/access.ts'
import type { PendingAuth, PendingCookie, SessionCookie } from '../lib/cookies.ts'
import { isError, type TaggedError } from '../lib/errors.ts'
import type { VerifyCodeResult } from '../use-cases/access/verify-code.ts'
import { httpAbortFor } from './respond.ts'

// The login side-effect — a guard owning the whole path (validate the form,
// request the code, set the pending cookie); it declares only the functions it
// calls. The invalid-email branch is a returned `httpError(422, …)` abort: the
// scope model maps a validation failure to a 4xx rather than a 200 domain body.
// Named + typed, so the reject and the code/cookie side-effects are proven
// without the fold — the fake `cookies` sink captures `.apply`. Login has no
// RPC meaning (it rides a browser form + a Set-Cookie response), so this stays
// HTTP-only — no `Rpc` twin.
//
// NO `: … | Abort` return annotation — see `guards.ts`'s `authGuard` for why.
export const loginGuard = async (
  deps: {
    validateEmail(email: string): boolean
    generateId(): string
    access: { requestCode(email: string, nonce?: string): Promise<void> }
    pendingCookie: Pick<PendingCookie, 'apply'>
  },
  ctx: { form: { email: string }; cookies: CookieSink },
) => {
  const email = ctx.form.email
  if (!deps.validateEmail(email)) return httpError(422, { error: 'invalid-email' as const })
  // A fresh anti-replay nonce ties this request to the code the verify step
  // checks; it rides the signed pending cookie, not the response body.
  const nonce = deps.generateId()
  await deps.access.requestCode(email, nonce)
  deps.pendingCookie.apply(ctx.cookies, { email, nonce })
  return {}
}

// The login `.form` schema (design A: the multipart/urlencoded body channel).
// The composed `loginScope` in ../handlers.ts lands the validated form on
// `ctx.form`, carrying the `body` capability so it mounts on the HTTP hosts but
// NOT on tRPC (compile-gated).
export const loginForm = z.object({ email: z.string() })

// ── auth: POST /verify — the transaction-window path + cookie set + redirect ─
// `pendingGuard` (the shared guard) reads the signed pending cookie; no cookie →
// 401. The leaf calls the SHOWCASE windowed leaf `access.verifyCode` (a fresh tx
// per call inside the module): a wrong code RETURNS OtpInvalid (→ 401, the
// attempt increment COMMITS); a db failure THROWS (→ 5xx, the tx ROLLS BACK). On
// success it sets the signed session cookie, drops the pending cookie, and
// RETURNS a redirect — all three ride the outcome. HTTP-only (cookies +
// redirect have no RPC meaning), so no `Rpc` twin.
export const verifyHandler = async (
  deps: {
    access: {
      verifyCode(
        email: string,
        code: string,
        nonce?: string,
        registration?: Omit<UserRegistration, 'email'>,
      ): Promise<VerifyCodeResult | TaggedError>
    }
    sessionCookie: Pick<SessionCookie, 'apply'>
    pendingCookie: Pick<PendingCookie, 'drop'>
  },
  ctx: {
    pending: PendingAuth
    body: { code?: string | undefined; displayName?: string | undefined; termsAccepted?: boolean | undefined }
    cookies: CookieSink
  },
) => {
  // Registration comes from the pending cookie if login captured it, else
  // from this request's body (the new-user completion path).
  const registration: Omit<UserRegistration, 'email'> | undefined =
    ctx.pending.registration ??
    (ctx.body.termsAccepted
      ? {
          termsAccepted: true,
          ...(ctx.body.displayName !== undefined && { displayName: ctx.body.displayName }),
        }
      : undefined)
  const result = await deps.access.verifyCode(
    ctx.pending.email,
    ctx.body.code ?? '',
    ctx.pending.nonce,
    registration,
  )
  if (isError(result)) return httpAbortFor(result)
  deps.sessionCookie.apply(ctx.cookies, result.sessionId)
  deps.pendingCookie.drop(ctx.cookies)
  return redirect(ctx.pending.returnTo ?? '/')
}

// The verify `.body` schema. A NEW user completes registration on the verify
// screen: `displayName` + `termsAccepted` ride the body alongside the code. An
// existing user (or a pending cookie that already carries registration) needs
// neither.
export const verifyBody = z.object({
  code: z.string().optional(),
  displayName: z.string().optional(),
  termsAccepted: z.boolean().optional(),
})

// The same fields as they arrive from an HTML form, where every value is a
// string: a checkbox sends `'on'` (or nothing), never a boolean. The difference
// between a browser form and a JSON body belongs HERE, in the schema, so the
// guard and the handler behind it stay identical.
export const verifyForm = z.object({
  code: z.string().optional(),
  displayName: z.string().optional(),
  termsAccepted: z
    .union([z.literal('on'), z.literal('true')])
    .optional()
    .transform((v) => v !== undefined),
})

// ── auth: POST /logout ──────────────────────────────────────────────────────
// Drops the session cookie through the sink and redirects. A leaf, so the
// composed `logoutScope` in ../handlers.ts is thin wiring.
//
// It does NOT revoke: the session row stays, and `sessionReader` never consults
// the `expiresAt` that `verifyCode` writes, so a copy of the cookie taken before
// the logout still resolves. The 7-day lifetime is enforced only by the cookie's
// own `Max-Age`, which is the client's to ignore. A real app deletes the row
// here and checks expiry on every read; this leaf shows the scope shape and the
// cookie sink, not the session lifecycle.
export const logoutHandler = (deps: { sessionCookie: Pick<SessionCookie, 'drop'> }, ctx: { cookies: CookieSink }) => {
  deps.sessionCookie.drop(ctx.cookies)
  return redirect('/')
}
