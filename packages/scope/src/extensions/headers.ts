import type { Outcome } from '../carrier.ts'
import type { Step } from '../fold.ts'
import type { Channel, ScopeExtensionValue } from '../scope.ts'

// The `headers` channel — WRITING response headers (`@lntt/scope/headers`).
// Like `cookies`, it owns its whole story: the sink, the effect, the reader, and
// it lands at `ctx.response.headers` for the same reason (reads at the top
// level, writes under `response`). Extending it declares the
// `response-headers` capability, so a scope that decorates its response is
// rejected on a host with no response to decorate.
//
// WHERE to write them matters. The fluent `.headers({...})` is the declarative
// form for the static case (`cache-control` on a read) and the one to reach for
// first: it states the policy at the wiring, next to the route, and leaves the
// leaf untouched. `ctx.response.headers` is for the dynamic case and belongs in
// a GUARD — cross-cutting concerns are what guards are for. A leaf that writes
// headers has stopped being a use case and started being a controller.
//
// `Set-Cookie` is NOT written here: it belongs to the `cookies` channel, whose
// own capability gates it. Emitting it through this sink would slip past that.
export interface HeaderSink {
  set(name: string, value: string): void
  append(name: string, value: string): void
}

export interface HeaderEffect {
  readonly headers: Headers
}

export interface HeadersChannel extends Channel {
  readonly __admission: { readonly 'response-headers': true }
  readonly __ctx?: { readonly response: { readonly headers: HeaderSink } }
  readonly __caps?: { readonly 'response-headers': true }
  readonly __effects?: HeaderEffect

  // Static response headers, written by a step that takes its place in the guard
  // chain where you call it. Declarative: the policy sits at the wiring, not
  // inside the domain. The same step is exported as `setHeaders` for
  // `.guard(setHeaders({...}))`, which is the form to prefer when the policy is
  // shared across scopes.
  headers<Self = this>(
    values: Readonly<Record<string, string>>,
  ): Self & { readonly __caps?: { readonly 'response-headers': true } }
}

// The step behind `.headers({...})`, and NOT exported. It used to be, so a
// shared policy could be composed as `.guard(setHeaders({...}))` — but under
// the step primitive that second form buys nothing a shared VALUE does not
// (`const cache = { 'cache-control': … }`, then `.headers(cache)`), and one way
// to do each thing is the rule (principle 5).
//
// It lands where you CALL it, like anything else in the stack:
// `.guard(a).headers({...})` runs `a` first, and a later
// `ctx.response.headers.set` on the same name wins.
const setHeaders =
  (values: Readonly<Record<string, string>>): Step =>
  (_app, ctx, next) => {
    // `ctx` is `object` here — the fold assembles it at runtime, so nothing is
    // statically visible and the sink has to be read through a cast. Its absence
    // is unreachable through the public API (`.headers()` exists only after
    // `.extend(headers)`, which registers the sink in the same call), so if it
    // IS missing something built a `Handler` by hand and left `sinks` out. That
    // is a construction bug, and it says so rather than dropping the headers on
    // the floor: a THROW is infrastructure by the error convention, which is
    // exactly what a bug of ours is.
    const sink = (ctx as { response?: { headers?: HeaderSink } }).response?.headers
    if (!sink) {
      throw new Error('@lntt/scope: no headers sink on ctx — was `.extend(headers)` added?')
    }
    for (const [name, value] of Object.entries(values)) {
      sink.set(name, value)
    }
    return next({})
  }

const runtime: ScopeExtensionValue = {
  // A method is a function from its arguments to a STEP. It never sees the
  // builder's state or a rebuild callback — the core does the pushing, which is
  // the only thing any method here was ever doing with them.
  methods: { headers: setHeaders },
  step: async (_app, ctx, next) => {
    const collected = new Headers()
    const sink: HeaderSink = {
      set: (name, value) => collected.set(name, value),
      append: (name, value) => collected.append(name, value),
    }
    const response = (ctx as { response?: object }).response
    const out = await next({ response: { ...response, headers: sink } })
    return { ...out, effects: { ...out.effects, headers: collected } }
  },
}

export const headers = runtime as unknown as HeadersChannel

export const readHeaders = (outcome: Outcome<unknown, object>): Headers =>
  (outcome.effects as Partial<HeaderEffect>).headers ?? new Headers()
