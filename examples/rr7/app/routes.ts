import { type RouteConfig, index, route } from '@react-router/dev/routes'

// The route table. Pages render; the two action-only routes have no component
// because their scopes end in a redirect. Each module imports `toLoader` /
// `toAction` from `bootstrap` — the app's own composition root — and never sees
// the chain or the pack.
export default [
  index('routes/home.tsx'),
  route('posts/:postId', 'routes/post.tsx'),
  // a non-JSON body, composed from the loader's data — no new API needed
  route('feed.csv', 'routes/feed-csv.tsx'),
  // a non-JSON body, composed from the loader's data — no new API needed
  route('posts/new', 'routes/publish.tsx'),
  route('me', 'routes/me.tsx'),
  route('native', 'routes/native.tsx'),
  route('login', 'routes/login.tsx'),
  route('verify', 'routes/verify.tsx'),
  route('logout', 'routes/logout.ts'),
  // a hand-written resource route, no scope: the two kinds coexist
  route('dev/outbox', 'routes/dev.outbox.ts'),
] satisfies RouteConfig
