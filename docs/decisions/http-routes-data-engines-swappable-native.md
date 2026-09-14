---
title: "HTTP: routes as data, engines swappable — and native dialects too"
area: extensibility
status: accepted
---

# HTTP: routes as data, engines swappable — and native dialects too

**Decision.** The engine-agnostic dialect treats routes as data
(method + path + flat handler over the chain's Pub) with engines as
adapters; native dialects (`@lntt/http/hono`, `@lntt/http/express`)
expose the full framework wired with the chain's deps, with the
non-portability trade-off declared. Native middleware is allowed but
confined to the engine's `setup` block. A framework sub-app is just a
context value: vertical blocks are chains exposing their sub-app, the
main app mounts them with the framework's own composition.

**Why.** Portability comes from routes being *data*, not from where the
dot-method lives; and when a team wants the framework's full power, the
dialect should hand it over instead of wrapping it.
