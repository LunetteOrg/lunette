// THE MEASUREMENT WORKLOAD — 24 scopes, written against the self kernel.
// The two files are generated from one template, so the ONLY difference between
// them is which kernel they import. Each scope has the shape a real one has: a
// carrier, an enriching step, a guard that can stop with one of the carrier's
// WORDS, and a leaf.
import { scope } from './self/base.ts'
import { fixture, refused } from './self/carrier.fixture.ts'
import type { Next } from './self/primitive.ts'

interface Repos {
  readonly users: { readonly byId: (id: string) => { readonly name: string } | undefined }
}

export const s0 = scope(fixture)
  .step(async (_app: {}, ctx, next: Next<{ page0: number }>) =>
    next({ page0: Number(ctx.params.page ?? '1') }),
  )
  .step(async (app: Repos, ctx, next: Next<{ name0: string }>) => {
    const user = app.users.byId(ctx.token ?? '')
    if (!user) return refused('no session 0')
    return next({ name0: user.name })
  })
  .step({
    run: async (_app: {}, ctx: { readonly name0: string; readonly page0: number }) => ({
      who: ctx.name0,
      page: ctx.page0,
    }),
    closes: true,
  })
export const s1 = scope(fixture)
  .step(async (_app: {}, ctx, next: Next<{ page1: number }>) =>
    next({ page1: Number(ctx.params.page ?? '1') }),
  )
  .step(async (app: Repos, ctx, next: Next<{ name1: string }>) => {
    const user = app.users.byId(ctx.token ?? '')
    if (!user) return refused('no session 1')
    return next({ name1: user.name })
  })
  .step({
    run: async (_app: {}, ctx: { readonly name1: string; readonly page1: number }) => ({
      who: ctx.name1,
      page: ctx.page1,
    }),
    closes: true,
  })
export const s2 = scope(fixture)
  .step(async (_app: {}, ctx, next: Next<{ page2: number }>) =>
    next({ page2: Number(ctx.params.page ?? '1') }),
  )
  .step(async (app: Repos, ctx, next: Next<{ name2: string }>) => {
    const user = app.users.byId(ctx.token ?? '')
    if (!user) return refused('no session 2')
    return next({ name2: user.name })
  })
  .step({
    run: async (_app: {}, ctx: { readonly name2: string; readonly page2: number }) => ({
      who: ctx.name2,
      page: ctx.page2,
    }),
    closes: true,
  })
export const s3 = scope(fixture)
  .step(async (_app: {}, ctx, next: Next<{ page3: number }>) =>
    next({ page3: Number(ctx.params.page ?? '1') }),
  )
  .step(async (app: Repos, ctx, next: Next<{ name3: string }>) => {
    const user = app.users.byId(ctx.token ?? '')
    if (!user) return refused('no session 3')
    return next({ name3: user.name })
  })
  .step({
    run: async (_app: {}, ctx: { readonly name3: string; readonly page3: number }) => ({
      who: ctx.name3,
      page: ctx.page3,
    }),
    closes: true,
  })
export const s4 = scope(fixture)
  .step(async (_app: {}, ctx, next: Next<{ page4: number }>) =>
    next({ page4: Number(ctx.params.page ?? '1') }),
  )
  .step(async (app: Repos, ctx, next: Next<{ name4: string }>) => {
    const user = app.users.byId(ctx.token ?? '')
    if (!user) return refused('no session 4')
    return next({ name4: user.name })
  })
  .step({
    run: async (_app: {}, ctx: { readonly name4: string; readonly page4: number }) => ({
      who: ctx.name4,
      page: ctx.page4,
    }),
    closes: true,
  })
export const s5 = scope(fixture)
  .step(async (_app: {}, ctx, next: Next<{ page5: number }>) =>
    next({ page5: Number(ctx.params.page ?? '1') }),
  )
  .step(async (app: Repos, ctx, next: Next<{ name5: string }>) => {
    const user = app.users.byId(ctx.token ?? '')
    if (!user) return refused('no session 5')
    return next({ name5: user.name })
  })
  .step({
    run: async (_app: {}, ctx: { readonly name5: string; readonly page5: number }) => ({
      who: ctx.name5,
      page: ctx.page5,
    }),
    closes: true,
  })
export const s6 = scope(fixture)
  .step(async (_app: {}, ctx, next: Next<{ page6: number }>) =>
    next({ page6: Number(ctx.params.page ?? '1') }),
  )
  .step(async (app: Repos, ctx, next: Next<{ name6: string }>) => {
    const user = app.users.byId(ctx.token ?? '')
    if (!user) return refused('no session 6')
    return next({ name6: user.name })
  })
  .step({
    run: async (_app: {}, ctx: { readonly name6: string; readonly page6: number }) => ({
      who: ctx.name6,
      page: ctx.page6,
    }),
    closes: true,
  })
