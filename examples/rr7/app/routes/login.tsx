import { Form, useActionData } from 'react-router'
import { loginScope } from '@lntt/example-app'
import { toAction } from '../bootstrap/index.ts'
import type { Route } from './+types/login'

// A page with a WRITE: `<Form method="post">` posts to this route's action,
// which runs the scope. The scope reads the form through its declared `.form`
// channel and sets the pending-auth cookie through the sink — the action here
// neither parses the body nor touches headers.
export const action = toAction(loginScope)

export default function Login() {
  const result = useActionData<typeof action>()
  return (
    <main>
      <h1>Sign in</h1>
      {result?.ok ? (
        <p>Check your inbox for the code.</p>
      ) : (
        <Form method="post">
          <label>
            Email <input type="email" name="email" required />
          </label>
          <button type="submit">Send me a code</button>
        </Form>
      )}
    </main>
  )
}
