import { data, Form, useActionData } from 'react-router'
import { z } from 'zod'
import { scope } from '@lntt/scope'
import { body, reactRouter, reactRouterCarrier } from '@lntt/scope/react-router'
import { guards } from '@lntt/scope/guard'
import type { Deps } from '@lntt/example-app'
import { deps } from '../bootstrap/index.ts'
import type { Route } from './+types/posts'

const { action: mount } = reactRouter(deps)

const CreatePostSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
})

// `body('form')`, where the other two entries read `body('json')`, and the
// difference is the HOST rather than a preference: a React Router action is
// what an HTML `<Form>` submits to, so what arrives is
// `application/x-www-form-urlencoded`. Same step, same `.validate` after it —
// the ENCODING is the per-route choice, and the schema does not change because
// form values are strings either way.
export const action = mount(
  scope(reactRouterCarrier())
    .extend(guards)
    .step(
      body('form', (issues) => {
        throw data({ issues }, { status: 422 })
      }),
    )
    .validate('body', CreatePostSchema, (issues) => {
      throw data({ issues }, { status: 422 })
    })
    .step(async ({ posts }: Deps, { body: input }) => posts.createPost(input)),
) satisfies (args: Route.ActionArgs) => unknown

// THE ACTION'S OWN HALF. `useActionData<typeof action>()` reads the action's
// return type the way `useLoaderData` reads a loader's, so what the step handed
// back — the created post — is typed here with nothing annotated.
//
// `<Form method="post">` posts to THIS route's action, which reads it with
// `body('form', …)` — so this really is the pair a React Router app writes,
// not a shape standing in for one.
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
