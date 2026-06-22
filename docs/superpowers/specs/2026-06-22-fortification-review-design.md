# Fortification Review Design

Date: 2026-06-22

## Context

PhotoOps has completed exploratory sessions for the architecture frame, upload/list scaffold, and authenticated upload ownership. Before adding media processing, clustering, publication, usage accounting, or connectors, this session consolidates the project foundation.

This is not a product feature session. The review focuses on the project as a development system: tools, local workflow, infrastructure assumptions, technical debt, documented trade-offs, and guardrails for future agent sessions.

## Goals

- Inventory current tools and decide whether to keep, replace, defer, or remove each one.
- Document one canonical local workflow for bootstrap, development, verification, migrations, smoke tests, reset, and handoff.
- Review local Compose infrastructure, environment variables, migrations, MinIO endpoints, database bootstrap, service health/readiness, and future production gaps.
- Classify early technical debt as bug, cheap debt, conscious trade-off, deferred product complexity, or architectural risk.
- Apply cheap fixes that reduce friction or risk without changing product scope.
- Update project guardrails for the next several sessions.

## Non-Goals

- EXIF extraction.
- Preview or thumbnail generation.
- Media processing workflows.
- Clustering.
- Publication workflows.
- Usage ledger implementation.
- Connector work.
- Large refactoring unless a concrete defect makes a small fix necessary.

## Approach

The session uses a review-first workflow with cheap fixes along the way.

1. Inspect the actual repository state, not only earlier plans.
2. Produce a durable fortification review document under `docs/`.
3. Update stale project docs and guardrails where the current implementation has moved ahead of them.
4. Implement only obvious cheap fixes that do not require product or architecture redesign.
5. Record retained imperfections explicitly as trade-offs, deferred work, or risks.

## Deliverables

- `docs/fortification-review.md` containing:
  - tooling inventory;
  - dev workflow review;
  - infrastructure review;
  - future production gaps;
  - technical debt register;
  - cheap fixes applied;
  - retained trade-offs.
- Updated guardrails in `AGENTS.md` or equivalent project rules.
- Updated stale documentation if it materially misleads future sessions.
- Beads follow-up issues for remaining work that should not be fixed in this session.

## Cheap Fix Rules

A fix is allowed in this session only if it satisfies all of these conditions:

- It does not add new user-facing product functionality.
- It preserves the current service ownership boundaries.
- It is small enough to review directly in this session.
- It reduces local development friction, verification ambiguity, documentation drift, or operational risk.
- It can be verified with an existing or similarly small command.

Anything larger is documented and, if actionable, filed as a follow-up beads issue.

## Verification

Verification should match the files changed. Documentation-only changes require review for internal consistency. Code, script, or workflow changes require the narrowest relevant command, then the broader existing quality gate if practical.

The session must not be reported complete until changes are committed and pushed according to the project beads workflow.
