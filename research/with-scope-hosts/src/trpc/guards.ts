import { TRPCError } from '@trpc/server'
import type { Next } from '@lntt/scope'
import type { Context } from './carrier.ts'

// tRPC's only door (#76's own finding — "auth has only one door"): there is
// no returned form that ends a procedure, so the guard throws, same as it
// does with no scope at all.
export const requireActor = async (_app: {}, { ctx }: { readonly ctx: Context }, next: Next<{ actor: string }>) => {
  if (!ctx.actorId) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return next({ actor: ctx.actorId })
}
