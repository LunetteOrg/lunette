import type { Context, Next } from 'hono'
import type { Scope, State } from '@lntt/scope'

export interface HonoCarrier {
  readonly __args?: { readonly c: Context }
}

export const honoCarrier: HonoCarrier = {}

// Whatever a middleware's steps derive lands on `c` (via `c.set`) before
// Hono's own `next()` runs — the leaf every `mw()` chain ends on, added here
// so nobody has to remember to append it.
const toNext = async (
  _app: {},
  ctx: { readonly c: Context; readonly next: Next } & Record<string, unknown>,
) => {
  const { c, next, ...derived } = ctx
  for (const [key, value] of Object.entries(derived)) c.set(key, value)
  await next()
  return undefined
}

export const hono = <App extends object>(deps: App) => ({
  route:
    <Args extends { readonly c: Context }>(sc: (app: App, args: Args) => unknown) =>
    (c: Context): Promise<Response> =>
      sc(deps, { c } as Args) as Promise<Response>,

  mw:
    <S extends State>(sc: Scope<S>) =>
    async (c: Context, next: Next): Promise<void> => {
      const finished = (sc as { step: (s: unknown) => unknown }).step(toNext) as unknown as (
        app: App,
        args: unknown,
      ) => unknown
      await finished(deps, { c, next })
    },
})