export const s7 = scope(fixture)
  .step(async (_app: {}, ctx, next: Next<{ page7: number }>) =>
    next({ page7: Number(ctx.params.page ?? '1') }),
  )
  .step(async (app: Repos, ctx, next: Next<{ name7: string }>) => {
    const user = app.users.byId(ctx.token ?? '')
    if (!user) return refused('no session 7')
    return next({ name7: user.name })
  })
  .step({
    run: async (_app: {}, ctx: { readonly name7: string; readonly page7: number }) => ({
      who: ctx.name7,
      page: ctx.page7,
    }),
    closes: true,
  })
export const s8 = scope(fixture)
  .step(async (_app: {}, ctx, next: Next<{ page8: number }>) =>
    next({ page8: Number(ctx.params.page ?? '1') }),
  )
  .step(async (app: Repos, ctx, next: Next<{ name8: string }>) => {
    const user = app.users.byId(ctx.token ?? '')
    if (!user) return refused('no session 8')
    return next({ name8: user.name })
  })
  .step({
    run: async (_app: {}, ctx: { readonly name8: string; readonly page8: number }) => ({
      who: ctx.name8,
      page: ctx.page8,
    }),
    closes: true,
  })
export const s9 = scope(fixture)
  .step(async (_app: {}, ctx, next: Next<{ page9: number }>) =>
    next({ page9: Number(ctx.params.page ?? '1') }),
  )
  .step(async (app: Repos, ctx, next: Next<{ name9: string }>) => {
    const user = app.users.byId(ctx.token ?? '')
    if (!user) return refused('no session 9')
    return next({ name9: user.name })
  })
  .step({
    run: async (_app: {}, ctx: { readonly name9: string; readonly page9: number }) => ({
      who: ctx.name9,
      page: ctx.page9,
    }),
    closes: true,
  })
export const s10 = scope(fixture)
  .step(async (_app: {}, ctx, next: Next<{ page10: number }>) =>
    next({ page10: Number(ctx.params.page ?? '1') }),
  )
  .step(async (app: Repos, ctx, next: Next<{ name10: string }>) => {
    const user = app.users.byId(ctx.token ?? '')
    if (!user) return refused('no session 10')
    return next({ name10: user.name })
  })
  .step({
    run: async (_app: {}, ctx: { readonly name10: string; readonly page10: number }) => ({
      who: ctx.name10,
      page: ctx.page10,
    }),
    closes: true,
  })
export const s11 = scope(fixture)
  .step(async (_app: {}, ctx, next: Next<{ page11: number }>) =>
    next({ page11: Number(ctx.params.page ?? '1') }),
  )
  .step(async (app: Repos, ctx, next: Next<{ name11: string }>) => {
    const user = app.users.byId(ctx.token ?? '')
    if (!user) return refused('no session 11')
    return next({ name11: user.name })
  })
  .step({
    run: async (_app: {}, ctx: { readonly name11: string; readonly page11: number }) => ({
      who: ctx.name11,
      page: ctx.page11,
    }),
    closes: true,
  })
export const s12 = scope(fixture)
  .step(async (_app: {}, ctx, next: Next<{ page12: number }>) =>
    next({ page12: Number(ctx.params.page ?? '1') }),
  )
  .step(async (app: Repos, ctx, next: Next<{ name12: string }>) => {
    const user = app.users.byId(ctx.token ?? '')
    if (!user) return refused('no session 12')
    return next({ name12: user.name })
  })
  .step({
    run: async (_app: {}, ctx: { readonly name12: string; readonly page12: number }) => ({
      who: ctx.name12,
      page: ctx.page12,
    }),
    closes: true,
  })
export const s13 = scope(fixture)
  .step(async (_app: {}, ctx, next: Next<{ page13: number }>) =>
    next({ page13: Number(ctx.params.page ?? '1') }),
  )
  .step(async (app: Repos, ctx, next: Next<{ name13: string }>) => {
    const user = app.users.byId(ctx.token ?? '')
    if (!user) return refused('no session 13')
    return next({ name13: user.name })
  })
  .step({
    run: async (_app: {}, ctx: { readonly name13: string; readonly page13: number }) => ({
      who: ctx.name13,
      page: ctx.page13,
    }),
    closes: true,
  })
export const s14 = scope(fixture)
  .step(async (_app: {}, ctx, next: Next<{ page14: number }>) =>
    next({ page14: Number(ctx.params.page ?? '1') }),
  )
  .step(async (app: Repos, ctx, next: Next<{ name14: string }>) => {
    const user = app.users.byId(ctx.token ?? '')
    if (!user) return refused('no session 14')
    return next({ name14: user.name })
  })
  .step({
    run: async (_app: {}, ctx: { readonly name14: string; readonly page14: number }) => ({
      who: ctx.name14,
      page: ctx.page14,
    }),
    closes: true,
  })
export const s15 = scope(fixture)
  .step(async (_app: {}, ctx, next: Next<{ page15: number }>) =>
    next({ page15: Number(ctx.params.page ?? '1') }),
  )
  .step(async (app: Repos, ctx, next: Next<{ name15: string }>) => {
    const user = app.users.byId(ctx.token ?? '')
    if (!user) return refused('no session 15')
    return next({ name15: user.name })
  })
  .step({
    run: async (_app: {}, ctx: { readonly name15: string; readonly page15: number }) => ({
      who: ctx.name15,
      page: ctx.page15,
    }),
    closes: true,
  })
