import { hono } from '@lntt/integration/hono'
import { chain } from '../chain.ts'
import { hostEnv } from '../config/env.ts'

// The app's composition root, and the ONLY module that knows about @lntt — the
// same file the Node entries have, on a runtime that forbids what the Node ones
// merely prefer.
//
// On Node, building here EAGERLY would work; laziness is a preference. Here it
// is the rule: the pack holds a thunk and `ensure` evaluates it on the first
// request (§36), because the store layer performs asynchronous I/O and Workers
// allow none outside a request. Turn this into an `await chain.build(...)` and
// the worker stops serving — `test/module-scope.test.ts` is that experiment,
// run rather than described.
//
// `seedFrom` receives the HOST env, which on Hono is `c.env` — the reason the
// parameter exists at all. It is ignored here even so: `cloudflare:workers`
// already hands the same bindings to `config/env.ts` at module scope, so the
// config module stays the one place the environment is read, exactly as on Node.
const pack = hono(chain, () => ({ env: hostEnv() }))

export const { handler, mount, dispose } = pack
