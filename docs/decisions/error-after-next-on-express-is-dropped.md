---
title: "On Express, an error raised after `next` is dropped, and dropped silently"
area: scope-runtime
status: accepted
---

# On Express, an error raised after `next` is dropped, and dropped silently

**Decision.** The Express mounts latch whether control has been handed on.
`toNext` calls Express's `next()` and returns at once, so the fold's promise is
still pending while the downstream handler runs. A step that throws BEFORE the
hand-on reaches Express's own error path, which is what `.catch(next)` exists
for. A step that throws AFTER `await next({})` is DROPPED: no log, no channel,
nothing.

Work that must survive the response does not belong in a step. It belongs to
the host's own mechanism for it — `waitUntil` where the platform has one, a
queue or a job where it does not — and this package neither wraps those nor
replaces them.

**Alternatives.** *Forward it with `next(err)` whatever the latch says.*
Measured, and the worst of the three: at that point it becomes a 500 for a
request that was about to answer 200, the handler's own write is discarded, and
on Express 5 the `ERR_HTTP_HEADERS_SENT` that follows is swallowed — so the
error is not reported either, and a working response was destroyed to achieve
it. *Rethrow.* An unhandled rejection, which by Node's default ends the process:
one step's late failure takes down every request in flight. *Invent a channel* —
an `onUncaught` option, an emitter, a logger as a peer dependency. Rejected on
what it would be worth: this package has no logger and no opinion about one, so
the channel would be a hook most callers never wire up, and an error delivered
to nobody through an API is not better than an error delivered to nobody. It is
worse, because the API says otherwise. *Deduplicate a second `next()` inside the
latch.* Rejected: calling `next` twice is Express's own business, and a wrapper
that quietly swallowed the second call would be a second behaviour hiding inside
a latch that exists for one thing.

**Why.** The error reaches Express only in the window where Express can still
act on it. Once control is handed on the response belongs to the handler, and an
error raised then has nowhere to go that is not worse than nowhere — which is
why the drop is silent rather than logged: there is no channel to be loud in,
and saying otherwise in a comment or an option would be a comfort rather than a
fact.

The same limit shows from the other side. A step that wanted to decorate the
response AFTER the handler would have to wait for `res.on('finish')`, which is a
different claim from "the chain answered" — by then the headers are gone and
there is nothing left to decorate. Express hands control ON; what it does not
hand back is the moment before the answer leaves.
