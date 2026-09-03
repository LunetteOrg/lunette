import { describe, expect, it } from 'vitest'
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router'
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

const thrown = async (fn: () => unknown): Promise<unknown> => {
  try {
    await fn()
    return undefined
  } catch (err) {
    return err
  }
}

describe('react-router + scope: a domain "not found" — THROWN this time, not returned', () => {
  it('a known post: the post', async () => {
    const result = await loader(loaderArgs('1'))
    expect(result).toMatchObject({ id: '1' })
  })

  it('an unknown post: throws a data() envelope with status 404', async () => {
    const err = (await thrown(() => loader(loaderArgs('missing')))) as { data: unknown; init?: { status?: number } }
    expect(err.data).toBeNull()
    expect(err.init?.status).toBe(404)
  })
})

describe('react-router + scope: the SHARED guard; redirect is native', () => {
  it('no actor header: throws a data() envelope with status 401', async () => {
    const err = (await thrown(() => publish(actionArgs('1', { method: 'POST' })))) as {
      data: unknown
      init?: { status?: number }
    }
    expect(err).toMatchObject({ data: { error: 'unauthorized' }, init: { status: 401 } })
  })

  it('unknown post, authed: throws a data() envelope with status 404', async () => {
    const err = await thrown(() =>
      publish(actionArgs('missing', { method: 'POST', headers: { 'x-actor-id': 'u1' } })),
    )
    expect(err).toMatchObject({ data: { error: 'not found' }, init: { status: 404 } })
  })

  it('known post, authed: returns a real Response redirecting to the post', async () => {
    const res = await publish(actionArgs('1', { method: 'POST', headers: { 'x-actor-id': 'u1' } }))
    expect(res).toBeInstanceOf(Response)
    expect((res as Response).status).toBe(302)
    expect((res as Response).headers.get('location')).toBe('/posts/1')
  })
})

describe('react-router + scope: the SHARED validator', () => {
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

  it('a genuine read failure THROWS from jsonBody, distinct from validated\'s own 422', async () => {
    const args = postsArgs('{not json')
    args.request.json = () => Promise.reject(new Error('socket reset by peer'))
    await expect(create(args)).rejects.toThrow('socket reset by peer')
  })
})
