import { MailSendFailed } from '../errors.ts'
import type { Transport } from './index.ts'

// The real provider — an anonymized HTTP mail API. Fails on infrastructure
// by THROWING MailSendFailed. Swapping vendors means adding a sibling file
// and touching the selection at the composition root — never this one.
export const httpTransport =
  (apiKey: string): Transport =>
  async (mail) => {
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
  }
