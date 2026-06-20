import type { Env } from '../../config/env.ts'
import { MailSendFailed } from '../errors.ts'

export type Mail = { to: string; subject: string; body: string }

// Infra port: a send that fails on infrastructure THROWS MailSendFailed.
export type Mailer = { send(mail: Mail): Promise<void> }

// Feature flag — presence of the API key selects the real sender; otherwise a
// logging sink (the demo path). The real branch is never hit in tests (no key).
export const mailer = ({ env }: { env: Env }): Mailer =>
  env.MAILER_API_KEY ? realMailer(env.MAILER_API_KEY) : loggingMailer()

const realMailer = (apiKey: string): Mailer => ({
  async send(mail) {
    try {
      const res = await fetch('https://mail.example/send', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(mail),
      })
      if (!res.ok) throw new Error(`mail provider returned ${res.status}`)
    } catch (cause) {
      throw new MailSendFailed({ cause })
    }
  },
})

const loggingMailer = (): Mailer => ({
  async send(mail) {
    console.log(`[mail] to=${mail.to} subject=${mail.subject}`)
  },
})
