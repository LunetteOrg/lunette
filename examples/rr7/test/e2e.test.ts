import { createRequestHandler } from 'react-router'
import { beforeAll, describe, expect, it } from 'vitest'

// End-to-end against the REAL app: the built React Router server, driven through
// the framework's own request handler. Routing, the route modules, the entry and
// the rendering are all React Router's — what the test proves is that scopes
// mounted as loaders and actions behave as an APP, HTML included.
//
// Scope-level behaviour is NOT retested here: the scopes are unit-tested with
// fake deps in @lntt/example-app and the fold in @lntt/scope. This file answers
// only "does it work as a React Router app".
process.env['DEV_MAIL_OUTBOX'] = '1'

let handle: (request: Request) => Promise<Response>

const cookie = (res: Response, name: string): string => {
  const all = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? '']
  return all.map((c) => c.split(';')[0] ?? '').find((c) => c.startsWith(`${name}=`)) ?? ''
}

const get = (path: string, session?: string) =>
  handle(new Request(`http://localhost${path}`, session ? { headers: { cookie: session } } : {}))

const post = (path: string, body: FormData, session?: string) =>
  handle(
    new Request(`http://localhost${path}`, {
      method: 'POST',
      body,
      ...(session ? { headers: { cookie: session } } : {}),
    }),
  )

beforeAll(async () => {
  // The built server carries no type declarations — it is a build artefact.
  // @ts-expect-error untyped build output
  const build = await import('../build/server/index.js')
  handle = createRequestHandler(build as never, 'production')
})

describe('example-app as a React Router 7 app', () => {
  it('renders a page whose data comes from a scope', async () => {
    const res = await get('/')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    const html = await res.text()
    // the loader returned the leaf's value, and the component rendered it
    expect(html).toContain('React Router 7')
    expect(html).toContain('No posts yet.')
  })

  it('carries the cache policy declared at the wiring', async () => {
    // `.headers({...})` on the route's scope, not inside the domain handler
    const res = await get('/')
    expect(res.headers.get('cache-control')).toBe('public, max-age=30')
  })

  it('serves a non-JSON body from a route composed on top of the loader', async () => {
    const res = await get('/feed.csv')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    expect(res.headers.get('content-disposition')).toContain('feed.csv')
    expect(await res.text()).toContain('id,title')
  })

  it('lets a leaf speak React Router directly, effects merged in', async () => {
    // the ordinary path through the same scope
    expect(await (await get('/native')).json()).toEqual({ via: 'the ordinary path', posts: 0 })

    // `data(..., { status })` from the leaf: the status survives, and the cookie
    // the sink collected rides along instead of overwriting it
    const accepted = await get('/native?accepted=1')
    expect(accepted.status).toBe(202)
    expect(await accepted.json()).toEqual({ queued: true, posts: 0 })
    expect(accepted.headers.get('set-cookie')).toContain('seen=1')

    // a Response built by hand
    const text = await get('/native?text=1')
    expect(text.headers.get('content-type')).toContain('text/plain')
    expect(await text.text()).toBe('') // an empty feed renders as an empty body

    // a thrown redirect travels straight past the fold
    const away = await get('/native?go=away')
    expect(away.status).toBe(302)
    expect(away.headers.get('location')).toBe('/')
  })

  it('renders a thrown abort through the route ErrorBoundary', async () => {
    const res = await get('/posts/does-not-exist')
    // RR7 turns the thrown status abort into an error response for the boundary
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('Post not found')
  })

  it('renders the 401 from the session gate as the signed-out page', async () => {
    const res = await get('/me')
    expect(res.status).toBe(401)
    expect(await res.text()).toContain('Please sign in')
  })

  it('signs in from an HTML form, publishes, and shows the post in the feed', async () => {
    const login = await post('/login', formOf({ email: 'e2e-rr7@example.com' }))
    expect(login.status).toBe(200)
    const pending = cookie(login, 'pending-auth')
    expect(pending).toMatch(/^pending-auth=/)

    // the OTP, read through the app's own dev route
    const sent = (await (await get('/dev/outbox')).json()) as { body: string } | null
    const code = /code is (\d+)/.exec(sent?.body ?? '')?.[1] ?? ''
    expect(code).toMatch(/^\d+$/)

    const verify = await post(
      '/verify',
      formOf({ code, displayName: 'E2E', termsAccepted: 'on' }),
      pending,
    )
    // the scope's redirect intent, carrying the session cookie
    expect(verify.status).toBe(302)
    const session = cookie(verify, 'session')
    expect(session).toMatch(/^session=/)

    const publish = await post(
      '/posts/new',
      formOf({ title: 'Hello from a form', body: 'Posted by an HTML form' }),
      session,
    )
    expect(publish.status).toBe(200)

    const feed = await get('/', session)
    const html = await feed.text()
    expect(html).toContain('Hello from a form')
  })

  it('gates the profile page open once signed in', async () => {
    const login = await post('/login', formOf({ email: 'gated-rr7@example.com' }))
    const pending = cookie(login, 'pending-auth')
    const sent = (await (await get('/dev/outbox')).json()) as { body: string } | null
    const code = /code is (\d+)/.exec(sent?.body ?? '')?.[1] ?? ''
    const verify = await post(
      '/verify',
      formOf({ code, displayName: 'Gated', termsAccepted: 'on' }),
      pending,
    )
    const session = cookie(verify, 'session')

    const me = await get('/me', session)
    expect(me.status).toBe(200)
    expect(await me.text()).toContain('Your profile')
  })
})

function formOf(fields: Record<string, string>): FormData {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) form.set(key, value)
  return form
}
