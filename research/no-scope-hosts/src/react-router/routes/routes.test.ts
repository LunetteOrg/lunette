import { describe, expect, it } from 'vitest'
import { isRouteErrorResponse, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router'
import { loader } from './post.ts'
import { action as publish } from './publish.ts'
import { action as create } from './posts.ts'

const loaderArgs = (id: string): LoaderFunctionArgs =>
  ({
    request: new Request(`http://localhost/posts/${id}`),
    params: { id },
    context: {},
  }) as unknown as LoaderFunctionArgs

const actionArgs = (id: string, init: RequestInit): ActionFunctionArgs =>
  ({
    request: new Request(`http://localhost/posts/${id}/publish`, init),
    params: { id },
    context: {},
  }) as unknown as ActionFunctionArgs

// `publish` is synchronous — its `throw` fires before `expect` receives a
// promise, so `.rejects` cannot see it.
const thrown = (fn: () => unknown): unknown => {
  try {
    fn()
    return undefined
  } catch (err) {
    return err
  }
}

describe('react-router: a domain "not found" said the way Hono/Express taught — RETURNED', () => {
  it('a known post: the post', async () => {
    const result = await loader(loaderArgs('1'))
    expect(result).toMatchObject({ id: '1' })
  })

  it('SILENT: an unknown post is a plain 200-shaped return, not routed to an ErrorBoundary', async () => {
    const result = await loader(loaderArgs('missing'))
    expect(isRouteErrorResponse(result)).toBe(false)
    const envelope = result as { data: unknown; init?: { status?: number } }
    expect(envelope.data).toBeNull()
    expect(envelope.init?.status).toBe(404)
  })
})

describe('react-router: auth throws; redirect is native', () => {
  // `isRouteErrorResponse` recognises a thrown Response the ROUTER converts
  // during real navigation, not a raw call to the action function — what
  // actually crosses the `throw` here is data()'s own envelope shape.
  it('no actor header: throws a data() envelope with status 401', () => {
    expect(thrown(() => publish(actionArgs('1', { method: 'POST' })))).toMatchObject({
      data: { error: 'unauthorized' },
      init: { status: 401 },
    })
  })

  it('unknown post, authed: throws a data() envelope with status 404', () => {
    expect(
      thrown(() => publish(actionArgs('missing', { method: 'POST', headers: { 'x-actor-id': 'u1' } }))),
    ).toMatchObject({ data: { error: 'not found' }, init: { status: 404 } })
  })

  it('known post, authed: returns a real Response redirecting to the post', async () => {
    const res = await publish(actionArgs('1', { method: 'POST', headers: { 'x-actor-id': 'u1' } }))
    expect(res).toBeInstanceOf(Response)
    expect((res as Response).status).toBe(302)
    expect((res as Response).headers.get('location')).toBe('/posts/1')
  })
})

describe('react-router: hand-rolled validation, copied near-verbatim from Hono', () => {
  const postsArgs = (body: BodyInit): ActionFunctionArgs =>
    ({
      request: new Request('http://localhost/posts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      }),
      params: {},
      context: {},
    }) as unknown as ActionFunctionArgs

  it('a valid body: creates the post', async () => {
    const result = await create(postsArgs(JSON.stringify({ title: 'New', content: 'Body' })))
    expect(result).toMatchObject({ title: 'New' })
  })

  it('a well-formed but invalid body: a returned 422', async () => {
    const result = await create(postsArgs(JSON.stringify({ title: '' })))
    const envelope = result as { init?: { status?: number } }
    expect(envelope.init?.status).toBe(422)
  })

  it('SILENT: a body that fails to arrive is answered exactly like a malformed one', async () => {
    const args = postsArgs('{not json')
    args.request.json = () => Promise.reject(new Error('socket reset by peer'))
    const result = await create(args)
    const envelope = result as { init?: { status?: number } }
    expect(envelope.init?.status).toBe(422)
  })
})
