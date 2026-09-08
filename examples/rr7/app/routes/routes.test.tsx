import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import {
  createStaticHandler,
  createStaticRouter,
  isRouteErrorResponse,
  StaticRouterProvider,
} from 'react-router'
import type { RouteObject } from 'react-router'
import Post, { loader } from './post.tsx'
import { action as publish } from './publish.ts'
import { action as create } from './posts.tsx'
import type { Route as PostRoute } from './+types/post'
import type { Route as PostsRoute } from './+types/posts'
import type { Route as PublishRoute } from './+types/publish'

// The ARGS a route module really receives, at the type React Router generates
// for THIS route from `app/routes.ts` — `params` included, `{ id: string }`
// because the path says `/posts/:id`.
const loaderArgs = (id: string) =>
  ({
    request: new Request(`http://localhost/posts/${id}`),
    params: { id },
    context: {},
  }) as unknown as PostRoute.LoaderArgs

// What a browser really sends to an action: the cookies it holds, never a
// custom header — which is why this host's guard reads a cookie.
const actionArgs = (id: string, cookie?: string) =>
  ({
    request: new Request(`http://localhost/posts/${id}/publish`, {
      method: 'POST',
      ...(cookie ? { headers: { cookie } } : {}),
    }),
    params: { id },
    context: {},
  }) as unknown as PublishRoute.ActionArgs

// A loader or action that stops does it by THROWING — and what `data(v, init)`
// throws is React Router's own `DataWithResponseInit`, not a `Response`. Both
// shapes reach an ErrorBoundary the same way; a test has to read the status off
// whichever it caught.
const statusOfThrown = async (run: () => Promise<unknown>): Promise<number> => {
  try {
    await run()
  } catch (e) {
    if (e instanceof Response) return e.status
    if (isRouteErrorResponse(e)) return e.status
    if (typeof e === 'object' && e !== null && 'init' in e) {
      return (e as { init: ResponseInit | null }).init?.status ?? 200
    }
    throw e
  }
  return expect.unreachable('expected this route to throw')
}

describe('rr7 + scope: the loader', () => {
  it('a known post: the domain result, which is what `useLoaderData` reads', async () => {
    await expect(loader(loaderArgs('1'))).resolves.toMatchObject({ id: '1' })
  })

  it('a malformed id never reaches the domain lookup: 400, from `.validate`', async () => {
    expect(await statusOfThrown(() => loader(loaderArgs('abc')))).toBe(400)
  })

  it('an unknown post, well-formed id: 404, from the domain lookup', async () => {
    expect(await statusOfThrown(() => loader(loaderArgs('999')))).toBe(404)
  })
})

describe('rr7 + scope: the publish action, guarded by the session cookie', () => {
  it('no session cookie: 401, from the guard', async () => {
    expect(await statusOfThrown(() => publish(actionArgs('1')))).toBe(401)
  })

  it('a malformed id: 400 before the guard even runs', async () => {
    const status = await statusOfThrown(() => publish(actionArgs('abc', 'actor=u1')))
    expect(status).toBe(400)
  })

  it('known post, authed: a returned redirect, which React Router follows', async () => {
    const res = await publish(actionArgs('1', 'actor=u1'))
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/posts/1')
  })
})

describe('rr7 + scope: the create action, the form its component submits', () => {
  // WHAT A `<Form>` REALLY SENDS: url-encoded fields, which is what this
  // route's action reads. The express and hono entries post JSON to theirs;
  // the encoding is the host's own shape, not a preference.
  const args = (fields: Record<string, string> | string) =>
    ({
      request: new Request('http://localhost/posts', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: typeof fields === 'string' ? fields : new URLSearchParams(fields).toString(),
      }),
      params: {},
      context: {},
    }) as unknown as PostsRoute.ActionArgs

  it('a valid body: the created post', async () => {
    await expect(create(args({ title: 'New', content: 'Body' }))).resolves.toMatchObject({
      title: 'New',
    })
  })

  it('a well-formed but invalid body: 422, from `.validate`', async () => {
    expect(await statusOfThrown(() => create(args({ title: '' })))).toBe(422)
  })

  it('a body the encoding cannot read: 422 from `body()`’s own reader', async () => {
    // sent as JSON where the action declared `form` — the reader answers,
    // there is no framework parser to race it
    const wrong = {
      request: new Request('http://localhost/posts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"title":"New","content":"Body"}',
      }),
      params: {},
      context: {},
    } as unknown as PostsRoute.ActionArgs

    expect(await statusOfThrown(() => create(wrong))).toBe(422)
  })
})

// WHERE A ROUTE IS CHECKED ON THIS HOST. React Router never hands us a pattern
// — `app/routes.ts` owns that mapping — so no gate of ours can read one. What
// there IS is the typegen: it reads that file and gives each module its own
// `Route.LoaderArgs`, and the mount's own parameter carries what the scope
// VALIDATED. So the `satisfies` a route module already writes does the work,
// by contravariance and with no type of ours in the way.
//
// The negative is a REAL generated type, not a hand-written one: `/posts` is a
// route in this app and its params are `{}`, so the loader that validates `id`
// does not fit it.
describe('rr7 + scope: the typegen checks what the scope validated', () => {
  it('accepts the route whose generated params supply what the schema demands', () => {
    void (loader satisfies (args: PostRoute.LoaderArgs) => unknown)
  })

  it('refuses a route whose generated params supply nothing', () => {
    // @ts-expect-error — `/posts` carries no `:id`; this loader validated one
    void (loader satisfies (args: PostsRoute.LoaderArgs) => unknown)
  })
})

// LOADER THROUGH COMPONENT TO HTML, with React Router's own static handler
// running the whole thing — the real router matching the real path, calling the
// real loader, rendering the real component. No DOM: `createStaticHandler` and
// `renderToString` are the server path, which is where a loader's value lands
// first anyway.
//
// What this proves that a type assertion cannot: the value a step returned is
// the value that reaches the markup, through every layer between.
describe('rr7 + scope: the loader\'s value reaches the rendered HTML', () => {
  // THE CAST IS THE TEST'S SCAFFOLDING, and what it steps around is worth
  // knowing. This loader DEMANDS the params it validated (`{ id: string }`);
  // React Router's generic `RouteObject` supplies the wide `Params`, whose
  // values are `string | undefined`, so the two are not assignable and
  // contravariance says so — the same mechanism that makes the `satisfies`
  // check above work at all.
  //
  // A real app never meets this: `routes.ts` plus the typegen give each route
  // its own params type, which is the narrow one. A route array built by hand
  // is not that, and cannot be. A loader that validates nothing takes the wide
  // `Params` and drops straight in.
  const routes = [
    { path: '/posts/:id', loader, Component: Post },
  ] as unknown as RouteObject[]

  const render = async (url: string) => {
    const handler = createStaticHandler(routes)
    const context = await handler.query(new Request(url))
    if (context instanceof Response) return { status: context.status, html: '' }

    const router = createStaticRouter(handler.dataRoutes, context)
    return {
      status: context.statusCode,
      html: renderToString(<StaticRouterProvider router={router} context={context} />),
    }
  }

  it('renders the post the domain returned', async () => {
    const { status, html } = await render('http://localhost/posts/1')

    expect(status).toBe(200)
    expect(html).toContain('Hello')
    expect(html).toContain('World')
  })

  it('a malformed id never renders: the thrown 400 goes to the boundary', async () => {
    const { status, html } = await render('http://localhost/posts/abc')

    expect(status).toBe(400)
    expect(html).not.toContain('Hello')
  })
})
