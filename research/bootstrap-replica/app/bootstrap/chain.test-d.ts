import { bind } from '@lntt/wire'
import { expectTypeOf } from 'vitest'
import { verifyCode, type VerifyCodeDeps } from '../use-cases/access/verify-code.ts'
import { type App, chain } from './chain.ts'

// The type contract (principle #1): if this file breaks, a refactor is wrong
// even when the runtime tests pass.

// The public surface exists...
expectTypeOf<App>().toHaveProperty('access')
expectTypeOf<App>().toHaveProperty('profile')
expectTypeOf<App>().toHaveProperty('threads')
expectTypeOf<App>().toHaveProperty('getSession')
expectTypeOf<App>().toHaveProperty('validateEmail')

// ...and the private wiring does NOT cross the boundary (Pub/Ctx split in the
// type, not just at runtime): db, repos and the privately-mounted render leaves
// are absent from the delivered app.
expectTypeOf<App>().not.toHaveProperty('db')
expectTypeOf<App>().not.toHaveProperty('otpRepo')
expectTypeOf<App>().not.toHaveProperty('renderCache')
expectTypeOf<App>().not.toHaveProperty('getRendered')

// The Seed is mandatory: build() does not compile without { env }.
// @ts-expect-error — unmet Seed requirement
void chain.build()

// The brand (decision 16): a transactional leaf cannot be wired with plain,
// un-branded deps — only a window produces Tx<…>.
declare const plainDeps: VerifyCodeDeps
// @ts-expect-error — VerifyCodeDeps is not Tx<VerifyCodeDeps>: a window is required
void bind(plainDeps, { verifyCode })
