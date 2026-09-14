import type { Server } from 'node:http'
import { afterEach } from 'vitest'
import supertest from 'supertest'

// A LISTENING server the suite owns, handed to supertest already bound.
//
// Given a function, supertest listens on an ephemeral port per REQUEST and
// closes that server once the response completes. The URL it builds carries the
// port read at construction, and the connection lands a moment later: with
// several of these churning at once the port can by then belong to a different
// server, and the answer comes back from an app that never had the route — a
// 404 where this suite's own app would have answered. Measured at two failures
// in thirty-two concurrent runs of one file, always a 404, never a wrong body.
//
// Handed a server that is already listening, supertest neither listens nor
// closes — it closes only one it opened itself — so the port stays this test's
// for its whole length and is released once, here.
const open: Server[] = []

export const served = (app: unknown) => {
  const server = (app as { listen: Server['listen'] }).listen(
    0,
    '127.0.0.1',
  ) as unknown as Server
  open.push(server)
  return supertest(server)
}

afterEach(async () => {
  await Promise.all(
    open
      .splice(0)
      .map((server) => new Promise((done) => server.close(() => done(null)))),
  )
})
