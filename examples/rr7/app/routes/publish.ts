import { data, redirect } from 'react-router'
import { z } from 'zod'
import { scope } from '@lntt/scope'
import { cookies, reactRouter, reactRouterCarrier, type Cookies } from '@lntt/scope/react-router'
import { fail, guards } from '@lntt/scope/guard'
import type { Deps } from '@lntt/example-app'
import { deps } from '../bootstrap/index.ts'
import type { Route } from './+types/publish'

const { action: mount } = reactRouter(deps)

const IdParam = z.object({ id: z.string().regex(/^\d+$/, 'must be numeric') })

// THE ACTOR COMES FROM A COOKIE HERE, where `examples/express` and
// `examples/hono` read a header — and the difference is the HOST, not a
// preference. This action is what a `<Form>` on the post page submits to, and
// a browser form cannot set a custom header; a session cookie is what it does
// send. An API entry has the opposite default, which is why those two read
// `x-actor-id`.
//
// What travels between the three is the SHAPE: a check that returns an
// enrichment or `fail`, named by the ENTRY it reads and by nothing else. Swap
// which read extension fills that entry and the guard follows the host without
// learning anything about it.
const findActor = (_app: {}, { cookies: c }: { readonly cookies: Cookies }) =>
  c['actor'] ? { actor: c['actor'] } : fail([{ message: 'unauthorized' }])

export const action = mount(
  scope(reactRouterCarrier())
    .extend(guards)
    .validate('params', IdParam, (issues) => {
      throw data({ issues }, { status: 400 })
    })
    .step(cookies)
    .guard(findActor, (issues) => {
      throw data({ issues }, { status: 401 })
    })
    .step(async ({ posts }: Deps, { params }) => {
      const result = posts.publishPost(params.id)
      if ('notFound' in result) throw data({ error: 'not found' }, { status: 404 })
      // RETURNED, and here that is right: React Router follows a returned
      // `redirect()` — it is a Response, which is what a loader or action is
      // allowed to hand back. The `throw` above is for the answers that must
      // reach an ErrorBoundary instead.
      return redirect(`/posts/${result.id}`)
    }),
) satisfies (args: Route.ActionArgs) => unknown
