// WHAT THE SILENT MISTAKE LOOKS LIKE IN REAL CODE.
//
// One scope, serving an article page: it produces the article's HTML, or it
// REFUSES with the HTML of a "not found" fragment. Success and refusal are the
// same type — which is not a contrived setup, it is what any renderer does, and
// what an rr7 loader does by construction.
//
// Under (a) the refusal's body and the article's body are one type, so every
// line below compiles. Each is a different way for a 404 to be served as a 200.

import { scope as caScope, type Next as CaNext } from './kernel-collapsed-a.ts'
import { scope as cbScope, type Next as CbNext, isWord } from './kernel-collapsed-b.ts'
import { collapsedA, caNotFound, collapsedB, cbNotFound } from './carriers.ts'

const article = (slug: string) => `<article>${slug}</article>`
const missing = () => `<p>Article not found.</p>`

const articleA = caScope(collapsedA)
  .step(async (_app: {}, ctx, next: CaNext<{ slug: string }>) =>
    ctx.token === null ? caNotFound(missing()) : next({ slug: ctx.token }),
  )
  .step(async (_app: {}, ctx: { readonly slug: string }) => article(ctx.slug))

const articleB = cbScope(collapsedB)
  .step(async (_app: {}, ctx, next: CbNext<{ slug: string }>) =>
    ctx.token === null ? cbNotFound(missing()) : next({ slug: ctx.token }),
  )
  .step(async (_app: {}, ctx: { readonly slug: string }) => article(ctx.slug))

// ── 1. THE LOADER ────────────────────────────────────────────────────────────
// Hands the framework whatever came back. When the scope refused, the browser
// gets the "not found" fragment with a 200 — so the reader sees an error page
// that every crawler, cache and monitor was told was a success.
export async function loader(app: {}, args: { token: string | null }) {
  const out = await articleA(app, args)
  return { html: out.value ?? '' } // ✅ compiles. Serves the refusal as the page.
}

// ── 2. THE CACHE ─────────────────────────────────────────────────────────────
// Worse, because it OUTLIVES the request: the refusal is stored under the
// article's key, and every later reader gets it until the entry expires.
declare const cache: { set(key: string, html: string): void }
export async function warm(app: {}, args: { token: string | null }, key: string) {
  const out = await articleA(app, args)
  if (out.value !== undefined) cache.set(key, out.value) // ✅ compiles. Caches a 404.
}

// ── 3. THE BATCH ─────────────────────────────────────────────────────────────
// A job rendering many articles. Refusals join the output silently, and the
// count at the end says everything succeeded.
export async function renderAll(app: {}, slugs: readonly (string | null)[]) {
  const pages: string[] = []
  for (const token of slugs) {
    const out = await articleA(app, { token })
    if (out.value !== undefined) pages.push(out.value) // ✅ compiles. Mixes refusals in.
  }
  return { rendered: pages.length, pages }
}

// ── 4. THE SEARCH INDEX ──────────────────────────────────────────────────────
declare const index: { add(id: string, body: string): void }
export async function reindex(app: {}, args: { token: string | null }, id: string) {
  const out = await articleA(app, args)
  if (out.value !== undefined) index.add(id, out.value) // ✅ compiles. Indexes "not found".
}

// ── the same four under (b) ──────────────────────────────────────────────────
// Every one of them stops compiling, because the refusal is not a string.
// …with ONE exception, and it is worth knowing: an UNANNOTATED position catches
// nothing. Returning the value into an inferred object literal simply widens
// that object's type — the refusal travels on, and surfaces at whichever typed
// position it eventually reaches, or never.
export async function loaderB_unannotated(app: {}, args: { token: string | null }) {
  const out = await articleB(app, args)
  return { html: out.result } // ✅ compiles — `html` is now `string | Word<…>`
}

// Annotate the loader's return — which a framework's own types usually do for
// you — and it bites again.
export async function loaderB(
  app: {},
  args: { token: string | null },
): Promise<{ html: string }> {
  const out = await articleB(app, args)
  // @ts-expect-error the refusal is in the way
  return { html: out.result }
}

export async function warmB(app: {}, args: { token: string | null }, key: string) {
  const out = await articleB(app, args)
  // @ts-expect-error the refusal is in the way
  cache.set(key, out.result)
}

// and this is what it takes to do it right — one line, and the refusal is
// visibly a different thing from the article
export async function loaderBFixed(app: {}, args: { token: string | null }) {
  const out = await articleB(app, args)
  return isWord(out.result)
    ? { html: out.result.value ?? '', status: 404 }
    : { html: out.result, status: 200 }
}
