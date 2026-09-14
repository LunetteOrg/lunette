---
title: "Classes are conventions, not requirements"
area: testing
status: accepted
---

# Classes are conventions, not requirements

**Decision.** Class instances are first-class context values; a class
with constructor-injected deps is the OO spelling of `bind`
(`expose('auth', (ctx) => new AuthService(ctx))`); under a window,
per-call deps mean per-call instances. Flat functions remain the
documented default (lighter composition, no `this` extraction hazard,
per-record granularity).
