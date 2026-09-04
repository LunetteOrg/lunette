import { data, redirect } from 'react-router'
import { describe, expectTypeOf, it } from 'vitest'
import { scope } from '../index.ts'
import { reactRouter, reactRouterCarrier } from './index.ts'

// THE TYPE CONTRACT: the mount is TRANSPARENT. React Router reads a route
// module's types off what its loader and action RETURN —
// `useLoaderData<typeof loader>()` is exactly that read — so a wrapper that
// declares `unknown` silently erases the whole route's data type.

const { loader: mountLoader, action: mountAction } = reactRouter({})

// The params a route supplies, declared on the carrier. In an RR7 app this is
// `Route.LoaderArgs['params']`, straight from its own typegen.
const carrier = reactRouterCarrier<{ id: string }>()

describe('what a route module sees', () => {
  it('carries the leaf\'s value through the loader', () => {
    const loader = mountLoader(
      scope(carrier).step(async (_app: {}, { params }) => ({ id: params.id, title: 'x' })),
    )

    expectTypeOf<Awaited<ReturnType<typeof loader>>>().toEqualTypeOf<{
      id: string
      title: string
    }>()
  })

  it('carries a UNION when the steps answer in more than one way', () => {
    const action = mountAction(
      scope(carrier)
        .step(async (_app: {}, { params }) =>
          params.id === '' ? data({ error: 'bad' }, { status: 422 }) : redirect('/posts'),
        ),
    )

    type Answered = Awaited<ReturnType<typeof action>>
    expectTypeOf<Answered>().toEqualTypeOf<ReturnType<typeof data<{ error: string }>> | Response>()
  })

  it('types `params` off the carrier, so a step needs no `!` and no annotation', () => {
    scope(carrier).step(async (_app: {}, { params }) => {
      expectTypeOf(params.id).toEqualTypeOf<string>()
      return params.id
    })
  })
})

describe('the mounts owe the scope its chain: `DepGuard` rides both mounts', () => {
  // The deps are curried at `reactRouter({})`, so a scope demanding a `db` is
  // refused at the mount, exactly as a direct call is — and not on the first
  // request, where the step would destructure it off `{}`.
  const needsDb = scope(carrier).step(async ({ db }: { readonly db: string }) => ({ db }))

  it('refuses a scope the curried chain does not satisfy', () => {
    // @ts-expect-error __ERROR_chain_Pub_missing_deps
    mountLoader(needsDb)
    // @ts-expect-error __ERROR_chain_Pub_missing_deps
    mountAction(needsDb)
  })

  it('accepts it on a chain that does — a superset passes, as everywhere', () => {
    const { loader, action } = reactRouter({ db: 'pg', extra: 1 })
    loader(needsDb)
    action(needsDb)
  })
})
