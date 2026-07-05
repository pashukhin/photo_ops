# Session 020: Share + product polish (portfolio-ready)

Status: **Draft (заготовка).** Not yet brainstormed. Scope below is a proposal to
refine at session start. Closes the publication vertical (epic `photo_ops-m71`)
and makes the demo showable.

> Human-readable scoping summary. Accepted design + plan land at session start
> under `docs/superpowers/specs` & `plans` (exSDD). Does not restate design
> (Principle 7).

## Goal

> Make the published story shareable and the whole path demo-ready: copy-link +
> share text, empty/loading/error states on the new screens, a demo dataset, and
> real screenshots. Turn "it works" into "it looks like a product."

## Proposed scope (refine at session start)

- **Share** (`m71.5`, DoD 13): on a published post, the canonical public URL +
  copy-link button and generated share text
  (`New photo story: <title>\n<short description>\n<link>`). Hidden for drafts.
  **Telegram connector deliberately deferred** (`connector-service` stays a stub
  — §3.9: own platform is source of truth).
- **Product polish** (project_description §D12): empty / loading / error states
  across Photos / Clusters / Post editor / public page; a seeded **demo dataset**
  (a small travel batch that clusters cleanly); screenshots for README/portfolio.

## Out of scope

Telegram / external connectors; map rendering; usage pricing depth; SEO. Real
billing.

## Method (exSDD)

Brainstorm → skeleton (share RED tests + polish states) = reviewed spec → GREEN.
Behavior lane → RED (copy-link exposes public URL for published, hidden for
draft); visual lane → `make smoke-ui` + exploration.

## Depends on

- Session 019 (a real published public page + slug URL to share).
- Ideally session 021 done first so the demo dataset flows through a hardened
  pipeline (see roadmap note).

## Verification bar

Unit for share affordance visibility + URL; live `make smoke-ui` across the full
Photos→Clusters→Post→Publish→Public→Share path; `make gate` +
`make coverage-gate` + `make test-guard`; final `/code-review`.

## References

- Epic `photo_ops-m71`; child `m71.5` (DoD 13). `project_description.md` §D12.
- Prior: session 019.
- Method + gate tier: `docs/agent-workflow-evolution.md` (Decisions 1, 7).
