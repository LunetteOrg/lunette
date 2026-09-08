import { data, Form, useActionData } from 'react-router'
import { z } from 'zod'
import { scope } from '@lntt/scope'
import { body, reactRouter, reactRouterCarrier } from '@lntt/scope/react-router'
import { guards } from '@lntt/scope/guard'
import type { Deps } from '@lntt/example-app'
import { deps } from '../bootstrap/index.ts'

const { action: mount } = reactRouter(deps)

const CreatePostSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
})

// The SAME two steps `examples/express` and `examples/hono` use for a body,
// against a Fetch `Request` instead of a Node stream — the read extension is
// the half that knows which host it is on, and it is the only half.
export const action = mount(
  scope(reactRouterCarrier())
    .extend(guards)
    .step(
      body('json', (issues) => {
        throw data({ issues }, { status: 422 })
      }),
    )
    .validate('body', CreatePostSchema, (issues) => {
      throw data({ issues }, { status: 422 })
    })
    .step(async ({ posts }: Deps, { body: input }) => posts.createPost(input)),
)

// THE ACTION'S OWN HALF. `useActionData<typeof action>()` reads the action's
// return type the way `useLoaderData` reads a loader's, so what the step handed
// back — the created post — is typed here with nothing annotated.
//
// `<Form method="post">` posts to THIS route's action. The action reads the
// body with `body('json', …)`, so a real form would submit JSON through
// `useSubmit`; the plain form below is the shape, not a working submit.
export default function NewPost() {
  const created = useActionData<typeof action>()

  return (
    <section>
      {created ? <p data-created={created.id}>{created.title}</p> : null}
      <Form method="post">
        <input name="title" />
        <input name="content" />
        <button type="submit">create</button>
      </Form>
    </section>
  )
}
