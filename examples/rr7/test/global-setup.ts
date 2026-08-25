import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

// Build the real React Router app once before the suite: the e2e test drives
// `build/server/index.js` through React Router's own request handler, so what it
// exercises is the framework's routing, not a hand-rolled imitation.
export default async function setup() {
  await promisify(execFile)('pnpm', ['exec', 'react-router', 'build'], {
    cwd: new URL('..', import.meta.url).pathname,
  })
}
