// MEASUREMENT WORKLOAD — two-branch. 24 scopes, four steps each, identical in the
// three variants. Compiled alone via `tsconfig.two-branch.json` so
// `tsc --extendedDiagnostics` attributes every instantiation to this shape.
//
// Not a test and not an example: it exists to be counted.

import { scope as tbScope, type Next as TbNext } from './kernel-two-branch.ts'
import { twoBranch, tbRefused, tbNotFound } from './carriers.ts'

export const s0 = tbScope(twoBranch)
  .step(async (_app: {}, ctx, next: TbNext<{ user0: string }>) =>
    ctx.token === null ? tbRefused('anonymous') : next({ user0: ctx.token }),
  )
  .step(async (_app: {}, ctx: { readonly user0: string }, next: TbNext<{ page0: number }>) =>
    next({ page0: ctx.user0.length }),
  )
  .step(async (_app: {}, ctx: { readonly page0: number }, next: TbNext<{ tag0: string }>) =>
    next({ tag0: `t${ctx.page0}` }),
  )
  .step(async (_app: {}, ctx: { readonly tag0: string }) =>
    ctx.tag0 === 'gone' ? tbNotFound('no such note') : `${ctx.tag0}:hello`,
  )

export const s1 = tbScope(twoBranch)
  .step(async (_app: {}, ctx, next: TbNext<{ user1: string }>) =>
    ctx.token === null ? tbRefused('anonymous') : next({ user1: ctx.token }),
  )
  .step(async (_app: {}, ctx: { readonly user1: string }, next: TbNext<{ page1: number }>) =>
    next({ page1: ctx.user1.length }),
  )
  .step(async (_app: {}, ctx: { readonly page1: number }, next: TbNext<{ tag1: string }>) =>
    next({ tag1: `t${ctx.page1}` }),
  )
  .step(async (_app: {}, ctx: { readonly tag1: string }) =>
    ctx.tag1 === 'gone' ? tbNotFound('no such note') : `${ctx.tag1}:hello`,
  )

export const s2 = tbScope(twoBranch)
  .step(async (_app: {}, ctx, next: TbNext<{ user2: string }>) =>
    ctx.token === null ? tbRefused('anonymous') : next({ user2: ctx.token }),
  )
  .step(async (_app: {}, ctx: { readonly user2: string }, next: TbNext<{ page2: number }>) =>
    next({ page2: ctx.user2.length }),
  )
  .step(async (_app: {}, ctx: { readonly page2: number }, next: TbNext<{ tag2: string }>) =>
    next({ tag2: `t${ctx.page2}` }),
  )
  .step(async (_app: {}, ctx: { readonly tag2: string }) =>
    ctx.tag2 === 'gone' ? tbNotFound('no such note') : `${ctx.tag2}:hello`,
  )

export const s3 = tbScope(twoBranch)
  .step(async (_app: {}, ctx, next: TbNext<{ user3: string }>) =>
    ctx.token === null ? tbRefused('anonymous') : next({ user3: ctx.token }),
  )
  .step(async (_app: {}, ctx: { readonly user3: string }, next: TbNext<{ page3: number }>) =>
    next({ page3: ctx.user3.length }),
  )
  .step(async (_app: {}, ctx: { readonly page3: number }, next: TbNext<{ tag3: string }>) =>
    next({ tag3: `t${ctx.page3}` }),
  )
  .step(async (_app: {}, ctx: { readonly tag3: string }) =>
    ctx.tag3 === 'gone' ? tbNotFound('no such note') : `${ctx.tag3}:hello`,
  )

export const s4 = tbScope(twoBranch)
  .step(async (_app: {}, ctx, next: TbNext<{ user4: string }>) =>
    ctx.token === null ? tbRefused('anonymous') : next({ user4: ctx.token }),
  )
  .step(async (_app: {}, ctx: { readonly user4: string }, next: TbNext<{ page4: number }>) =>
    next({ page4: ctx.user4.length }),
  )
  .step(async (_app: {}, ctx: { readonly page4: number }, next: TbNext<{ tag4: string }>) =>
    next({ tag4: `t${ctx.page4}` }),
  )
  .step(async (_app: {}, ctx: { readonly tag4: string }) =>
    ctx.tag4 === 'gone' ? tbNotFound('no such note') : `${ctx.tag4}:hello`,
  )

export const s5 = tbScope(twoBranch)
  .step(async (_app: {}, ctx, next: TbNext<{ user5: string }>) =>
    ctx.token === null ? tbRefused('anonymous') : next({ user5: ctx.token }),
  )
  .step(async (_app: {}, ctx: { readonly user5: string }, next: TbNext<{ page5: number }>) =>
    next({ page5: ctx.user5.length }),
  )
  .step(async (_app: {}, ctx: { readonly page5: number }, next: TbNext<{ tag5: string }>) =>
    next({ tag5: `t${ctx.page5}` }),
  )
  .step(async (_app: {}, ctx: { readonly tag5: string }) =>
    ctx.tag5 === 'gone' ? tbNotFound('no such note') : `${ctx.tag5}:hello`,
  )

