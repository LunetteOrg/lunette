// Deliberate deviation from the source's shape (which bundled a
// `mailer.send` service object with the flag inside): the mail concern is
// split along its three rates of change — the PORT (here, stable), the
// ADAPTERS (one per file: http.ts, logging.ts — they grow), and the
// SELECTION POLICY (at the composition root, where choosing
// implementations is the job; decision 29). This module knows no
// implementations.

export type Mail = { to: string; subject: string; body: string }

// The PORT — delivery, with effects. A transport that fails on
// infrastructure THROWS MailSendFailed.
export type Transport = (mail: Mail) => Promise<void>

// The BEHAVIOUR — a bare leaf over the transport: the bindable seam
// (test replace lands here; a retry window would attach here with
// `bind({ sendMail }).with(…)`). The bound shape is what consumers
// declare as their dep.
export type SendMail = (mail: Mail) => Promise<void>

export const sendMail = async (
  deps: { transport: Transport },
  mail: Mail,
): Promise<void> => deps.transport(mail)
