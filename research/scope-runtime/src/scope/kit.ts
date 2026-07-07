import { type Abort, isAbort } from './abort.ts'

// The per-invocation namespace the host hands over. `cookies` is the mutable
// output sink (fork 2): a leaf that sets a cookie writes here, and the codec
// reads it back — the leaf's RETURN stays the domain result.
export interface CookieOptions {
  readonly path?: string
  readonly httpOnly?: boolean
  readonly maxAge?: number
}

export interface SetCookie {
  readonly name: string
  readonly value: string
  readonly options: CookieOptions
}

export interface CookieSink {
  set(name: string, value: string, options?: CookieOptions): void
}

export interface RequestScope {
  readonly request: Request
  readonly params: Record<string, string>
  readonly cookies: CookieSink
}

// A guard reads the whole app surface + the request scope + every prior
// guard's enrichment, and returns either an enrichment (merged into deps) or
// an abort (short-circuit). A leaf is the same shape minus the ability to
// enrich — and, crucially, WITHOUT the app surface: repos never reach it.
export type Guard<Deps, E extends object> = (deps: Deps) => Promise<E | Abort> | E | Abort
export type Leaf<Deps, R> = (deps: Deps) => Promise<R | Abort> | R | Abort

// The fluent guard stack: one intersection per step, exactly like the boot
// chain (fork 1). `Base` is App & RequestScope; `Acc` accumulates.
export interface GuardStack<Base extends object, Acc extends object> {
  guard<E extends object>(g: Guard<Base & Acc, E>): GuardStack<Base, Acc & E>
  readonly guards: ReadonlyArray<Guard<Base & Acc, object>>
}

function makeStack<Base extends object, Acc extends object>(
  guards: ReadonlyArray<Guard<object, object>>,
): GuardStack<Base, Acc> {
  return {
    guards: guards as ReadonlyArray<Guard<Base & Acc, object>>,
    guard<E extends object>(g: Guard<Base & Acc, E>): GuardStack<Base, Acc & E> {
      return makeStack<Base, Acc & E>([...guards, g as unknown as Guard<object, object>])
    },
  }
}

// The host-agnostic result of running a scope: the leaf's value or the abort,
// plus the cookies the sink collected. A THROW is not represented here — it
// propagates past the handler as infrastructure.
export type Outcome<R> =
  | { readonly ok: true; readonly value: R; readonly cookies: readonly SetCookie[] }
  | { readonly ok: false; readonly abort: Abort; readonly cookies: readonly SetCookie[] }

// What a host adapter consumes: give it the request + params, get an Outcome.
// The adapter owns the calling convention ↔ this, and the codec Outcome ↔
// its response. The cookie sink is created here, per invocation.
export type ScopeHandler<R> = (scope: {
  readonly request: Request
  readonly params: Record<string, string>
}) => Promise<Outcome<R>>

export interface ScopeKit<App extends object> {
  guard<E extends object>(g: Guard<App & RequestScope, E>): GuardStack<App & RequestScope, E>
  handle<Acc extends object, R>(
    stack: GuardStack<App & RequestScope, Acc>,
    leaf: Leaf<RequestScope & Acc, R>,
  ): ScopeHandler<R>
  handle<R>(leaf: Leaf<RequestScope, R>): ScopeHandler<R>
}

// scopeFor binds the kit to the app Pub (App inferred). Guards run as a typed
// imperative fold — the onion cannot express a returned abort (it requires
// `next`), so the scope tier is a dialect fold over wire, not a wire chain.
export function scopeFor<App extends object>(app: App): ScopeKit<App> {
  function handle(a: unknown, b?: unknown): ScopeHandler<unknown> {
    const guards = (b ? (a as GuardStack<object, object>).guards : []) as ReadonlyArray<
      Guard<object, object>
    >
    const leaf = (b ?? a) as Leaf<object, unknown>

    return async (partial) => {
      const pending: SetCookie[] = []
      const cookies: CookieSink = {
        set: (name, value, options = {}) => pending.push({ name, value, options }),
      }
      const scope: RequestScope = { request: partial.request, params: partial.params, cookies }

      let enrichments: Record<string, unknown> = {}
      for (const g of guards) {
        const out = await g({ ...app, ...scope, ...enrichments })
        if (isAbort(out)) return { ok: false, abort: out, cookies: pending }
        enrichments = { ...enrichments, ...out }
      }

      // The leaf sees the request scope + enrichments only — never the app.
      const result = await leaf({ ...scope, ...enrichments })
      if (isAbort(result)) return { ok: false, abort: result, cookies: pending }
      return { ok: true, value: result, cookies: pending }
    }
  }

  return {
    guard<E extends object>(g: Guard<App & RequestScope, E>): GuardStack<App & RequestScope, E> {
      return makeStack<App & RequestScope, E>([g as unknown as Guard<object, object>])
    },
    handle: handle as ScopeKit<App>['handle'],
  }
}
