import { data, redirect } from 'react-router'
import { describe, expectTypeOf, it } from 'vitest'
import { scope } from '@lntt/scope'
import { reactRouter, reactRouterCarrier } from '@lntt/scope/react-router'
import { guards } from '@lntt/scope/guard'
import { z } from 'zod'

// THE TYPE CONTRACT: the mount is TRANSPARENT. React Router reads a route
// module's types off what its loader and action RETURN —
// `useLoaderData<typeof loader>()` is exactly that read — so a wrapper that
// declares `unknown` silently erases the whole route's data type.

const { loader: mountLoader, action: mountAction } = reactRouter({})

// The carrier declares nothing about the params: they arrive at React
// Router's own width, and a scope that wants a narrower one says so in a schema
// — per BRANCH, which is what lets one base value serve two routes.
const carrier = reactRouterCarrier()

// `onError` THROWS, which is React Router's own door for a step that stops (a
// thrown `data(...)` reaches the ErrorBoundary where a returned one renders
// normally) — and it keeps the mount's return type the leaf's alone.
const byId = scope(carrier)
  .extend(guards)
  .validate('params', z.object({ id: z.string() }), (issues) => {
    throw data({ issues }, { status: 400 })
  })

describe('what a route module sees', () => {
  it('carries the leaf\'s value through the loader', () => {
    const loader = mountLoader(
      byId.step(async (_app: {}, { params }) => ({ id: params.id, title: 'x' })),
    )

    expectTypeOf<Awaited<ReturnType<typeof loader>>>().toEqualTypeOf<{
      id: string
      title: string
    }>()
  })

  it('carries a UNION when the steps answer in more than one way', () => {
    const action = mountAction(
      byId
        .step(async (_app: {}, { params }) =>
          params.id === '' ? data({ error: 'bad' }, { status: 422 }) : redirect('/posts'),
        ),
    )

    type Answered = Awaited<ReturnType<typeof action>>
    expectTypeOf<Answered>().toEqualTypeOf<ReturnType<typeof data<{ error: string }>> | Response>()
  })

  it('types `params` off the SCHEMA, so a step needs no `!` and no annotation', () => {
    byId.step(async (_app: {}, { params }) => {
      expectTypeOf(params.id).toEqualTypeOf<string>()
      return params.id
    })

    // and without one it is React Router's own width, which is what a route
    // really hands a loader
    scope(carrier).step(async (_app: {}, { params }) => {
      expectTypeOf(params.id).toEqualTypeOf<string | undefined>()
      return params.id
    })
  })

  it('a BASE scope serves two routes reading DIFFERENT params', () => {
    // THE REASON THE DECLARATION WENT. A type argument is fixed at
    // `scope(carrier<X>())`, so every branch inherits it and this could not be
    // written: one base, two schemas, two routes.
    const base = scope(carrier).extend(guards)

    const one = base.validate('params', z.object({ id: z.string() }), () => data(null))
    const two = base.validate('params', z.object({ slug: z.string() }), () => data(null))

    one.step(async (_app: {}, { params }) => params.id)
    two.step(async (_app: {}, { params }) => params.slug)
  })
})

describe('the params a scope VALIDATED ride the mount, so RR7\'s typegen checks them', () => {
  // React Router hands us no pattern — `routes.ts` owns that mapping — so the
  // check is the route module's own `satisfies`, and contravariance does it.
  type LoaderArgs = { request: Request; params: { id: string }; context: unknown }
  type OtherArgs = { request: Request; params: { slug: string }; context: unknown }

  it('accepts a route whose generated params supply what the schema demands', () => {
    const loader = mountLoader(byId.step(async (_app: {}, { params }) => params.id))
    void (loader satisfies (args: LoaderArgs) => unknown)
  })

  it('refuses a route whose generated params supply something else', () => {
    const loader = mountLoader(byId.step(async (_app: {}, { params }) => params.id))
    // @ts-expect-error — the route supplies `slug`, the scope validated `id`
    void (loader satisfies (args: OtherArgs) => unknown)
  })

  it('a scope validating nothing fits any route', () => {
    const anyRoute = mountLoader(scope(carrier).step(async () => 'ok'))
    void (anyRoute satisfies (args: LoaderArgs) => unknown)
    void (anyRoute satisfies (args: OtherArgs) => unknown)
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
