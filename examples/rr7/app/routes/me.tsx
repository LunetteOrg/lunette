import { Form, isRouteErrorResponse, useRouteError } from 'react-router'
import { identityScope, setPreferenceScope } from '@lntt/example-app'
import { toAction, toLoader } from '../bootstrap/index.ts'
import type { Route } from './+types/me'

// A GATED page: the scope's session guard returns a 401 abort for an anonymous
// visitor, which the loader throws — so the ErrorBoundary is the whole "signed
// out" branch, and the component only ever renders for a signed-in member.
export const loader = toLoader(identityScope)
export const action = toAction(setPreferenceScope)

export default function Me({ loaderData }: Route.ComponentProps) {
  const profile = loaderData
  return (
    <main>
      <h1>Your profile</h1>
      <pre>{JSON.stringify(profile, null, 2)}</pre>
      <Form method="post">
        <label>
          Preferred surface <input name="surface" />
        </label>
        <button type="submit">Save</button>
      </Form>
    </main>
  )
}

export function ErrorBoundary() {
  const error = useRouteError()
  if (isRouteErrorResponse(error) && error.status === 401) {
    return (
      <main>
        <h1>Please sign in</h1>
      </main>
    )
  }
  throw error
}
