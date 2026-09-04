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

import type { StandardIssue } from './guard/index.ts'

export type Query = Record<string, string | string[]>
export type Cookies = Record<string, string>
export type Headers_ = Record<string, string>

// `body('json')` holds `unknown` — parsed, but nothing has said what it is yet.
// `body('form')` holds the fields as sent. ONE ctx key either way, so a leaf
// shared between an API route and a browser-form route reads `ctx.body` in both:
// the shape difference lives in the SCHEMA, the encoding at the wiring.
export type Encoding = 'json' | 'form'

export type BodyOf<E extends Encoding> = E extends 'json'
  ? unknown
  : Record<string, string | File>

// ── the readers, over the two shapes every Fetch-based host really has ───────
// `URLSearchParams` and `Headers` are what Hono and React Router both hold, and
// what Express can be adapted to in two lines. Repeated keys become an array,
// which is the one thing every host's own reader disagrees about and the reason
// the shape is stated here rather than borrowed.
export const queryFrom = (params: URLSearchParams): Query => {
  const out: Record<string, string | string[]> = {}
  for (const key of new Set(params.keys())) {
    const all = params.getAll(key)
    out[key] = all.length > 1 ? all : (all[0] as string)
  }
  return out
}

export const headersFrom = (headers: Iterable<readonly [string, string]>): Headers_ => {
  const out: Record<string, string> = {}
  for (const [name, value] of headers) out[name.toLowerCase()] = value
  return out
}

// A cookie value may contain `=`, so only the FIRST one splits. Decoding is
// `decodeURIComponent` and a malformed escape does not throw the request away:
// a cookie is client-controlled, so a broken one is skipped rather than being
// allowed to end the run.
export const cookiesFrom = (header: string | null | undefined): Cookies => {
  const out: Record<string, string> = {}
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

export const readBody = async (request: Request, encoding: Encoding): Promise<Read> => {
  const bytes = await request.arrayBuffer()

  if (encoding === 'json') {
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

    const out: Record<string, string | File> = {}
    for (const [name, value] of form) out[name] = value
    return { value: out }
  } catch {
    return { issues: [{ message: 'the body is not a valid form payload' }] }
  }
}
