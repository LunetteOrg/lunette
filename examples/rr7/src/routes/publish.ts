import { data, redirect } from 'react-router'
import { z } from 'zod'
import { scope } from '@lntt/scope'
import { headers, reactRouter, reactRouterCarrier, type HeaderEntries } from '@lntt/scope/react-router'
import { fail, guards } from '@lntt/scope/guard'
import type { Deps } from '@lntt/example-app'
import { deps } from '../bootstrap/index.ts'

const { action: mount } = reactRouter(deps)

const IdParam = z.object({ id: z.string().regex(/^\d+$/, 'must be numeric') })

// THE SAME GUARD as `examples/express` and `examples/hono`, character for
// character. It names no carrier — only the `headers` entry a read extension
// populates — so the third host takes it unchanged. The extraction is per
// host; everything downstream of it is not.
const findActor = (_app: {}, { headers: h }: { readonly headers: HeaderEntries }) =>
  h['x-actor-id'] ? { actor: h['x-actor-id'] } : fail([{ message: 'unauthorized' }])

export const action = mount(
  scope(reactRouterCarrier())
    .extend(guards)
    .validate('params', IdParam, (issues) => {
      throw data({ issues }, { status: 400 })
    })
    .step(headers)
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
)
