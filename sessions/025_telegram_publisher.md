# Session 025: Telegram-channel publisher (connector) + per-user settings

Status: **Draft (заготовка).** Not yet brainstormed. Scope below is a proposal to
refine at session start. The first **real connector** — makes stage 7
(Sharing/connectors) more than own-platform share. **Release-desirable (P2)**;
sequenced after the demo, before a 1.0 release. Turns `connector-service` from a
501 stub into a working publisher.

> Human-readable scoping summary. Accepted design + plan land at session start
> under `docs/superpowers/specs` & `plans` (exSDD). Does not restate design
> (Principle 7).

## Goal

> Let a user publish a story to a **Telegram channel**: connect their channel once
> (bot token + channel id, stored securely), then publish a post to it and see the
> outcome. Proves the connector seam (frame-spec §3.9: own platform is the source of
> truth, connectors are secondary distribution) end-to-end with one real target.

## Proposed scope (refine at session start)

- **`photo_ops-9q4.5`:**
  - **`connector-service`** becomes real (from the stub): a Telegram adapter over
    the Bot API (send the post's title/short-desc/link + a representative image to a
    channel).
  - **Per-user connector settings**: bot token + channel id, with **secure storage**
    of the secret (settle encryption/secret handling at brainstorm) + a settings UI.
  - **Publish-to-connector flow**: from a published post, push to the connected
    channel; record a **`PublicationAttempt`** (status/result) — the domain modeled
    it and deferred it through s019.

## Out of scope

Other connectors (Instagram/etc.); scheduling / recurring posts; editing a
channel message after send; the own-platform share (already shipped in 020). The
public feed / hashtags.

## Method (exSDD)

Brainstorm (settle secret storage, the connector port/contract, and how to smoke a
real external API — a test channel vs a mocked Bot API at the boundary) → skeleton
(connector-service adapter + settings + PublicationAttempt + RED tests) = reviewed
spec → GREEN. ADR for the connector contract + secret handling (durable why).
**dqb**: the publish flow crosses HTTP↔gRPC↔external — a smoke against a test
channel or a boundary fake.

## Depends on

- The published-post flow (s019/020) and its `slug`/canonical URL + text OG. The
  domain's deferred `PublicationAttempt`. Independent of geo/feed; runs after the
  demo.

## Verification bar

Unit for the adapter (payload shaping, error/rate-limit handling), settings +
secret storage, and PublicationAttempt state; a live connector smoke (test channel
or boundary fake — a down/invalid target must fail the attempt, not the app);
`make gate` + `make coverage-gate` + `make test-guard`; final `/code-review`.

## References

- `photo_ops-9q4.5` (epic `9q4`); connectors-as-distribution ADR-004 backfill
  (`photo_ops-83j`); frame-spec §3.9; roadmap stage 7.
- Method + gate tier: `docs/agent-workflow-evolution.md` (Decisions 1, 7).
