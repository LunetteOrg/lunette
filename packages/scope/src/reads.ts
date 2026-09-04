// The four READ entries, and the half of their extraction that is shared.
//
// INTERNAL: no `exports` entry points here. What ships is each carrier's own
// `query`/`cookies`/`headers`/`body`, from its own subpath, because there is no
// generic way to read a request — Express's `req.query` is already parsed by qs,
// Hono has `c.req.queries()`, React Router has a Fetch `Request`, tRPC has no URL
// at all. Four extractions, never one with a branch inside.
//
// WHAT IS SHARED IS THE ENTRY SHAPE, and that is the whole point of the slice.
// The extraction is per host; everything DOWNSTREAM of it is not. A step
// annotating `{ query: Query }` names no carrier, so it mounts wherever a
// `query` entry was populated — which is the middle ground that does not exist
// today, since the four hosts share no argument name.
//
// The raw type is what the entry HOLDS before anyone validates it, and that is
// its whole job: `ctx.query.page` is `string | string[]` and readable as it is.
// `.validate('query', schema, onError)` refines it afterwards.

import type { Next, Passed } from './index.ts'
import type { StandardIssue } from './guard/index.ts'

export type Query = Record<string, string | string[]>
export type Cookies = Record<string, string>
export type Headers_ = Record<string, string>

// `body('json')` holds `unknown` — parsed, but nothing has said what it is yet.
// `body('form')` holds the fields as sent. ONE ctx key either way, so a leaf
// shared between an API route and a browser-form route reads `ctx.body` in both:
// the shape difference lives in the SCHEMA, the encoding at the wiring.
export type Encoding = 'json' | 'form'

// `[E]` and not `E`: a NAKED conditional distributes over a union, so an `E`
// inferred as the whole `'json' | 'form'` — which is what happens the moment a
// caller wraps `body(encoding, onError)` in a helper of their own — would give
// `unknown | Record<…>`, and that collapses to `unknown`. The narrowing would be
// gone with nothing failing anywhere. Tupled, the union is matched as a whole
// and a caller who really is generic gets the union of both, which is the
// truthful answer.
export type BodyOf<E extends Encoding> = [E] extends ['json']
  ? unknown
  : [E] extends ['form']
    ? Record<string, string | File>
    : unknown | Record<string, string | File>

// ── the readers, over the two shapes every Fetch-based host really has ───────
// `URLSearchParams` and `Headers` are what Hono and React Router both hold, and
// what Express can be adapted to in two lines. Repeated keys become an array,
// which is the one thing every host's own reader disagrees about and the reason
// the shape is stated here rather than borrowed.
// EVERY KEY BELOW IS THE CLIENT'S, so the bags they fill have a NULL prototype.
// On an ordinary object literal `out['__proto__'] = value` runs the inherited
// setter instead of creating an own property: the value vanishes without a word,
// and a crafted `__proto__` can reach the prototype of the object handed to a
// step. `Object.create(null)` has no setter to reach, which removes the case
// rather than blocking a list of names — a list would need to grow every time
// the language does.
const bag = <T>(): Record<string, T> => Object.create(null) as Record<string, T>

export const queryFrom = (params: URLSearchParams): Query => {
  const out = bag<string | string[]>()
  for (const key of new Set(params.keys())) {
    const all = params.getAll(key)
    out[key] = all.length > 1 ? all : (all[0] as string)
  }
  return out
}

export const headersFrom = (headers: Iterable<readonly [string, string]>): Headers_ => {
  const out = bag<string>()
  for (const [name, value] of headers) out[name.toLowerCase()] = value
  return out
}

// A cookie value may contain `=`, so only the FIRST one splits. Decoding is
// `decodeURIComponent` and a malformed escape does not throw the request away:
// a cookie is client-controlled, so a broken one is skipped rather than being
// allowed to end the run.
export const cookiesFrom = (header: string | null | undefined): Cookies => {
  const out = bag<string>()
  if (!header) return out

  for (const pair of header.split(';')) {
    const eq = pair.indexOf('=')
    if (eq < 1) continue
    const name = pair.slice(0, eq).trim()
    const raw = pair.slice(eq + 1).trim()
    try {
      out[name] = decodeURIComponent(raw)
    } catch {
      out[name] = raw
    }
  }
  return out
}

// ── the body, where reading and parsing fail for OPPOSITE reasons ────────────
// This is the distinction that cost a bug once, and it is why the two halves
// are written apart rather than under one `try`.
//
// `arrayBuffer()` is I/O: it rejects when the stream dies — a reset socket, an
// aborted upload — and that is INFRASTRUCTURE, left to propagate as a throw.
// Parsing bytes already in hand is the client's mistake, a DOMAIN outcome, and
// comes back as issues for the caller's `onError`. A single `catch` over both
// told the client its payload was malformed when the connection had broken,
// hiding a 5xx behind a 4xx.
//
// Which is also why `form` does not simply call `request.formData()`: that does
// the read and the parse in one call, and a failure could not be told from a
// dead connection. The bytes are taken first, then a throwaway request is built
// around them so the host's own multipart reader does the parsing over data that
// is already here.
export type Read = { readonly value: unknown } | { readonly issues: readonly StandardIssue[] }