export const s6 = tbScope(twoBranch)
  .step(async (_app: {}, ctx, next: TbNext<{ user6: string }>) =>
    ctx.token === null ? tbRefused('anonymous') : next({ user6: ctx.token }),
  )
  .step(async (_app: {}, ctx: { readonly user6: string }, next: TbNext<{ page6: number }>) =>
    next({ page6: ctx.user6.length }),
  )
  .step(async (_app: {}, ctx: { readonly page6: number }, next: TbNext<{ tag6: string }>) =>
    next({ tag6: `t${ctx.page6}` }),
  )
  .step(async (_app: {}, ctx: { readonly tag6: string }) =>
    ctx.tag6 === 'gone' ? tbNotFound('no such note') : `${ctx.tag6}:hello`,
  )

export const s7 = tbScope(twoBranch)
  .step(async (_app: {}, ctx, next: TbNext<{ user7: string }>) =>
    ctx.token === null ? tbRefused('anonymous') : next({ user7: ctx.token }),
  )
  .step(async (_app: {}, ctx: { readonly user7: string }, next: TbNext<{ page7: number }>) =>
    next({ page7: ctx.user7.length }),
  )
  .step(async (_app: {}, ctx: { readonly page7: number }, next: TbNext<{ tag7: string }>) =>
    next({ tag7: `t${ctx.page7}` }),
  )
  .step(async (_app: {}, ctx: { readonly tag7: string }) =>
    ctx.tag7 === 'gone' ? tbNotFound('no such note') : `${ctx.tag7}:hello`,
  )

export const s8 = tbScope(twoBranch)
  .step(async (_app: {}, ctx, next: TbNext<{ user8: string }>) =>
    ctx.token === null ? tbRefused('anonymous') : next({ user8: ctx.token }),
  )
  .step(async (_app: {}, ctx: { readonly user8: string }, next: TbNext<{ page8: number }>) =>
    next({ page8: ctx.user8.length }),
  )
  .step(async (_app: {}, ctx: { readonly page8: number }, next: TbNext<{ tag8: string }>) =>
    next({ tag8: `t${ctx.page8}` }),
  )
  .step(async (_app: {}, ctx: { readonly tag8: string }) =>
    ctx.tag8 === 'gone' ? tbNotFound('no such note') : `${ctx.tag8}:hello`,
  )

export const s9 = tbScope(twoBranch)
  .step(async (_app: {}, ctx, next: TbNext<{ user9: string }>) =>
    ctx.token === null ? tbRefused('anonymous') : next({ user9: ctx.token }),
  )
  .step(async (_app: {}, ctx: { readonly user9: string }, next: TbNext<{ page9: number }>) =>
    next({ page9: ctx.user9.length }),
  )
  .step(async (_app: {}, ctx: { readonly page9: number }, next: TbNext<{ tag9: string }>) =>
    next({ tag9: `t${ctx.page9}` }),
  )
  .step(async (_app: {}, ctx: { readonly tag9: string }) =>
    ctx.tag9 === 'gone' ? tbNotFound('no such note') : `${ctx.tag9}:hello`,
  )

export const s10 = tbScope(twoBranch)
  .step(async (_app: {}, ctx, next: TbNext<{ user10: string }>) =>
    ctx.token === null ? tbRefused('anonymous') : next({ user10: ctx.token }),
  )
  .step(async (_app: {}, ctx: { readonly user10: string }, next: TbNext<{ page10: number }>) =>
    next({ page10: ctx.user10.length }),
  )
  .step(async (_app: {}, ctx: { readonly page10: number }, next: TbNext<{ tag10: string }>) =>
    next({ tag10: `t${ctx.page10}` }),
  )
  .step(async (_app: {}, ctx: { readonly tag10: string }) =>
    ctx.tag10 === 'gone' ? tbNotFound('no such note') : `${ctx.tag10}:hello`,
  )

export const s11 = tbScope(twoBranch)
  .step(async (_app: {}, ctx, next: TbNext<{ user11: string }>) =>
    ctx.token === null ? tbRefused('anonymous') : next({ user11: ctx.token }),
  )
  .step(async (_app: {}, ctx: { readonly user11: string }, next: TbNext<{ page11: number }>) =>
    next({ page11: ctx.user11.length }),
  )
  .step(async (_app: {}, ctx: { readonly page11: number }, next: TbNext<{ tag11: string }>) =>
    next({ tag11: `t${ctx.page11}` }),
  )
  .step(async (_app: {}, ctx: { readonly tag11: string }) =>
    ctx.tag11 === 'gone' ? tbNotFound('no such note') : `${ctx.tag11}:hello`,
  )

