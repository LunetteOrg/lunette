import { Link, isRouteErrorResponse, useRouteError } from 'react-router'
import { postScope } from '@lntt/example-app'
import { toLoader } from '../bootstrap/index.ts'
import type { Route } from './+types/post'

// The route param is validated by the scope's own schema at runtime: a bad or
// missing `postId` is a RETURNED 422 abort, which reaches the ErrorBoundary
// below exactly like the 404 an unknown post produces.
export const loader = toLoader(postScope)

export default function Post({ loaderData }: Route.ComponentProps) {
  const { post } = loaderData
  return (
    <main>
      <article>
        <h1>{post.title}</h1>
        <p>{post.body}</p>
      </article>
      <Link to="/">Back to the feed</Link>
    </main>
  )
}

export function ErrorBoundary() {
  const error = useRouteError()
  if (isRouteErrorResponse(error)) {
    return (
      <main>
        <h1>{error.status === 404 ? 'Post not found' : error.status}</h1>
        <Link to="/">Back to the feed</Link>
      </main>
    )
  }
  throw error
}
