import type { Outcome } from '../carrier.ts'
import type { ScopeExtension, ScopeExtensionValue, Sink } from '../scope.ts'

// The `headers` extension — a tree-shakable subpath (`@lntt/scope/headers`).
// Like `cookies`, it owns its whole story: the sink, the effect, the reader.
// Injecting it adds the response-header sink on `ctx.headers` and declares the
// `headers` capability, so a scope that decorates its response is rejected on a
// host with no response to decorate.
//
// WHERE to write them matters. The fluent `.headers({...})` is the declarative
// form for the static case (`cache-control` on a read) and the one to reach for
// first: it states the policy at the wiring, next to the route, and leaves the
// leaf untouched. `ctx.headers` is for the dynamic case and belongs in a GUARD —
// cross-cutting concerns are what guards are for. A leaf that writes headers has
// stopped being a use case and started being a controller.
//
// `Set-Cookie` is NOT written here: it belongs to the `cookies` extension, whose
// own capability gates it. Emitting it through this sink would slip past that.
export interface HeaderSink {
  set(name: string, value: string): void
  append(name: string, value: string): void
}

export interface HeaderEffect {
  readonly headers: Headers
}

export interface HeadersExtension extends ScopeExtension {
  readonly __ctx?: { readonly headers: HeaderSink }
  readonly __caps?: { readonly headers: true }
  readonly __effects?: HeaderEffect
  readonly __methods?: { readonly headers: true }

  // Static response headers, written by a step that takes its place in the guard
  // chain where you call it. Declarative: the policy sits at the wiring, not
  // inside the domain. The same step is exported as `setHeaders` for
  // `.guard(setHeaders({...}))`, which is the form to prefer when the policy is
  // shared across scopes.
  headers<Self = this>(
    values: Readonly<Record<string, string>>,
  ): Self & { readonly __caps?: { readonly headers: true } }
}

// The step behind `.headers({...})`, exported so it can ALSO be composed
// directly: `.guard(setHeaders({...}))`. Two forms of one thing, deliberately —
// the fluent method is the comfortable one and is discoverable straight off
// `.extend(headers)`; the function is what you reach for when a policy is shared
// between scopes, or when you want the guard chain to show, at a glance, exactly
// where it runs. It is the same relation the example app keeps between a
// composed `*Scope` and the bare `*Guard` it is built from.
//
// Either way it lands where you CALL it, like any other guard:
// `.guard(a).headers({...})` runs `a` first, and a later `ctx.headers.set` on the
// same name wins.
export const setHeaders =
  (values: Readonly<Record<string, string>>) =>
  (_deps: object, ctx: object) => {
    // `ctx` is `object` here — the fold assembles it at runtime, so nothing is
    // statically visible and the sink has to be read through a cast. Its absence
    // is unreachable through the public API (`.headers()` exists only after
    // `.extend(headers)`, which registers the sink in the same call), so if it
    // IS missing something built a `Handler` by hand and left `sinks` out. That
    // is a construction bug, and it says so rather than dropping the headers on
    // the floor: a THROW is infrastructure by the error convention, which is
    // exactly what a bug of ours is.
    const sink = (ctx as { headers?: HeaderSink }).headers
    if (!sink) {
      throw new Error('@lntt/scope: no headers sink on ctx — was `.extend(headers)` injected?')
    }
    for (const [name, value] of Object.entries(values)) {
      sink.set(name, value)
    }
    return {}
  }

const headersRuntime: ScopeExtensionValue = {
  methods(state, rebuild) {
    return {
      headers(values: Readonly<Record<string, string>>) {
        return rebuild({ ...state, guards: [...state.guards, setHeaders(values)] })
      },
    }
  },
  sink: (): Sink => {
    const collected = new Headers()
    return {
      key: 'headers',
      ctx: {
        set: (name: string, value: string) => collected.set(name, value),
        append: (name: string, value: string) => collected.append(name, value),
      } satisfies HeaderSink,
      collect: () => collected,
    }
  },
}

export const headers = headersRuntime as unknown as HeadersExtension

export const readHeaders = (outcome: Outcome<unknown, object>): Headers =>
  (outcome.effects as Partial<HeaderEffect>).headers ?? new Headers()
