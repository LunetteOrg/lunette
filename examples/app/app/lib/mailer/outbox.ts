import type { Mail, Transport } from './index.ts'

// The dev outbox: sent mail is captured IN MEMORY (a module singleton) instead
// of delivered, so a dev tool — or an end-to-end test — can read back what
// "went out" (e.g. the sign-in code). Selected at the composition root when
// DEV_MAIL_OUTBOX is set; forbidden in production (see config/env.ts). It also
// logs a line, so it degrades gracefully to the console like the plain sink.
export const outbox: Mail[] = []

export const outboxTransport = (): Transport => async (mail) => {
  outbox.push(mail)
  console.log(`[mail:outbox] to=${mail.to} subject=${mail.subject}`)
}
