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

// A CALLER WHO HAS NOT SAID WHICH ENCODING GETS `unknown`, and that is the
// truthful answer rather than a narrowing lost. `unknown` IS the json branch, and
// a union containing `unknown` is `unknown` — every time, by the shape of the
// type lattice and not by anything this conditional does. Distributing or
// tupling gives the same six answers (measured, both forms, literals and union),
// so the plain one is written.
//
// The only way a generic caller could get something useful is for the json
// branch to be narrower than `unknown` — a `JsonValue`, say. #62 chose `unknown`
// deliberately: what the entry HOLDS before anyone validates it, and a type that
// forces a validation is the point. Changing that is a design decision, not a
// repair to this line.
export type BodyOf<E extends Encoding> = E extends 'json' ? unknown : Record<string, string | File>

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
//
// A DUPLICATED NAME KEEPS THE FIRST, which RFC 6265 does not settle and every
// neighbour does: the `cookie` package — what Express and `cookie-parser` are
// built on — keeps the first (verified: `parse('a=1; a=2')` is `{ a: '1' }`),
// and browsers send the more specific cookie first, which is usually the one
// meant to win. Keeping the last, as this did, meant code moved off
// `cookie-parser` read the OTHER value for a session or auth cookie, silently.
export const cookiesFrom = (header: string | null | undefined): Cookies => {
  const out = bag<string>()
  if (!header) return out

  for (const pair of header.split(';')) {
    const eq = pair.indexOf('=')
    if (eq < 1) continue
    const name = pair.slice(0, eq).trim()
    if (name in out) continue
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

// ── the size cap, decision 49 ─────────────────────────────────────────────────
// NO READER SHIPS WITHOUT A CEILING. Node has no default of its own — unlike
// Express's `express.json()` (100 kB) and unlike Cloudflare, which enforces one
// at the platform. A body reader that trusts the client's own idea of "small
// enough" is a DoS vector regardless of which host it runs on.
//
// 102400 bytes — `'100kb'` the way Express's own `bytes` package parses it
// (`bytes.parse('100kb') === 102400`, verified against the dependency
// `express.json()` actually uses), not the decimal 100_000 the "100 kB" name
// suggests. A caller who has never thought about this gets the SAME ceiling
// they would have had with Express, not one a few percent stricter, and a
// route that genuinely needs more raises it explicitly — `body('json',
// onError, { limit })` — which is also where the encoding already lives, a
// per-route choice from #62.
export const DEFAULT_BODY_LIMIT = 102_400

export const tooLarge = (limit: number): StandardIssue => ({
  message: `the body exceeds the ${limit} byte limit`,
})

// `content-length` is the client's OWN CLAIM and can lie — a request can name
// 10 bytes and stream forever — so this is a fast path, never the check.
// Skipped rather than failed on anything that does not parse as a number: an
// absent or malformed header is common (chunked transfer-encoding has none at
// all) and is not itself grounds to refuse the request.
export const contentLengthExceeds = (contentLength: string | undefined, limit: number): boolean => {
  if (contentLength === undefined) return false
  const n = Number(contentLength)
  return Number.isFinite(n) && n > limit
}

// Reads a Fetch `Request` body up to `limit` bytes, stopping AS SOON AS it is
// exceeded rather than buffering the whole payload first — the same shape
// Express's own loop takes below. The running total is what decides; the
// `content-length` fast path above only skips a read already known to be too
// large, it never stands in for this.
export const readLimitedBody = async (
  request: Request,
  limit: number,
): Promise<{ readonly bytes: Uint8Array } | { readonly tooLarge: true }> => {
  if (contentLengthExceeds(request.headers.get('content-length') ?? undefined, limit)) {
    return { tooLarge: true }
  }

  const body = request.body
  if (!body) return { bytes: new Uint8Array(0) }

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > limit) {
      await reader.cancel()
      return { tooLarge: true }
    }
    chunks.push(value)
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { bytes }
}

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

// ONE WORDING, reached from two places: the bytes are checked here, and a body
// someone else already parsed is checked where it is found, since there are no
// bytes left to check it against. Two copies of a sentence drift.
//
// `||` and not `??`: a header that is PRESENT AND EMPTY is `''`, which `??`
// passes straight through into the message.
export const wrongEncoding = (contentType: string | undefined, encoding: Encoding): StandardIssue => ({
  message: `the body was sent as ${contentType || 'nothing'}, not ${encoding}`,
})

// THE BYTES ARE THE INPUT, not a request, and that is what lets Express reach
// this without building a throwaway `Request` around a buffer it already holds.
// Only the `form` branch needs one, and only because `formData()` is the
// platform's own multipart reader and there is no other door to it.
//
// The CONTENT-TYPE is checked FIRST, on every path. It used to be checked only
// where a parser had run before us, on the reasoning that elsewhere a mismatch
// fails in the parse itself — true for form, and NOT true for json: bytes that
// happen to parse were accepted whatever the client called them. That gap has a
// name, and it is not tidiness. `text/plain` is one of the three content-types a
// browser may send cross-origin with NO preflight, so a JSON endpoint that
// accepts it is reachable by a forged cross-site request that
// `application/json` would have stopped at the preflight. Requiring the encoding
// the step asked for is the cheap half of CSRF that costs nothing to hold.
export const parseBody = (
  bytes: ArrayBuffer | Uint8Array,
  contentType: string | undefined,
  encoding: Encoding,
): Read | Promise<Read> => {
  if (!encodingMatches(contentType, encoding)) return { issues: [wrongEncoding(contentType, encoding)] }

  if (encoding === 'json') {
    // `fatal: true`, and the default is why: a non-fatal decoder REPLACES every
    // invalid byte with U+FFFD and hands back a string, so a payload that is not
    // UTF-8 arrived as mojibake and failed later — as a parse error if it was
    // lucky, and as silently wrong data if the damage happened inside a string.
    // The comment below used to claim the refusal that the decoder was not
    // performing.
    //
    // Any `charset` the client names is ignored on purpose: RFC 8259 requires
    // JSON exchanged between systems to be UTF-8, so a payload in anything else
    // is malformed at the protocol level and "not valid JSON" is the truthful
    // answer. Decoding whatever a client claims would be implementing a
    // violation. The `form` branch needs none of this — the bytes go back to the
    // platform's own reader with the content-type intact, charset included.
    let text: string
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      return { issues: [{ message: 'the body is not valid UTF-8' }] }
    }

    try {
      return { value: JSON.parse(text) }
    } catch {
      return { issues: [{ message: 'the body is not valid JSON' }] }
    }
  }

  return new Request('http://body.invalid', {
    method: 'POST',
    headers: { 'content-type': contentType ?? '' },
    body: bytes,
  })
    .formData()
    .then(
      (form) => {
        const out = bag<string | File>()
        for (const [name, value] of form) out[name] = value
        return { value: out } as Read
      },
      () => ({ issues: [{ message: 'the body is not a valid form payload' }] }) as Read,
    )
}

