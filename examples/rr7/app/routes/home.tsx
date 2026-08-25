import { Link, isRouteErrorResponse, useRouteError } from 'react-router'
import { scope } from '@lntt/scope'
import { headers as headersExt } from '@lntt/scope/headers'
import { feedGuard, feedHandler } from '@lntt/example-app'
import { toLoader } from '../bootstrap/index.ts'
import { settings } from '../config/settings.ts'
import type { Route } from './+types/home'

// A PAGE: the loader runs a scope and its return value IS `loaderData`, typed as
// the leaf's result — no Response, no unwrapping. The feed is composed inline,
// the single-host idiom: one host, one wiring, no shared-scope module needed.
//
// `.headers({...})` states the caching policy HERE, at the wiring, next to the
// route it belongs to — not inside `feedHandler`, which stays a domain function
// that knows nothing about HTTP.
export const loader = toLoader(
  scope()
    .extend(headersExt)
    .headers({ 'cache-control': 'public, max-age=30' })
    .guard(feedGuard)
    .handle(feedHandler),
)

// What the scope wrote reaches the DATA response by itself, but a document
// response takes its headers from this export — React Router does not forward
// loader headers to the HTML render unless the route says so. One line, and it
// is the route's decision, not the pack's.
export function headers({ loaderHeaders }: Route.HeadersArgs) {
  return loaderHeaders
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { feed } = loaderData
  return (
    <main>
      <h1>{settings.ui.title}</h1>
      {feed.length === 0 ? (
        <p>No posts yet.</p>
      ) : (
        <ul>
          {feed.map((post) => (
            <li key={post.id}>
              <Link to={`/posts/${post.id}`}>{post.title}</Link>
            </li>
          ))}
        </ul>
      )}
      <nav>
        <Link to="/login">Sign in</Link> · <Link to="/posts/new">New post</Link> ·{' '}
        <Link to="/me">Profile</Link>
      </nav>
    </main>
  )
}

// A status abort is THROWN by the loader, so it lands here — the domain error
// rendered as a page, with the route none the wiser that it came from a scope.
export function ErrorBoundary() {
  const error = useRouteError()
  if (isRouteErrorResponse(error)) {
    return (
      <main>
        <h1>{error.status}</h1>
        <p>Nothing to show.</p>
      </main>
    )
  }
  throw error
}
