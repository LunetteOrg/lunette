import type { Config } from '@react-router/dev/config'

// A real React Router 7 app, with the middleware future enabled — the shape a
// current app is written in. It is deliberately NOT tuned to what @lntt/scope
// needs: the point is to run the packs against the framework as it actually is.
// With `v8_middleware` the loader `context` is a `RouterContextProvider`, read
// through `createContext` tokens; our loaders never touch it, which is what
// makes them work here unchanged.
export default {
  ssr: true,
  future: {
    v8_middleware: true,
  },
} satisfies Config
