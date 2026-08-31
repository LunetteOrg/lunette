import { Form } from 'react-router'
import { publishPostFormScope } from '@lntt/example-app'
import { toAction } from '../bootstrap/index.ts'

// A gated WRITE from a browser form. The scope declares the FORM channel
// (`.form`), because an HTML `<Form>` posts multipart/urlencoded, never JSON —
// the JSON-shaped `publishPostScope` is the same use case for an API client.
// Either way the scope carries the `body` capability, which is why it mounts
// here (React Router streams the request) and is a compile error on tRPC.
export const action = toAction(publishPostFormScope)

export default function Publish() {
  return (
    <main>
      <h1>New post</h1>
      <Form method="post">
        <label>
          Title <input name="title" required />
        </label>
        <label>
          Body <textarea name="body" required />
        </label>
        <button type="submit">Publish</button>
      </Form>
    </main>
  )
}