export const s16 = scope(fixture)
  .step(async (_app: {}, ctx, next: Next<{ page16: number }>) =>
    next({ page16: Number(ctx.params.page ?? '1') }),
  )
  .step(async (app: Repos, ctx, next: Next<{ name16: string }>) => {
    const user = app.users.byId(ctx.token ?? '')
    if (!user) return refused('no session 16')
    return next({ name16: user.name })
  })
  .step({
    run: async (_app: {}, ctx: { readonly name16: string; readonly page16: number }) => ({
      who: ctx.name16,
      page: ctx.page16,
    }),
    closes: true,
  })
export const s17 = scope(fixture)
  .step(async (_app: {}, ctx, next: Next<{ page17: number }>) =>
    next({ page17: Number(ctx.params.page ?? '1') }),
  )
  .step(async (app: Repos, ctx, next: Next<{ name17: string }>) => {
    const user = app.users.byId(ctx.token ?? '')
    if (!user) return refused('no session 17')
    return next({ name17: user.name })
  })
  .step({
    run: async (_app: {}, ctx: { readonly name17: string; readonly page17: number }) => ({
      who: ctx.name17,
      page: ctx.page17,
    }),
    closes: true,
  })
export const s18 = scope(fixture)
  .step(async (_app: {}, ctx, next: Next<{ page18: number }>) =>
    next({ page18: Number(ctx.params.page ?? '1') }),
  )
  .step(async (app: Repos, ctx, next: Next<{ name18: string }>) => {
    const user = app.users.byId(ctx.token ?? '')
    if (!user) return refused('no session 18')
    return next({ name18: user.name })
  })
  .step({
    run: async (_app: {}, ctx: { readonly name18: string; readonly page18: number }) => ({
      who: ctx.name18,
      page: ctx.page18,
    }),
    closes: true,
  })
export const s19 = scope(fixture)
  .step(async (_app: {}, ctx, next: Next<{ page19: number }>) =>
    next({ page19: Number(ctx.params.page ?? '1') }),
  )
  .step(async (app: Repos, ctx, next: Next<{ name19: string }>) => {
    const user = app.users.byId(ctx.token ?? '')
    if (!user) return refused('no session 19')
    return next({ name19: user.name })
  })
  .step({
    run: async (_app: {}, ctx: { readonly name19: string; readonly page19: number }) => ({
      who: ctx.name19,
      page: ctx.page19,
    }),
    closes: true,
  })
export const s20 = scope(fixture)
  .step(async (_app: {}, ctx, next: Next<{ page20: number }>) =>
    next({ page20: Number(ctx.params.page ?? '1') }),
  )
  .step(async (app: Repos, ctx, next: Next<{ name20: string }>) => {
    const user = app.users.byId(ctx.token ?? '')
    if (!user) return refused('no session 20')
    return next({ name20: user.name })
  })
  .step({
    run: async (_app: {}, ctx: { readonly name20: string; readonly page20: number }) => ({
      who: ctx.name20,
      page: ctx.page20,
    }),
    closes: true,
  })
export const s21 = scope(fixture)
  .step(async (_app: {}, ctx, next: Next<{ page21: number }>) =>
    next({ page21: Number(ctx.params.page ?? '1') }),
  )
  .step(async (app: Repos, ctx, next: Next<{ name21: string }>) => {
    const user = app.users.byId(ctx.token ?? '')
    if (!user) return refused('no session 21')
    return next({ name21: user.name })
  })
  .step({
    run: async (_app: {}, ctx: { readonly name21: string; readonly page21: number }) => ({
      who: ctx.name21,
      page: ctx.page21,
    }),
    closes: true,
  })
export const s22 = scope(fixture)
  .step(async (_app: {}, ctx, next: Next<{ page22: number }>) =>
    next({ page22: Number(ctx.params.page ?? '1') }),
  )
  .step(async (app: Repos, ctx, next: Next<{ name22: string }>) => {
    const user = app.users.byId(ctx.token ?? '')
    if (!user) return refused('no session 22')
    return next({ name22: user.name })
  })
  .step({
    run: async (_app: {}, ctx: { readonly name22: string; readonly page22: number }) => ({
      who: ctx.name22,
      page: ctx.page22,
    }),
    closes: true,
  })
export const s23 = scope(fixture)
  .step(async (_app: {}, ctx, next: Next<{ page23: number }>) =>
    next({ page23: Number(ctx.params.page ?? '1') }),
  )
  .step(async (app: Repos, ctx, next: Next<{ name23: string }>) => {
    const user = app.users.byId(ctx.token ?? '')
    if (!user) return refused('no session 23')
    return next({ name23: user.name })
  })
  .step({
    run: async (_app: {}, ctx: { readonly name23: string; readonly page23: number }) => ({
      who: ctx.name23,
      page: ctx.page23,
    }),
    closes: true,
  })
