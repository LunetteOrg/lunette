import { data, useLoaderData } from 'react-router'
import { z } from 'zod'
import { scope } from '@lntt/scope'
import { reactRouter, reactRouterCarrier } from '@lntt/scope/react-router'
import { guards } from '@lntt/scope/guard'
import type { Deps } from '@lntt/example-app'
import { deps } from '../bootstrap/index.ts'

const { loader: mount } = reactRouter(deps)

// NO READ EXTENSION for the params here, unlike Express and Hono: React Router
// hands a loader `{ request, params }` already, so `params` is what the run
// BRINGS and `validate` has an entry to refine on the bare carrier.
//
// And refining it is the only way to get a `string`: React Router's own
// `Params` values are `string | undefined`, so a scope that validates nothing
// reads `params.id` at that width — which is honest, since a loader really can
// be called for a route that never carried the name.
const IdParam = z.object({ id: z.string().regex(/^\d+$/, 'must be numeric') })

// THROWN, not returned: a RETURNED `data(null, { status: 404 })` renders
// normally, where a thrown one routes to the ErrorBoundary. Nothing in the
// library guards against writing `return` here by mistake — the two are the
// same type — so the choice stays the author's, and it is the host's own
// convention rather than the library's error rule.
export const loader = mount(
  scope(reactRouterCarrier())
    .extend(guards)
    .validate('params', IdParam, (issues) => {
      throw data({ issues }, { status: 400 })
    })
    .step(async ({ posts }: Deps, { params }) => {
      const result = posts.getPost(params.id)
      if ('notFound' in result) throw data({ error: 'not found' }, { status: 404 })
      return result
    }),
)

// THE ROUTE MODULE'S OTHER HALF, and the reason the mount is transparent at
// all. `useLoaderData<typeof loader>()` reads the loader's return type — so
// what a step handed back reaches the component with no annotation and no
// cast. A mount declared `unknown` would serve the same bytes and leave this
// line, and the whole route's data, untyped.
export default function Post() {
  const post = useLoaderData<typeof loader>()

  return (
    <article>
      <h1>{post.title}</h1>
      <p>{post.content}</p>
      {post.published ? <span data-published="yes">published</span> : null}
    </article>
  )
}