// `arrayBuffer()` READS THE WHOLE PAYLOAD BEFORE RETURNING, which is exactly
// the shape decision 49 closes: a 5 GB body would sit in memory before a single
// byte was checked. `readLimitedBody` stops as soon as `limit` is crossed, so a
// too-large body never accumulates past it — and its own verdict, not
// `content-length`, is what decides.
export const readBody = async (request: Request, encoding: Encoding, limit: number): Promise<Read> => {
  const read = await readLimitedBody(request, limit)
  return 'tooLarge' in read
    ? { issues: [tooLarge(limit)] }
    : parseBody(read.bytes, request.headers.get('content-type') ?? undefined, encoding)
}

// The tail every `body` step ends on, shared so the two families cannot answer
// a read differently.
export const finishRead = async <E extends Encoding, Ctx, R>(
  read: Read,
  ctx: Ctx,
  onError: (issues: readonly StandardIssue[], ctx: Ctx) => R,
  next: Next<{ body: BodyOf<E> }>,
): Promise<Passed | Awaited<R>> =>
  'issues' in read
    ? ((await onError(read.issues, ctx)) as Awaited<R>)
    : next({ body: read.value as BodyOf<E> })

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
  // payload that can be malformed. `limit` rides the same options bag rather
  // than a fourth positional argument, since it is the one caller in three who
  // will ever touch it — `DEFAULT_BODY_LIMIT` (decision 49) covers everyone
  // else.
  body:
    <E extends Encoding, R>(
      encoding: E,
      onError: (issues: readonly StandardIssue[], ctx: Args) => R,
      options?: { readonly limit?: number },
    ) =>
    async (_app: {}, ctx: Args, next: Next<{ body: BodyOf<E> }>): Promise<Passed | Awaited<R>> =>
      finishRead<E, Args, R>(
        await readBody(requestOf(ctx), encoding, options?.limit ?? DEFAULT_BODY_LIMIT),
        ctx,
        onError,
        next,
      ),
})
