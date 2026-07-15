import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Abort } from './abort.ts'
import type { OutputOf } from './schema.ts'
import type { Prepare, ScopeExtension, ScopeExtensionValue } from './scope.ts'
import { validateInput } from './validate.ts'

// The `body` extension — a tree-shakable subpath (`@lntt/scope/body`). Injecting
// it (`scope().extend(body)`) adds the declared body channels `.body` / `.form`.
// Each fixes a Standard Schema for the request body, exposes the validated value
// on `ctx.body` / `ctx.form` (via `__acc`), and flows the `body` capability
// (`__caps`) — which the adapter's `CarrierGuard` gates at the mount site: a body
// scope is REJECTED on tRPC (no readable body). But the primary protection is
// earlier — a scope authored without `.extend(body)` (e.g. a tRPC read) does not
// have `.body`/`.form` on its builder at all, so the mistake cannot be written.
// Explicit by content shape: `.body` = JSON, `.form` = multipart/urlencoded.
export interface BodyExtension extends ScopeExtension {
  readonly __methods?: { readonly body: true; readonly form: true }

  body<B extends StandardSchemaV1, Self = this>(
    this: Self,
    schema: B,
  ): Self & { readonly __acc?: { readonly body: OutputOf<B> }; readonly __caps?: { readonly body: true } }
  form<F extends StandardSchemaV1, Self = this>(
    this: Self,
    schema: F,
  ): Self & { readonly __acc?: { readonly form: OutputOf<F> }; readonly __caps?: { readonly body: true } }
}

// The parse-and-validate step OWNED by this extension: read the channel off the
// RAW carrier (`carrier.request` is a full Fetch `Request` with a readable body —
// distinct from the headless `ctx.request` a guard sees) and validate it into the
// named ctx key, or RETURN a 422 abort. Pushed as a core `prepare` step, so the
// fold runs it without knowing what it is.
const channel =
  (key: 'body' | 'form', read: (req: Request) => Promise<unknown>) =>
  (schema: StandardSchemaV1): Prepare =>
  async (carrier): Promise<object | Abort> => {
    const req = (carrier as { request?: Request }).request
    const raw = req ? await read(req).catch(() => undefined) : undefined
    const v = await validateInput(schema, raw)
    return v.ok ? { [key]: v.params } : v.abort
  }

const bodyStep = channel('body', (req) => req.json())
const formStep = channel('form', async (req) => Object.fromEntries(await req.formData()))

// `.body`/`.form` push their prepare step onto the builder state.
const bodyRuntime: ScopeExtensionValue = {
  methods(state, rebuild) {
    return {
      body(schema: StandardSchemaV1) {
        return rebuild({ ...state, prepare: [...state.prepare, bodyStep(schema)] })
      },
      form(schema: StandardSchemaV1) {
        return rebuild({ ...state, prepare: [...state.prepare, formStep(schema)] })
      },
    }
  },
}

export const body = bodyRuntime as unknown as BodyExtension
