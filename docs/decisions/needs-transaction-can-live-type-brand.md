---
title: '"Needs a transaction" can live in the type (brand pattern)'
area: leaves-errors-leases
status: accepted
---

# "Needs a transaction" can live in the type (brand pattern)

**Decision.** A pattern, not core API: brand the deps
(`Tx<D> = D & { [atomic]: true }`), produce the brand only in the
transactional bridge (a single cast). Wiring the leaf outside a
transaction does not compile and the requirement propagates through
composition — which also kills the nested-transaction footgun (a
decorated leaf calling a decorated leaf) structurally.

**Why a pattern and not an API.** It is domain lexicon (db transactions);
the core stays agnostic. A dedicated db package was considered and
dropped from the roadmap.
