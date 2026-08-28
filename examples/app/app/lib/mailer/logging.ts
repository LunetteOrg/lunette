import type { Transport } from './index.ts'

// The demo-path sink: delivery is a console line. The selection policy at
// the composition root falls back to this when no API key is configured.
export const loggingTransport = (): Transport => async (mail) => {
  console.log(`[mail] to=${mail.to} subject=${mail.subject}`)
}
