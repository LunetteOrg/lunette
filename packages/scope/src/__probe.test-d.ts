import { z } from 'zod'
import { expectTypeOf } from 'vitest'
import { scope } from './index.ts'
import { guards, fail } from './guard/index.ts'

const post = z.object({ title: z.string(), tags: z.array(z.string()) })

const h = scope<{ readonly body: unknown; readonly token: string | null }>()
  .extend(guards)
  .validate('body', post, () => 'invalid' as const)
  .guard((_a: {}, { token }) => (token === null ? fail() : { actor: token }), () => 401 as const)
  .step(async (_a: {}, ctx) => {
    expectTypeOf(ctx.body).toEqualTypeOf<{ title: string; tags: string[] }>()
    expectTypeOf(ctx.actor).toEqualTypeOf<string>()
    return ctx.body.title
  })

// il ritorno di onError entra nell'unione: `AnswerGate` lo leggerà al mount
expectTypeOf(h).returns.resolves.toEqualTypeOf<string | 'invalid' | 401>()
