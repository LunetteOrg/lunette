// LOAD-BEARING gate proof (design A — carrier capabilities). A scope that
// declares a body channel (`.body`/`.form`) carries the `body` capability, so
// the tRPC adapter — whose carrier provides NO readable body — REJECTS it at the
// `toProcedure` mount site, naming the missing capability, while the body-capable
// hosts (Hono/Express/RR7) accept it. Removing the `@ts-expect-error` must break
// typecheck: that is the whole point of A-full (a compile error, not a silent
// empty-body read at runtime).

import { initTRPC } from '@trpc/server'
import { z } from 'zod'
import { scope } from '@lntt/scope'
import { body } from '@lntt/scope/body'
import { http } from '@lntt/scope/http'
import { chain, type App } from './fixture/chain.ts'
import { toProcedure } from '../src/trpc.ts'
import { hono } from '../src/hono.ts'

// A body-reading scope with NO app deps, so DepGuard is trivially satisfied
// and only the CARRIER capability gate is under test.
const writeFrag = scope().extend(body)
  .body(z.object({ title: z.string() }))
  .handle((_deps: {}, ctx) => ({ echoed: ctx.body.title }))

// A param-only read scope — requires no capability (Cap = never). `.extend
// (http)` is only how a bare `scope()` gets an input verb at all (the core
// has none); it declares no intent this scope's guard/leaf ever uses, so the
// intent axis stays irrelevant to what this file tests.
const readFrag = scope()
  .extend(http)
  .params(z.object({ id: z.string() }))
  .handle((_deps: {}, ctx) => ({ id: ctx.params.id }))

// ── a body-capable host ACCEPTS the write scope ──────────────────────────
const w = hono(chain, () => ({ env: { label: 'x' } }))
w.handler('/echo', writeFrag) // compiles: Hono's carrier provides 'body'
w.handler('/read/:id', readFrag)

// ── tRPC ACCEPTS reads but REJECTS the body scope at the mount site ───────
type Ctx = App & { request: Request }
const t = initTRPC.context<Ctx>().create()
toProcedure(t.procedure, readFrag)
// @ts-expect-error host missing capability 'body' — a .body scope cannot mount on tRPC
toProcedure(t.procedure, writeFrag)
