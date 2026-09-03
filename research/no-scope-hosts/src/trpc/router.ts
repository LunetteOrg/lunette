import { initTRPC, TRPCError } from '@trpc/server'
import { z } from 'zod'
import { deps } from './bootstrap/index.ts'

export type Context = { readonly actorId?: string }

const t = initTRPC.context<Context>().create()

const CreatePostSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
})

export const appRouter = t.router({
  // tRPC has no return channel for a domain "not found" (#76's table,
  // verified against @trpc/server 11.18.0) — a returned value always leaves
  // as a success envelope, so this has to throw.
  getPost: t.procedure.input(z.object({ id: z.string() })).query(({ input }) => {
    const result = deps.posts.getPost(input.id)
    if ('notFound' in result) throw new TRPCError({ code: 'NOT_FOUND' })
    return result
  }),

  // No redirect concept, and no gap either: the client already owns what
  // happens after a mutation succeeds — that is the whole point of tRPC's
  // ownership model, unlike the HTTP hosts where the server decides.
  publishPost: t.procedure.input(z.object({ id: z.string() })).mutation(({ input, ctx }) => {
    if (!ctx.actorId) throw new TRPCError({ code: 'UNAUTHORIZED' })
    const result = deps.posts.publishPost(input.id)
    if ('notFound' in result) throw new TRPCError({ code: 'NOT_FOUND' })
    return result
  }),

  // No hand-rolled validation: `.input(schema)` is the parse-and-validate
  // step, and a malformed payload never reaches this handler.
  createPost: t.procedure.input(CreatePostSchema).mutation(({ input }) => deps.posts.createPost(input)),
})

export type AppRouter = typeof appRouter
