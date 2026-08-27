import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Abort } from '../abort.ts'
import type { OutputOf } from '../schema.ts'
import type { Prepare, ScopeExtension, ScopeExtensionValue } from '../scope.ts'
import { validateInput } from '../validate.ts'

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
  (key: 'body' | 'form', parse: (bytes: ArrayBuffer, headers: Headers) => Promise<unknown>) =>
  (schema: StandardSchemaV1): Prepare =>
  async (carrier): Promise<object | Abort> => {
    const req = (carrier as { request?: Request }).request
    // READING and PARSING are separated, because they fail for opposite
    // reasons and the error convention (principle 3) sends them opposite ways.
    //
    // `arrayBuffer()` is the I/O: it rejects when the stream dies — a reset
    // socket, an aborted upload — and that THROW is left to propagate as
    // infrastructure. Catching it here (which is what a single
    // `read(req).catch(() => undefined)` did) told the client its payload was
    // malformed when the truth was that the connection broke, and hid a 5xx
    // behind a 4xx.
    //
    // Parsing the bytes is the domain half: malformed JSON, a body that is not
    // a form. That IS the client's mistake, so it collapses to `undefined` and
    // the schema turns it into the RETURNED 422 this convention wants.
    const raw =
      req === undefined
        ? undefined
        : await parse(await req.arrayBuffer(), req.headers).catch(() => undefined)
    const v = await validateInput(schema, raw)
    return v.ok ? { [key]: v.params } : v.abort
  }

const bodyStep = channel('body', async (bytes) =>
  JSON.parse(new TextDecoder().decode(bytes)),
)
// Parsing bytes already in hand: `Response` is the standard form parser, and
// handing it a buffer keeps the parse free of any I/O of its own.
const formStep = channel('form', async (bytes, headers) =>
  Object.fromEntries(await new Response(bytes, { headers }).formData()),
)

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
