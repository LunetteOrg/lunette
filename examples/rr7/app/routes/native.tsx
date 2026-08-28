import { data, redirect } from 'react-router'
import { scope } from '@lntt/scope'
import { cookies } from '@lntt/scope/cookies'
import { request } from '@lntt/scope/request'
import { feedGuard } from '@lntt/example-app'
import { toLoader } from '../bootstrap/index.ts'

// A scope whose leaf speaks REACT ROUTER directly — the deliberate escape hatch,
// shown where it belongs: NOT instead of the model, on top of it.
//
// Everything below the leaf is the ordinary machinery. `feedGuard` is the same
// guard the home page uses, declaring the dependency it needs
// (`threads.listFeed`) — so the chain is really consulted and `DepGuard` really
// checks it at the mount. `.extend(request)` gives the typed request, `.extend
// (cookies)` the sink. What the escape hatch changes is only the last step: the
// REPRESENTATION. `data()` with a status of the leaf's choosing, a thrown
// `redirect`, a `Response` built by hand — none of it re-wrapped by the pack,
// with the sinks' effects merged in (note the cookie riding the 202).
//
// The trade belongs to THIS app, not to a shared scope: importing `react-router`
// in a leaf means that scope no longer runs on Hono, Express or tRPC — which is
// why no scope in `@lntt/example-app` does it.
export const loader = toLoader(
  scope()
    .extend(request)
    .extend(cookies)
    .guard(feedGuard)
    .handle((_deps: {}, ctx) => {
      const url = new URL(ctx.request.url)

      // RR7's own control flow: a throw is how a loader says "go elsewhere".
      if (url.searchParams.get('go') === 'away') throw redirect('/')

      // RR7's own response shaping. The data came from the guard, through the
      // chain; only the status and the cookie are this leaf's decision.
      if (url.searchParams.has('accepted')) {
        ctx.cookies.set('seen', '1', { path: '/' })
        return data({ queued: true, posts: ctx.feed.length }, { status: 202 })
      }

      // A response built by hand, for a body the outcome codec cannot express.
      if (url.searchParams.has('text')) {
        return new Response(ctx.feed.map((post) => post.title).join('\n'), {
          status: 200,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        })
      }

      return { via: 'the ordinary path', posts: ctx.feed.length }
    }),
)
