import { Form } from 'react-router'
import { verifyFormScope } from '@lntt/example-app'
import { toAction } from '../bootstrap/index.ts'

// The second auth step, reading the browser form (`verifyFormScope`; the
// JSON-shaped `verifyScope` is the same use case for an API client). On success
// the scope returns a redirect intent, which the pack turns into an RR7 redirect
// carrying the session cookie — so this route has no success branch to render.
export const action = toAction(verifyFormScope)

export default function Verify() {
  return (
    <main>
      <h1>Enter your code</h1>
      <Form method="post">
        <label>
          Code <input name="code" inputMode="numeric" required />
        </label>
        <label>
          Display name <input name="displayName" required />
        </label>
        <label>
          <input type="checkbox" name="termsAccepted" value="on" required /> I accept the terms
        </label>
        <button type="submit">Verify</button>
      </Form>
    </main>
  )
}
