// Test helpers — import from `@lntt/wire/testing`.
//
// The mocking mechanism is NOT here: it is already in the algebra, and it
// is the SEED. The canonical pattern: the wiring lives in a fragment that
// declares its infrastructure as a requirement (it does not build it); in
// production you mount it after the real infrastructure, in tests you run
// it with a seed of fakes — so no real resource is even CREATED:
//
//   export const modules = lunette<{ db: Db }>().expose(authModule)
//
//   // production
//   lunette().use(withDb).expose(modules).build(env)
//   // test
//   await modules.run({ db: fake<Db>({ query: async () => rows }) },
//     async (app) => { ...assertions... })
//
// `override` remains for POSITIONAL replacements (it affects downstream
// layers: already-wired closures are not rewritten, and the original
// layer still runs) — see the test suite for the documented pitfall.
//
// When restructuring around the seed is not ergonomic, there is
// `test(chain)`: its run accepts PER-KEY substitutions, applied at the
// key's birth — downstream closures receive the fake, wherever the
// provide sits in the chain. Physical caveat: the real layer still runs
// (you cannot know what it provides without executing it) — combine with
// lazy() and even the real creation disappears, and the keyed verb forms
// (provide('db', ...)) make the layer skippable outright. The
// substitutable keys are the chain's Ctx keys: privates of mounted
// fragments stay encapsulated (test the fragment to test those).

import { Lunette } from './index.ts'

type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never

export const test = <
  Ctx extends object,
  Pub extends object,
  Seed extends object,
>(
  chain: Lunette<Ctx, Pub, Seed>,
) => ({
  run: <T>(
    input: Seed & Partial<Expand<Ctx>>,
    scope: (app: Expand<Pub>) => T | Promise<T>,
  ): Promise<T> => Lunette.testRun(chain, input, scope),
})

// A strict partial stub: stubbed members respond, touching a member that
// was NOT stubbed throws right away with its name — instead of the
// classic `undefined is not a function` three frames later.
export const fake = <T extends object>(partial: Partial<T> = {}): T =>
  new Proxy(partial as T, {
    get(target, key, receiver) {
      if (key in target || typeof key === 'symbol') {
        return Reflect.get(target, key, receiver)
      }
      // Structural accesses from the runtime/test runner (await,
      // serialization): not the code under test using a dependency.
      if (key === 'then' || key === 'toJSON' || key === 'constructor') {
        return undefined
      }
      throw new Error(`fake: property not stubbed: ${String(key)}`)
    },
  })
