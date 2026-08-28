// A ten-line stand-in for a host framework's router, here for ONE reason: to
// show the gesture that makes the route gate worth having. Hono and Express
// both take `(path, ...handlers)`, so a mount that returns `[path, handler]`
// spreads straight into the registration and the pattern is written ONCE —
// checked against the schema, and still matched by the framework.
//
//    app.get(...route('/posts/:postId', postScope))
//
// Without the spread the pattern would be written twice (once for the router,
// once for us), which is a worse duplication than the one being fixed.
import type { Rendered } from './http.ts'

type Registered = readonly [string, (raw: unknown) => Promise<Rendered>]

export class FakeRouter {
  private readonly routes = new Map<string, (raw: unknown) => Promise<Rendered>>()

  // The signature a real router has: the path first, the handlers after.
  get(...[path, handler]: Registered): this {
    this.routes.set(path, handler)
    return this
  }

  // Matching the pattern is the FRAMEWORK's job — including extracting the
  // params. The scope never sees the pattern at runtime, only the bag.
  async dispatch(pattern: string, params: Record<string, string>): Promise<Rendered> {
    const handler = this.routes.get(pattern)
    if (!handler) throw new Error(`no route registered for ${pattern}`)
    return handler(params)
  }

  get registered(): readonly string[] {
    return [...this.routes.keys()]
  }
}
