// Research prototype — order-free layers, Effect-like but without monads.
//
// A layer declares what it requires (runtime keys + the type of its ctx)
// and what it provides (the return of provides). build() resolves them in
// dependency order, so the argument order is free — unlike a sequential
// chain. This runtime knowledge of "what a layer reads" is what a
// parallel scheduler would need.
//
// The completeness check is at compile time: ValidateLayers replaces any
// layer whose requirements are not covered by the union of all provides
// with an error type naming the missing dependencies.
//
// Accepted trade-off (and why @lntt/wire did not adopt this): `requires`
// is declared twice (runtime key list + the provides parameter
// annotation) and TypeScript does not enforce consistency between the
// two. The alternative is an Effect-style central tag registry — exactly
// the rigidity the project avoids.

type Patch = object

export type Layer<R extends object, P extends Patch> = {
  requires: readonly (keyof R & string)[]
  provides: (ctx: R) => P | Promise<P>
}

export function layer<R extends object, P extends Patch>(
  def: Layer<R, P>,
): Layer<R, P> {
  return def
}

type AnyLayer = Layer<any, any>

type RequiresOf<L> = L extends Layer<infer R, any> ? R : never
type ProvidesOf<L> = L extends Layer<any, infer P> ? P : never

type UnionToIntersection<U> = (
  U extends any ? (k: U) => void : never
) extends (k: infer I) => void
  ? I
  : never

type AllProvides<Ls extends AnyLayer[]> = UnionToIntersection<
  ProvidesOf<Ls[number]>
>

type Missing<R, Available> = {
  [K in Exclude<keyof R, keyof Available>]: R[K]
}

type ValidateLayers<Ls extends AnyLayer[]> = {
  [I in keyof Ls]: AllProvides<Ls> extends RequiresOf<Ls[I]>
    ? Ls[I]
    : {
        '⛔ this layer requires dependencies no layer provides': Missing<
          RequiresOf<Ls[I]>,
          AllProvides<Ls>
        >
      }
}

// Flattens the intersection for readable tooltips.
type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never

export async function build<Ls extends AnyLayer[]>(
  ...layers: Ls & ValidateLayers<Ls>
): Promise<Expand<AllProvides<Ls>>> {
  const pending: AnyLayer[] = [...layers]
  const ctx: Record<string, unknown> = {}

  while (pending.length > 0) {
    const idx = pending.findIndex((l) =>
      l.requires.every((key: string) => key in ctx),
    )
    if (idx === -1) {
      const stuck = pending
        .map((l) => `[requires: ${l.requires.join(', ')}]`)
        .join(' ')
      throw new Error(`Unresolvable or cyclic dependencies: ${stuck}`)
    }
    const [next] = pending.splice(idx, 1)
    Object.assign(ctx, await next!.provides(ctx))
  }

  return ctx as Expand<AllProvides<Ls>>
}
