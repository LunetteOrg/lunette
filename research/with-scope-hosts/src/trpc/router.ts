import { initTRPC, TRPCError } from '@trpc/server'
import { z } from 'zod'
import { scope } from '@lntt/scope'
import type { Deps } from '../domain/deps.ts'
import { trpc, trpcCarrier, type Context } from './carrier.ts'
import { requireActor } from './guards.ts'
import { deps } from './bootstrap/index.ts'

export type { Context }

const t = initTRPC.context<Context>().create()
const { procedure } = trpc(deps)

const CreatePostSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
})

export const appRouter = t.router({
  // No returned "not found" here either — same door as the guard below.
  // `input` arrives as `unknown` on the scope's own ctx (carrier.ts) —
  // read at that width and cast, the way Express casts `req.params`.
  getPost: t.procedure.input(z.object({ id: z.string() })).query(
    procedure(
      scope(trpcCarrier).step(async ({ posts }: Deps, { input }: { readonly input: unknown }) => {
        const { id } = input as { readonly id: string }
        const result = posts.getPost(id)
        if ('notFound' in result) throw new TRPCError({ code: 'NOT_FOUND' })
        return result
      }),
    ),
  ),

  // No redirect: the client already owns what happens after a mutation
  // succeeds — porting Express/Hono's redirect here would be the category
  // error #76 already named, not a missing feature.
  publishPost: t.procedure.input(z.object({ id: z.string() })).mutation(
    procedure(
      scope(trpcCarrier)
        .step(requireActor)
        .step(async ({ posts }: Deps, { input }: { readonly input: unknown }) => {
          const { id } = input as { readonly id: string }
          const result = posts.publishPost(id)
          if ('notFound' in result) throw new TRPCError({ code: 'NOT_FOUND' })
          return result
        }),
    ),
  ),

  // No hand-rolled validation: `.input(schema)` is the read AND the
  // validation, so the scope starts already holding the parsed,
  // schema-checked shape — there is nothing here for `validated` to do.
  createPost: t.procedure.input(CreatePostSchema).mutation(
    procedure(
      scope(trpcCarrier).step(async ({ posts }: Deps, { input }: { readonly input: unknown }) =>
        posts.createPost(input as z.infer<typeof CreatePostSchema>),
      ),
    ),
  ),
})

export type AppRouter = typeof appRouter
