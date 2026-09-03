import { describe, expect, it } from 'vitest'
import { data, redirect } from 'react-router'
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router'
import { scope, type Next } from '../index.ts'
import { reactRouter, reactRouterCarrier } from './index.ts'

// A guard, written here rather than imported: what a guard IS belongs to no
// carrier (§43). It stops the way React Router stops — a THROWN `data(...)`.
const requireActor = async (
  _app: {},
  { request }: { readonly request: Request },
  next: Next<{ actor: string }>,
) => {
  const actor = request.headers.get('x-actor-id')
  if (actor === null) throw data({ error: 'unauthorized' }, { status: 401 })
  return next({ actor })
}

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

describe('the React Router carrier: what a run brings', () => {
  it('hands a loader `request` and `params`, and the app the deps it was curried with', async () => {
    const { loader: mount } = reactRouter({ greeting: 'hello' })

    const loader = mount(
      scope(reactRouterCarrier).step(async ({ greeting }: { readonly greeting: string }, { params }) => ({
        said: `${greeting} ${params.id!}`,
      })),
    )

    expect(await loader(loaderArgs('ada'))).toEqual({ said: 'hello ada' })
  })

  it('hands an action the same pair: one carrier, two mounts', async () => {
    const { action: mount } = reactRouter({})

    const action = mount(
      scope(reactRouterCarrier).step(async (_app: {}, { request }) => ({
        method: request.method,
      })),
    )

    expect(await action(actionArgs('1', { method: 'POST' }))).toEqual({ method: 'POST' })
  })
})

describe('the React Router carrier: stopping is the host\'s own door', () => {
  const { action: mount } = reactRouter({})

  const action = mount(
    scope(reactRouterCarrier)
      .step(requireActor)
      .step(async (_app: {}, { params }: { readonly params: { readonly id?: string } }) =>
        redirect(`/posts/${params.id!}`),
      ),
  )

  it('a step that stops THROWS a data() envelope, and the leaf never runs', async () => {
    const err = await thrown(() => action(actionArgs('1', { method: 'POST' })))
    expect(err).toMatchObject({ data: { error: 'unauthorized' }, init: { status: 401 } })
  })

  it('what the leaf returned is handed back whole: a real redirect Response', async () => {
    const res = await action(actionArgs('1', { method: 'POST', headers: { 'x-actor-id': 'u1' } }))
    expect(res).toBeInstanceOf(Response)
    expect((res as Response).status).toBe(302)
    expect((res as Response).headers.get('location')).toBe('/posts/1')
  })
})