// Does what the client SAID match what the step asked for? Only the pre-parsed
// path needs this: where the bytes are ours, a mismatch fails in the parse
// itself — `JSON.parse` over a form payload throws, `formData()` over
// `application/json` throws — and the answer is the same. Where a parser ran
// before us there is nothing left to fail, so the claim has to be checked
// against the only evidence left, which is the header the client sent.
export const mediaTypeOf = (contentType: string | undefined): string =>
  (contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? ''

export const encodingMatches = (contentType: string | undefined, encoding: Encoding): boolean => {
  const type = mediaTypeOf(contentType)
  return encoding === 'json'
    ? type === 'application/json' || type.endsWith('+json')
    : type === 'application/x-www-form-urlencoded' || type === 'multipart/form-data'
}

// MULTIPART IS THE ONE ENCODING A PRE-PARSED BODY CANNOT CARRY WHOLE. The
// middleware that parsed it — multer is the usual one — puts the FIELDS on
// `req.body` and the FILES somewhere of its own (`req.file`, `req.files`), so
// the object left behind is half the payload while `BodyOf<'form'>` promises
// `string | File`. Half a body handed over as a whole one is the silent kind of
// wrong, so it is refused instead.
export const isMultipart = (contentType: string | undefined): boolean =>
  mediaTypeOf(contentType) === 'multipart/form-data'

export const readBody = async (request: Request, encoding: Encoding): Promise<Read> => {
  const bytes = await request.arrayBuffer()

  if (encoding === 'json') {
    // UTF-8, and any `charset` on the request is deliberately ignored: RFC 8259
    // requires JSON exchanged between systems to be encoded in UTF-8, so a
    // payload in anything else is malformed at the protocol level and "not valid
    // JSON" is the truthful answer rather than a false one. Decoding whatever a
    // client claims would be implementing a violation. The `form` branch needs
    // none of this — it hands the bytes back to the platform's own reader with
    // the original content-type, charset included.
    const text = new TextDecoder().decode(bytes)
    try {
      return { value: JSON.parse(text) }
    } catch {
      return { issues: [{ message: 'the body is not valid JSON' }] }
    }
  }

  try {
    const form = await new Request('http://body.invalid', {
      method: 'POST',
      headers: { 'content-type': request.headers.get('content-type') ?? '' },
      body: bytes,
    }).formData()

    const out = bag<string | File>()
    for (const [name, value] of form) out[name] = value
    return { value: out }
  } catch {
    return { issues: [{ message: 'the body is not a valid form payload' }] }
  }
}

// ── the four steps, built ONCE for the whole Fetch family ────────────────────
// Hono and React Router differ in exactly one thing: where the `Request` is
// found — `c.req.raw` on one, `request` on the other. Everything else was
// duplicated verbatim between the two subpaths, so a fix to the typing had to be
// applied twice by hand. It is written here instead, and each subpath passes its
// one line.
//
// Express is NOT of this family: `req` is a Node message, so its four are
// written against that and adapt to these readers at the edge.
export const fetchReads = <Args extends object>(requestOf: (ctx: Args) => Request) => ({
  query: async (_app: {}, ctx: Args, next: Next<{ query: Query }>) =>
    next({ query: queryFrom(new URL(requestOf(ctx).url).searchParams) }),

  headers: async (_app: {}, ctx: Args, next: Next<{ headers: Headers_ }>) =>
    next({ headers: headersFrom(requestOf(ctx).headers) }),

  cookies: async (_app: {}, ctx: Args, next: Next<{ cookies: Cookies }>) =>
    next({ cookies: cookiesFrom(requestOf(ctx).headers.get('cookie')) }),

  // A FACTORY, because a populated `ctx.body` has already been parsed and the
  // encoding is a per-route choice. It takes an `onError` where the other three
  // do not, and the asymmetry has a reason: `body` is the only one carrying a
  // payload that can be malformed.
  body:
    <E extends Encoding, R>(
      encoding: E,
      onError: (issues: readonly StandardIssue[], ctx: Args) => R,
    ) =>
    async (_app: {}, ctx: Args, next: Next<{ body: BodyOf<E> }>): Promise<Passed | Awaited<R>> => {
      const read = await readBody(requestOf(ctx), encoding)
      if ('issues' in read) return onError(read.issues, ctx) as Awaited<R>
      return next({ body: read.value as BodyOf<E> })
    },
})