export const s12 = tbScope(twoBranch)
  .step(async (_app: {}, ctx, next: TbNext<{ user12: string }>) =>
    ctx.token === null ? tbRefused('anonymous') : next({ user12: ctx.token }),
  )
  .step(async (_app: {}, ctx: { readonly user12: string }, next: TbNext<{ page12: number }>) =>
    next({ page12: ctx.user12.length }),
  )
  .step(async (_app: {}, ctx: { readonly page12: number }, next: TbNext<{ tag12: string }>) =>
    next({ tag12: `t${ctx.page12}` }),
  )
  .step(async (_app: {}, ctx: { readonly tag12: string }) =>
    ctx.tag12 === 'gone' ? tbNotFound('no such note') : `${ctx.tag12}:hello`,
  )

export const s13 = tbScope(twoBranch)
  .step(async (_app: {}, ctx, next: TbNext<{ user13: string }>) =>
    ctx.token === null ? tbRefused('anonymous') : next({ user13: ctx.token }),
  )
  .step(async (_app: {}, ctx: { readonly user13: string }, next: TbNext<{ page13: number }>) =>
    next({ page13: ctx.user13.length }),
  )
  .step(async (_app: {}, ctx: { readonly page13: number }, next: TbNext<{ tag13: string }>) =>
    next({ tag13: `t${ctx.page13}` }),
  )
  .step(async (_app: {}, ctx: { readonly tag13: string }) =>
    ctx.tag13 === 'gone' ? tbNotFound('no such note') : `${ctx.tag13}:hello`,
  )

export const s14 = tbScope(twoBranch)
  .step(async (_app: {}, ctx, next: TbNext<{ user14: string }>) =>
    ctx.token === null ? tbRefused('anonymous') : next({ user14: ctx.token }),
  )
  .step(async (_app: {}, ctx: { readonly user14: string }, next: TbNext<{ page14: number }>) =>
    next({ page14: ctx.user14.length }),
  )
  .step(async (_app: {}, ctx: { readonly page14: number }, next: TbNext<{ tag14: string }>) =>
    next({ tag14: `t${ctx.page14}` }),
  )
  .step(async (_app: {}, ctx: { readonly tag14: string }) =>
    ctx.tag14 === 'gone' ? tbNotFound('no such note') : `${ctx.tag14}:hello`,
  )

export const s15 = tbScope(twoBranch)
  .step(async (_app: {}, ctx, next: TbNext<{ user15: string }>) =>
    ctx.token === null ? tbRefused('anonymous') : next({ user15: ctx.token }),
  )
  .step(async (_app: {}, ctx: { readonly user15: string }, next: TbNext<{ page15: number }>) =>
    next({ page15: ctx.user15.length }),
  )
  .step(async (_app: {}, ctx: { readonly page15: number }, next: TbNext<{ tag15: string }>) =>
    next({ tag15: `t${ctx.page15}` }),
  )
  .step(async (_app: {}, ctx: { readonly tag15: string }) =>
    ctx.tag15 === 'gone' ? tbNotFound('no such note') : `${ctx.tag15}:hello`,
  )

export const s16 = tbScope(twoBranch)
  .step(async (_app: {}, ctx, next: TbNext<{ user16: string }>) =>
    ctx.token === null ? tbRefused('anonymous') : next({ user16: ctx.token }),
  )
  .step(async (_app: {}, ctx: { readonly user16: string }, next: TbNext<{ page16: number }>) =>
    next({ page16: ctx.user16.length }),
  )
  .step(async (_app: {}, ctx: { readonly page16: number }, next: TbNext<{ tag16: string }>) =>
    next({ tag16: `t${ctx.page16}` }),
  )
  .step(async (_app: {}, ctx: { readonly tag16: string }) =>
    ctx.tag16 === 'gone' ? tbNotFound('no such note') : `${ctx.tag16}:hello`,
  )

export const s17 = tbScope(twoBranch)
  .step(async (_app: {}, ctx, next: TbNext<{ user17: string }>) =>
    ctx.token === null ? tbRefused('anonymous') : next({ user17: ctx.token }),
  )
  .step(async (_app: {}, ctx: { readonly user17: string }, next: TbNext<{ page17: number }>) =>
    next({ page17: ctx.user17.length }),
  )
  .step(async (_app: {}, ctx: { readonly page17: number }, next: TbNext<{ tag17: string }>) =>
    next({ tag17: `t${ctx.page17}` }),
  )
  .step(async (_app: {}, ctx: { readonly tag17: string }) =>
    ctx.tag17 === 'gone' ? tbNotFound('no such note') : `${ctx.tag17}:hello`,
  )

