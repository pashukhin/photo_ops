# ADR-0001: Architecture Frame

## Status

Accepted

## Decision

PhotoOps starts as a polyglot, contract-first, domain-service system with separate deployable services and DB-per-data-owning-service.

## Consequences

The first executable frame has more scaffolding than a monolith, but service ownership violations are easier to detect and future extraction work is reduced.
