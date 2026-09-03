# research: no-scope hosts

**This is a research prototype, not a product.** It answers the question in
[#76](https://github.com/LunetteOrg/lunette/issues/76), the spike blocking
#60: what does a host actually need to run `@lntt/wire`, and how much of
`@lntt/scope` answers something that was ever actually observed to go wrong?

## The question, and how it was answered

The same wire chain (`src/domain/`: one repo, three bare leaves —
`getPost`, `createPost`, `publishPost`) is mounted on four hosts — Hono,
Express, tRPC, React Router — with **no scope at all**. Three routes:

| route | what it stresses |
|---|---|
| `GET /posts/:id` | a domain "not found", said in each host's own words |
| `POST /posts/:id/publish` | auth (returned vs thrown) and a redirect after a write |
| `POST /posts` | hand-rolled input validation |

Every host entry follows the `env.ts` / `bootstrap/index.ts` / `server.ts`
(or `router.ts`, or `routes/*.ts`) split used in `origin/story-30/
scope-impl`'s `examples/*`, and every handler is written the way a real
author reaches for that host's own constructs. 39 tests, `pnpm test` and
`pnpm typecheck` both green.

## 1. What each host needs, and what is duplicated four times

- **A translation from `{ notFound: true }` to "this request failed."**
  Four different translations for the identical condition: `c.notFound()`
  (Hono, `src/hono/server.ts`), a hand-written `res.status(404).json(...)`
  (Express, `src/express/server.ts`), a thrown `TRPCError({ code:
  'NOT_FOUND' })` (tRPC, `src/trpc/router.ts`), and a RETURNED `data(null, {
  status: 404 })` on React Router (`src/react-router/routes/post.ts`) —
  which is not actually equivalent to the other three (§2). Hono and
  Express speak the same protocol and could share one translation; nothing
  here lets them.
- **A decision about how to say "unauthorized," made independently per
  host, landing on two different shapes**: thrown on Hono (`HTTPException`),
  thrown on tRPC (the only door it has), thrown on React Router, and
  **returned** on Express — the one host with no idiomatic "throw to end a
  request."
- **A validation step**, written from scratch on three of the four hosts —
  same zod schema, same "parse the body, validate it, answer 422" shape, on
  Hono, Express (plus a second copy of the same judgment call in its error
  middleware), and React Router (close to a verbatim copy of Hono's).
  **tRPC needs none of this** — `.input(schema)` is the read AND the
  validation, so a malformed payload never reaches the handler at all
  (confirmed over the real HTTP adapter in `src/trpc/router.test.ts`, not
  just through `createCaller`).

## 2. Which mistakes are possible, and which are silent

**SILENT — a returned `data()` on React Router does not do what its shape
suggests.** `#76`'s own pre-verified table already states this
(`return data(null, { status: 404 })` → `statusCode: 404`, no error,
renders normally); `src/react-router/routes/post.ts` and the `"SILENT: an
unknown post is a plain 200-shaped return"` test in `routes.test.ts`
reproduce it against a handler an author actually wrote, not the table
alone. A component reading `loaderData.post.title` throws on `undefined`,
several files and a re-render away from this line.

**SILENT — the Express catch-all throws away a distinction the framework
already computed.** `express.json()` sets `err.status = 400` and
`err.type = 'entity.parse.failed'` on a genuinely malformed body, and
`src/express/server.ts`'s error middleware answers every error that
reaches it with a blanket 422, regardless of what it actually was.
`server.test.ts`'s last test reads `err.status`/`err.type` directly off
`express.json()` to show the framework did the work; the app throws it
away one line later. Trap 18 (docs/design/scope-api.md) generalised: any
infrastructure exception reaching that middleware gets reported as a
client mistake, because a catch-all is the natural thing to write and
nothing marks the difference between the two error classes on the way in.

**SILENT — the same conflation, hand-rolled, on Hono and React Router.**
`src/hono/server.ts` and `src/react-router/routes/posts.ts` each wrap the
read-and-validate step in one `catch`. Both test files force
`.json()`/`request.json()` to reject with something that is not a
`SyntaxError` — standing in for the body failing to arrive rather than
being malformed — and both report the same 422 either way. Trap 18 as
already recorded, with a receipt against code nobody derived it from.

**LOUD — auth on Hono, tRPC, React Router.** All three end the request
immediately with a status any client library surfaces as a rejection.

**LOUD — the redirect on React Router.** `redirect()` returns a real
`Response`; returning it is the native, complete mechanism.

**tRPC's `publishPost` needed no redirect at all**, and that is not a gap:
tRPC's ownership model already puts the client in charge of what happens
after a mutation succeeds, unlike the HTTP hosts where the server decides.
Porting "redirect after publish" across is a category error, not a missing
feature — nothing here suggests scope needs to invent one.

## 3. Which of scope's pieces answer a measured silence, and which do not

| scope piece | answers | status |
|---|---|---|
| **the guard shape** ("enrich, or stop with one of the carrier's words") + `unauthorized()` as a shared word | the returned-vs-thrown drift on auth: one guard, one word, and the carrier's own mount decides the mechanics per host instead of each host author picking independently | **answers a silent failure measured HERE** |
| **validation as a carrier verb (§41)**, refusing in the carrier's own word, kept separate from the raw read | trap 18 on both counts: removes the hand-rolled catch-all (duplication, §1) and keeps a genuine I/O failure a THROW instead of folding it into the same 422 a bad payload gets (§2, reproduced on Hono, Express, React Router independently) | **answers a silent failure measured HERE** |
| **the not-found vocabulary** (`notFound()` etc., shared across `http` — Hono and Express both) | the four independent not-found translations in §1, and (via re-exported `http` words) the React Router `data()`-as-error mistake in §2: with scope the author writes `notFound()`, never touches `data()` directly, and the carrier's mount decides return-vs-throw for that host | **answers a silent failure measured HERE**, and one already on record in #76's own table |
| **the route-pattern gate** (`:postId` checked against `validate('params', schema)`) | a renamed `:postId` producing no error anywhere and a runtime 422 | **answers a silent failure — already measured, not re-derived here** (this sample never renamed a param) |
| **`RequestHead`** (headless request; body only reachable via `.extend(body(...))`) | a step added after a guard reading the body only for requests that passed it | **not measured, here or on record** — argued in prose, no repro built |
| **the response envelope / `Set-Cookie` capability** | dropping a cookie a host does not flush | **not exercised** — no route here writes a cookie |
| **tRPC's `body`/`query` capability exclusion** | an app author reaching for `ctx.request`'s raw body/URL on a carrier that does not admit it | **not exercised** |
| **a redirect word on tRPC** | — | **not needed**: the ownership-model difference in §2 means there is nothing to answer |

## What this does NOT model

No database, no real environment beyond a placeholder `NODE_ENV` schema, no
cookies, no streaming, no concurrent requests.

## Retires when

#76 closes and its findings are folded into `docs/design/scope-api.md` or
a decision.
