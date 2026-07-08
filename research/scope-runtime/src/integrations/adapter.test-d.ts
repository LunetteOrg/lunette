import { Hono } from 'hono'
import expressApp, { type Express } from 'express'
import { describe, it } from 'vitest'
import { chain, type Env } from '../chain.ts'
import { courseHandler } from '../example.ts'
import { fragment } from '../scope/fragment.ts'
import { express as expressPack } from './express.ts'
import { hono, type WireEnv } from './hono.ts'
import { reactRouter } from './react-router.ts'

type Pub = Awaited<ReturnType<typeof chain.build>>['app']

const rr = reactRouter(chain, (env) => ({ env: env as Env }))
const ho = hono(chain, () => ({ env: {} as Env }))
const ex = expressPack(chain, () => ({ env: {} as Env }))

type RRContext = Awaited<ReturnType<typeof rr.mount>>

// A fragment requiring a repo the chain's Pub does NOT expose — the deps axis.
const needsBilling = fragment()
  .guard((app: { billingRepo: { charge(): void } }, _p: {}, _ctx) => {
    app.billingRepo.charge()
    return { charged: true }
  })
  .handle((deps) => ({ charged: deps.charged }))

describe('adapter contract — deps by brand, params by contravariance', () => {
  it('RR7: deps-vs-Pub is checked at toLoader (missing dep = compile error)', () => {
    // courseHandler's Need (session/admin/course repos) ⊆ Pub → accepted
    rr.toLoader(courseHandler)
    // needsBilling requires billingRepo, absent from Pub → DepGuard brand bites
    // @ts-expect-error — chain Pub is missing the fragment's required deps
    rr.toLoader(needsBilling)
  })

  it('RR7: params reconcile at the call — RP extends P (spike 4)', () => {
    const loader = rr.toLoader(courseHandler)
    const match = {} as { request: Request; params: { courseId: string }; context: RRContext }
    const superset = {} as {
      request: Request
      params: { courseId: string; extra: string }
      context: RRContext
    }
    const wrong = {} as { request: Request; params: { wrongId: string }; context: RRContext }
    // MATCH and SUBSET (route provides a superset of what the frag needs) compile
    loader(match)
    loader(superset)
    // wrong key: route lacks the required param
    // @ts-expect-error — route params { wrongId } do not satisfy required { courseId }
    loader(wrong)
  })

  it('Hono: the registrar reconciles HonoParams<Path> against the frag (spike 2)', () => {
    const app = new Hono<WireEnv<Pub>>()
    // matching path param → accepted
    ho.route(app).get('/courses/:courseId', courseHandler)
    // wrong path param name → the frag requires courseId, path yields wrongId
    // @ts-expect-error — path param { wrongId } does not satisfy required { courseId }
    ho.route(app).get('/courses/:wrongId', courseHandler)
    // missing dep is still caught at the registrar
    // @ts-expect-error — chain Pub is missing the fragment's required deps
    ho.route(app).get('/bill/:courseId', needsBilling)
  })

  it('Express: the parsed path param is reconciled against the frag (spike 3)', () => {
    const app: Express = expressApp()
    // parsed { courseId } matches the frag
    ex.route(app).get('/courses/:courseId', courseHandler)
    // parsed { wrongId } does not
    // @ts-expect-error — parsed path param { wrongId } does not satisfy { courseId }
    ex.route(app).get('/courses/:wrongId', courseHandler)
    // plain routing bypasses param typing (P = Record<string, string>): a
    // param-less frag fits any route
    const ping = fragment().handle(() => ({ pong: true }))
    ex.route(app).getPlain('/anything', ping)
  })
})
