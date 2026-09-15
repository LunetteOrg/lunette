---
title: "Errors: returned = domain, thrown = infrastructure"
area: leaves-errors-leases
status: accepted
---

# Errors: returned = domain, thrown = infrastructure

**Decision.** Domain errors are returned as values; infrastructure errors
are thrown.

**Why.** This single distinction turns out to be the pivot of every
boundary mechanism, with no extra programming: transactions (returned
passes through → commit, e.g. persisting `attempts++` on a failed OTP;
thrown → rollback), retries (values do not retrigger, exceptions do),
queues (returned → ack/dead-letter, thrown → nack/redelivery).
