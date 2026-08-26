import { createTestHarness } from 'wrangler'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// TWO ways the same environment reaches the same chain, asserted to be
// indistinguishable from outside:
//
//   src/config/env.ts           `import { env } from 'cloudflare:workers'`, at module scope
//   src/config/env-from-host.ts Hono's per-request `c.env`, through `seedFrom(hostEnv)`
//
// Two real workers, each with its own KV namespace so neither can borrow the
// other's state, driven through the same sequence.
//
// WHAT THIS CANNOT PROVE, stated because the reading is tempting: not that the
// second worker uses `seedFrom`'s parameter. Within one worker, `c.env` and
// `import { env } from 'cloudflare:workers'` are the SAME bindings object, and
// both wrangler configs carry the same vars — so no response distinguishes the
// two paths, and this file stays green even if the second bootstrap silently
// ignores its parameter. What the parameter receives is asserted where it CAN be
// observed, against the pack: `packages/integration/test/hono.test.ts`.
//
// What it does prove: both wirings produce a working app, behaving alike down to
// the status of every step — so on this runtime an app does not need the
// parameter to reach its bindings, the config module being enough.
const server = createTestHarness({
  workers: [
    { configPath: './wrangler.jsonc' },
    { configPath: './wrangler.from-host-env.jsonc' },
  ],
})

const fromModuleScope = () => server.getWorker('lntt-example-workers-hono')
const fromHostEnv = () => server.getWorker('lntt-example-workers-hono-from-host-env')

interface Snapshot {
  readonly status: number
  readonly body: unknown
}

// Typed off the harness's own return rather than naming `Response`: this file
// runs in NODE while the package's ambient globals are workerd's, so the two
// `Response` types in scope are not the same one.
type HarnessResponse = Awaited<ReturnType<typeof server.fetch>>

const snapshot = async (res: HarnessResponse): Promise<Snapshot> => ({
  status: res.status,
  body: await res.json().catch(() => null),
})

// The same sequence against one worker. It seeds through the app's OWN write
// path, so it needs nothing from outside — which is also what makes it fair:
// each worker builds its store from an empty namespace and fills it itself.
const drive = async (worker: ReturnType<typeof fromModuleScope>): Promise<Snapshot[]> => {
  const post = (payload: unknown) =>
    worker.fetch('http://example.com/links', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })

  const out = [
    // empty to begin with — the store was built from an empty namespace
    await worker.fetch('http://example.com/links'),
    // the write, through the declared `.body` channel
    await post({ slug: 'home', url: 'https://workers.cloudflare.com' }),
    // read it back: the app sees its own write
    await worker.fetch('http://example.com/links/home'),
    await worker.fetch('http://example.com/links'),
    // the same slug again → a RETURNED domain error, not a throw
    await post({ slug: 'home', url: 'https://example.com/other' }),
    // a body that fails the schema → 422 from the channel's validation
    await post({ slug: '', url: 'not-a-url' }),
    // and the environment, which is the axis under test
    await worker.fetch('http://example.com/about'),
  ]

  const snapshots: Snapshot[] = []
  for (const res of out) snapshots.push(await snapshot(res))
  return snapshots
}

beforeAll(async () => {
  await server.listen()
})

afterAll(async () => {
  await server.close()
})

describe('cloudflare:workers vs Hono’s c.env, on the same chain', () => {
  it('answers identically on every step, writes included', async () => {
    const viaModuleScope = await drive(fromModuleScope())
    const viaHostEnv = await drive(fromHostEnv())

    expect(viaHostEnv).toEqual(viaModuleScope)
    // and the responses are the expected ones, not two matching mistakes
    expect(viaHostEnv.map((s) => s.status)).toEqual([200, 200, 200, 200, 409, 422, 200])
    expect(viaHostEnv[6]).toMatchObject({ body: { label: 'hono on workers' } })
  })
})
