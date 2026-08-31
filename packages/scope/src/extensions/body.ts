import type { Channel, ScopeExtensionValue, Step } from '../scope.ts'

// The `body` channel — a tree-shakable subpath (`@lntt/scope/body`). It is a
// FACTORY, not a value, because a populated `ctx.body` has already been parsed:
// the channel cannot put the body on the ctx without knowing how to decode it,
// so the encoding is chosen where the channel is added.
//
//   .extend(body('json'))   // ctx.body from application/json
//   .extend(body('form'))   // ctx.body from multipart/urlencoded
//
// ONE ctx key either way. A leaf shared between an API route and a browser-form
// route reads `ctx.body` in both and needs no adaptation; the shape difference
// lives in the schema, where a form coerces its strings. Two keys forced a
// hand-written remapping at every shared leaf.
//
// We ship no `json`/`form` aliases. A codebase that wants them writes
// `const json = body('json')` once — sugar a caller can build is not API we owe
// (principle 5).
//
// Extending it flows the `body` capability, which the adapter's `CarrierGuard`
// gates at the mount: a body scope is REJECTED on tRPC, which has no readable
// body. The earlier protection is the carrier's `__admits`, refusing the
// `.extend` itself on a protocol that cannot carry the encoding at all.
//
// The cost of populating rather than fetching on demand: the parse runs on
// every request, even when a guard aborts before anything reads `ctx.body`.
// That is deliberate — `ctx.body` is there, so it was read. A lazy accessor
// would be an async getter inside a synchronous ctx, which is worse than the
// read and is ambient magic (principle 7).
export type BodyFormat = 'json' | 'form'

export interface BodyChannel<Raw, F extends BodyFormat> extends Channel {
  // The feature it needs is a READABLE BODY — the same one for either
  // encoding, because what a transport either has or has not is the body, not
  // the parser. A carrier that could read JSON but not multipart would need two
  // names; none does, and inventing the split now would put a second name in
  // every carrier for a distinction no mount makes.
  readonly __admission: { readonly body: true }
  readonly __caps?: { readonly body: true }
  readonly __validatable?: { readonly body: Raw }
}

// The raw type each encoding leaves on `ctx.body` before anyone validates it.
// A JSON body is `unknown` — bytes that parsed, with no shape until a schema
// gives it one; a form is always a record of fields.
export type RawFor<F extends BodyFormat> = F extends 'form'
  ? Readonly<Record<string, string | File>>
  : unknown

export type JsonBody = BodyChannel<unknown, 'json'>
export type FormBody = BodyChannel<Readonly<Record<string, string | File>>, 'form'>

const parsers: Readonly<Record<BodyFormat, (bytes: ArrayBuffer, headers: Headers) => Promise<unknown>>> =
  {
    json: async (bytes) => JSON.parse(new TextDecoder().decode(bytes)),
    // Parsing bytes already in hand: `Response` is the standard form parser, and
    // handing it a buffer keeps the parse free of any I/O of its own.
    form: async (bytes, headers) =>
      Object.fromEntries(await new Response(bytes, { headers }).formData()),
  }

const step =
  (format: BodyFormat): Step =>
  async (_app, ctx, next) => {
    const request = (ctx as { request?: Request }).request
    // READING and PARSING are separated, because they fail for opposite
    // reasons and the error convention (principle 3) sends them opposite ways.
    //
    // `arrayBuffer()` is the I/O: it rejects when the stream dies — a reset
    // socket, an aborted upload — and that THROW is left to propagate as
    // infrastructure. Catching it here told the client its payload was
    // malformed when the truth was that the connection broke, hiding a 5xx
    // behind a 4xx.
    //
    // Parsing the bytes is the domain half: malformed JSON, a body that is not
    // a form. That IS the client's mistake, so it collapses to `undefined` and
    // whatever schema `validate('body', …)` registered turns it into the
    // RETURNED 422 this convention wants.
    const raw =
      request === undefined
        ? undefined
        : await parsers[format](await request.arrayBuffer(), request.headers).catch(
            () => undefined,
          )
    return next({ body: raw })
  }

// ONE generic signature rather than two overloads: overloads refuse a union
// argument, so a caller holding `'json' | 'form'` (a test harness, a wiring that
// picks the encoding from config) could not call this at all.
export function body<F extends BodyFormat>(format: F): BodyChannel<RawFor<F>, F> {
  const runtime: ScopeExtensionValue = { step: step(format) }
  return runtime as unknown as BodyChannel<RawFor<F>, F>
}
