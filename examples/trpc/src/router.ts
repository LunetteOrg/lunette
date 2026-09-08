import { initTRPC, TRPCError } from '@trpc/server'
import { z } from 'zod'
import { scope, type Next } from '@lntt/scope'
import { trpc } from '@lntt/scope/trpc'
import { guards } from '@lntt/scope/guard'
import type { Deps } from '@lntt/example-app'
import { deps } from './bootstrap/index.ts'

// What the transport puts on every call. tRPC has no `req`/`res` a step could
// read: the context IS the door, and the carrier reads its type off `t`.
export type Context = { readonly actorId: string | undefined }

export const t = initTRPC.context<Context>().create()
const { carrier, procedure, middleware } = trpc(t, deps)

// ONE SCHEMA VALUE, TWO USES, and neither is a copy of the other:
//
//   .input(Id)                      tRPC reads and validates the call's input,
//                                   and the generated client types it
//   .validate('input', Id, …)       the scope types `ctx.input` for its steps,
//                                   and `procedure(sc)` is checked against
//                                   what `.input()` supplies
//
// Pointed at different schemas the mount is refused — a resolver demanding
// `{ id: string }` does not accept a procedure supplying `{ slug: string }`,
// by contravariance, with no gate of ours.
const Id = z.object({ id: z.string().regex(/^\d+$/, 'must be numeric') })

const CreatePostSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
})

// `onError` HERE IS A FORMALITY: `.input(Id)` has already run and rejected
// anything malformed before the fold starts, so this branch is unreachable on
// this host. What the second call buys is the TYPE inside the steps and the
// check at the mount, not a second runtime check. On Express and Hono, where
// the framework supplies only a pattern, the same call is the only thing that
// looks at the value at all.
const badInput = (): never => {
  throw new TRPCError({ code: 'BAD_REQUEST' })
}

// A MIDDLEWARE IS A DIFFERENT UNIT FROM A PROCEDURE, and this is what it is
// for: what its steps derive becomes the CONTEXT OVERRIDE, so every procedure
// that `.use`s it reads `actor` typed, with nothing declared twice.
//
// It does NOT read the input. `opts.input` is `unknown` inside `t.middleware`
// in tRPC's own typings — a middleware is shared across procedures whose
// inputs differ — and `validate('input', …)` is refused here for the matching
// reason: this leaf strips `input` by name before `next({ ctx })`.
//
// AND THE OVERRIDE REACHES tRPC, NOT A SCOPE'S `ctx`. A native resolver on
// `authed` reads `ctx.actor` as `string` (pinned in `router.test.ts`); a scope
// mounted on the same procedure does not, because its context type is read off
// the ROOT builder — `trpc(t, deps)` takes `t` — and does not follow a
// procedure that grew it. So the step below reads `ctx.actorId`, the root's own
// field, and a scope wanting the derived one takes it from where it was
// derived.
export const authed = t.procedure.use(
  t.middleware(
    middleware(
      scope(carrier()).step(async (_app: {}, { ctx }, next: Next<{ actor: string }>) => {
        if (!ctx.actorId) throw new TRPCError({ code: 'UNAUTHORIZED' })
        return next({ actor: ctx.actorId })
      }),
    ),
  ),
)

// A SCOPE VALUE IS THE RECYCLABLE UNIT: `withId` is built once and both
// procedures below branch from it, each adding its own steps.
const withId = scope(carrier()).extend(guards).validate('input', Id, badInput)

export const appRouter = t.router({
  // NO RETURNED "not found": tRPC has one door for ending a call early, and it
  // is a thrown `TRPCError`. That is the host's own convention, not a gap in
  // the library's — a RETURNED domain value would be serialised as the
  // procedure's result. The error convention says which of the two a step
  // MEANS; here the transport only offers one of them.
  getPost: t.procedure.input(Id).query(
    procedure(
      withId.step(async ({ posts }: Deps, { input }) => {
        const result = posts.getPost(input.id)
        if ('notFound' in result) throw new TRPCError({ code: 'NOT_FOUND' })
        return result
      }),
    ),
  ),

  // No redirect: what happens after a mutation succeeds belongs to the client
  // here, so porting Express's and Hono's 303 would be a category error rather
  // than a missing feature.
  publishPost: authed.input(Id).mutation(
    procedure(
      withId.step(async ({ posts }: Deps, { input, ctx }) => {
        // `ctx.actorId`, not the middleware's derived `actor` — see above.
        // The guard already refused an anonymous call, so this is a string.
        void ctx.actorId
        const result = posts.publishPost(input.id)
        if ('notFound' in result) throw new TRPCError({ code: 'NOT_FOUND' })
        return result
      }),
    ),
  ),

  createPost: t.procedure.input(CreatePostSchema).mutation(
    procedure(
      scope(carrier())
        .extend(guards)
        .validate('input', CreatePostSchema, badInput)
        .step(async ({ posts }: Deps, { input }) => posts.createPost(input)),
    ),
  ),
})

export type AppRouter = typeof appRouter
