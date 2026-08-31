// The payoff of design A, visible in the example: a body-reading WRITE scope
// cannot be mounted on tRPC. `publishPostScope` declares a `.body` channel,
// so it carries the `body` capability — which tRPC's carrier does not provide.
// `toProcedure` rejects it at the mount site (a compile error naming the missing
// capability), instead of silently reading an empty body at runtime. Removing
// the `@ts-expect-error` must break typecheck.

import { initTRPC } from '@trpc/server'
import { publishPostScope } from '@lntt/example-app'
import { toProcedure } from '@lntt/integration/trpc'
import type { Ctx } from '../src/router.ts'

const t = initTRPC.context<Ctx>().create()

// @ts-expect-error host missing capability 'body' — a .body write cannot mount on tRPC
toProcedure(t.procedure, publishPostScope)
