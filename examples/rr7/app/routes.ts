import { type RouteConfig, route } from '@react-router/dev/routes'

// THE ROUTE CONFIG IS WHERE A PATTERN LIVES ON THIS HOST — not at a mount, the
// way Express and Hono take one. That is why `@lntt/scope/react-router` ships
// no route gate: nothing here ever reaches a type of ours. What checks a route
// instead is the TYPEGEN, which reads this file and gives each module its own
// `Route.LoaderArgs`, params included.
export default [
  route('posts', 'routes/posts.tsx'),
  route('posts/:id', 'routes/post.tsx'),
  route('posts/:id/publish', 'routes/publish.ts'),
] satisfies RouteConfig
