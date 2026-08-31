import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Express } from 'express'

// One listening server on an ephemeral port, shared by the three suites in this
// package. It lived in three copies, and one of them already said "its sibling
// shares this setup" while copying it — the drift was waiting to happen.
//
// Intra-package only: the other example apps keep their own, because sharing
// ACROSS entries would make one example depend on another (§37).
export const start = async (app: Express) => {
  const server = createServer(app)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://localhost:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}
