import type { Config } from '@react-router/dev/config'

// SSR, and nothing else configured: this example's point is the loader and the
// action — what a scope mounts onto — and the components that read them. What
// this file really buys is the TYPEGEN, which reads `app/routes.ts` and gives
// each module its own `Route.LoaderArgs`, params typed from the route's path.
export default {
  ssr: true,
} satisfies Config
