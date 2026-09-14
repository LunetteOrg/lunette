---
title: "`body` has a size ceiling with a DEFAULT, checked while reading rather than after"
area: scope-runtime
status: accepted
---

# `body` has a size ceiling with a DEFAULT, checked while reading rather than after

**Decision.** `body(encoding, onError, { limit })` — a third, optional argument,
defaulting to `DEFAULT_BODY_LIMIT` (100 kB, aligned with `express.json()`'s own
default) when omitted. Exceeding it is a DOMAIN outcome, exactly like a
malformed payload: it reaches `onError` with an issue, never a throw.

**A reader without a ceiling is a DoS vector regardless of which host it runs
on**, and neither of the two the library shipped had one. Node carries no
default of its own anywhere — unlike Express, which gets 100 kB for free from
`express.json()`, and unlike Cloudflare, which enforces one at the platform.
The guidance [the read extensions](./read-extensions-per-host-they-populate.md) give — not to mount a body parser on a route whose scope reads
the body — had an undeclared cost: it pointed at the one path with no ceiling at all,
since removing `express.json()` removed the only thing holding one.

**Optional-and-nothing-else was rejected**: a caller who does not know to ask
for a limit is exactly the one who needs it, so the ceiling has to hold with no
argument supplied. A `limit` that must be requested to exist is not a limit,
it is a footgun with a safety catch nobody is told about.

**The default sits in the FACTORY, not the carrier**, because `body` is
already a per-route choice — the encoding was the precedent from #62 — and a
per-app ceiling would mean an upload route could never raise it without
lowering the floor for every other route in the same app.

**Where the count happens differs by family, and has to.** Express sums while
accumulating the chunks in the `for await` it already had, and returns the
moment the running total crosses the limit — a 5 GB body never sits in memory
waiting for the last chunk. The Fetch family's `arrayBuffer()` read everything
before returning at all, so it is replaced with a stream read
(`body.getReader()`) carrying the same running total. `content-length` is
checked first on both, but only as a FAST PATH that skips a read already known
to be too large — it is the client's own claim and can lie (declare 10 bytes,
stream forever), so it never substitutes for the running total, which is the
one check that cannot be lied to. A chunked-transfer request, which carries no
`content-length` at all, is caught by the count alone; pinned in
`reads.test.ts`.

**`req.destroy()` was tried on the Express path and reverted.** Node ties the
request and the socket the response has to go out on together — destroying the
one destroys the other, and the client sees a hung-up connection instead of the
413 `onError` was supposed to produce. `return`ing out of the `for await`
without touching the socket is enough: the client's remaining bytes, if it
keeps sending, sit in the kernel's own receive buffer, bounded by TCP flow
control rather than by this process's heap. Measured: the destroyed version
failed a request that a plain `return` passes.

**A pre-parsed body — `req.body` already set by other middleware — carries no
ceiling of ours.** Its bytes were already fully buffered by whatever parsed it,
before this step ever ran; checking their length afterwards would not undo the
memory already spent, and that middleware's own limit (`express.raw()` and
`express.text()` both default to 100 kB, same as `express.json()`) is what
governed the read. Out of scope for the same reason gzip decompression is
(#91): a real gap, but a different one, on a path this issue does not own.

**gzip decompression stays OUT, unchanged from #91.** `express.json()`'s
`inflate: true` is not matched here — DECLARED at the reader, not implemented
without a case in hand, same as before this issue.
