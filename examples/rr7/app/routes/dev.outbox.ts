import { outbox } from '@lntt/example-app'

// A hand-written resource route, no scope involved — proof that @lntt routes
// and ordinary RR7 routes coexist, and the channel the e2e test reads the OTP
// from (the built server has its own module instance, so the test cannot reach
// the outbox directly). Dev-only: without DEV_MAIL_OUTBOX there is nothing to
// serve, and the route refuses.
export function loader() {
  if (process.env['DEV_MAIL_OUTBOX'] !== '1') return new Response(null, { status: 404 })
  return Response.json(outbox.at(-1) ?? null)
}