export const s18 = tbScope(twoBranch)
  .step(async (_app: {}, ctx, next: TbNext<{ user18: string }>) =>
    ctx.token === null ? tbRefused('anonymous') : next({ user18: ctx.token }),
  )
  .step(async (_app: {}, ctx: { readonly user18: string }, next: TbNext<{ page18: number }>) =>
    next({ page18: ctx.user18.length }),
  )
  .step(async (_app: {}, ctx: { readonly page18: number }, next: TbNext<{ tag18: string }>) =>
    next({ tag18: `t${ctx.page18}` }),
  )
  .step(async (_app: {}, ctx: { readonly tag18: string }) =>
    ctx.tag18 === 'gone' ? tbNotFound('no such note') : `${ctx.tag18}:hello`,
  )

export const s19 = tbScope(twoBranch)
  .step(async (_app: {}, ctx, next: TbNext<{ user19: string }>) =>
    ctx.token === null ? tbRefused('anonymous') : next({ user19: ctx.token }),
  )
  .step(async (_app: {}, ctx: { readonly user19: string }, next: TbNext<{ page19: number }>) =>
    next({ page19: ctx.user19.length }),
  )
  .step(async (_app: {}, ctx: { readonly page19: number }, next: TbNext<{ tag19: string }>) =>
    next({ tag19: `t${ctx.page19}` }),
  )
  .step(async (_app: {}, ctx: { readonly tag19: string }) =>
    ctx.tag19 === 'gone' ? tbNotFound('no such note') : `${ctx.tag19}:hello`,
  )

export const s20 = tbScope(twoBranch)
  .step(async (_app: {}, ctx, next: TbNext<{ user20: string }>) =>
    ctx.token === null ? tbRefused('anonymous') : next({ user20: ctx.token }),
  )
  .step(async (_app: {}, ctx: { readonly user20: string }, next: TbNext<{ page20: number }>) =>
    next({ page20: ctx.user20.length }),
  )
  .step(async (_app: {}, ctx: { readonly page20: number }, next: TbNext<{ tag20: string }>) =>
    next({ tag20: `t${ctx.page20}` }),
  )
  .step(async (_app: {}, ctx: { readonly tag20: string }) =>
    ctx.tag20 === 'gone' ? tbNotFound('no such note') : `${ctx.tag20}:hello`,
  )

export const s21 = tbScope(twoBranch)
  .step(async (_app: {}, ctx, next: TbNext<{ user21: string }>) =>
    ctx.token === null ? tbRefused('anonymous') : next({ user21: ctx.token }),
  )
  .step(async (_app: {}, ctx: { readonly user21: string }, next: TbNext<{ page21: number }>) =>
    next({ page21: ctx.user21.length }),
  )
  .step(async (_app: {}, ctx: { readonly page21: number }, next: TbNext<{ tag21: string }>) =>
    next({ tag21: `t${ctx.page21}` }),
  )
  .step(async (_app: {}, ctx: { readonly tag21: string }) =>
    ctx.tag21 === 'gone' ? tbNotFound('no such note') : `${ctx.tag21}:hello`,
  )

export const s22 = tbScope(twoBranch)
  .step(async (_app: {}, ctx, next: TbNext<{ user22: string }>) =>
    ctx.token === null ? tbRefused('anonymous') : next({ user22: ctx.token }),
  )
  .step(async (_app: {}, ctx: { readonly user22: string }, next: TbNext<{ page22: number }>) =>
    next({ page22: ctx.user22.length }),
  )
  .step(async (_app: {}, ctx: { readonly page22: number }, next: TbNext<{ tag22: string }>) =>
    next({ tag22: `t${ctx.page22}` }),
  )
  .step(async (_app: {}, ctx: { readonly tag22: string }) =>
    ctx.tag22 === 'gone' ? tbNotFound('no such note') : `${ctx.tag22}:hello`,
  )

export const s23 = tbScope(twoBranch)
  .step(async (_app: {}, ctx, next: TbNext<{ user23: string }>) =>
    ctx.token === null ? tbRefused('anonymous') : next({ user23: ctx.token }),
  )
  .step(async (_app: {}, ctx: { readonly user23: string }, next: TbNext<{ page23: number }>) =>
    next({ page23: ctx.user23.length }),
  )
  .step(async (_app: {}, ctx: { readonly page23: number }, next: TbNext<{ tag23: string }>) =>
    next({ tag23: `t${ctx.page23}` }),
  )
  .step(async (_app: {}, ctx: { readonly tag23: string }) =>
    ctx.tag23 === 'gone' ? tbNotFound('no such note') : `${ctx.tag23}:hello`,
  )
