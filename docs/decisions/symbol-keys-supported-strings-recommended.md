---
title: "Symbol keys supported, strings recommended"
area: resources-lifecycles
status: accepted
---

# Symbol keys supported, strings recommended

**Decision.** The engine uses `Reflect.ownKeys`/`Object.hasOwn`, so
Symbol keys work everywhere (guards, expose, mount shadowing) for those
who want identity-based uniqueness. The documented convention stays
strings + destructuring.

**Why strings.** Symbol tags require declaring/exporting/importing a tag
per dependency — Effect's ceremony — and destructuring plus readable
signatures is the ergonomics this project optimizes for. Collisions are
already a compile error; Symbols would make impossible what is merely
forbidden, at a high ergonomic price.
