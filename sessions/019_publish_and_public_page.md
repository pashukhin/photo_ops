# Session 019: Publish + public page ⭐ (MVP endpoint)

Status: **Draft (заготовка).** Not yet brainstormed. Scope below is a proposal to
refine at session start. **Milestone session** of the publication vertical (epic
`photo_ops-m71`): after this, PhotoOps first does the thing it exists to do — a
published public photo story.

> Human-readable scoping summary. Accepted design + plan land at session start
> under `docs/superpowers/specs` & `plans` (exSDD). Does not restate design
> (Principle 7).

## Goal

> Publish a draft and serve it as a public page reachable by a shareable URL. This
> reaches the stated MVP Definition of Done endpoint (project_description.md §9,
> steps 11–12).

## Proposed scope (refine at session start)

- **`PublishPost` / `UnpublishPost`**: `status=published`, `published_at`,
  generate + lock a `slug` (e.g. `<location>-<date>-<shortid>`); enforce
  `visibility`. Unpublish flips status back.
- **Public page** `/posts/[slug]` — server-rendered, **no auth**: renders title,
  body, date range, `location_label`, photos via **prepared variants** +
  captions. Map render deferred (`map_enabled` honored later).
- **Access rules** (§3.8): published + public reachable publicly; published +
  unlisted only by direct slug; private / draft / unpublished → 404.
- **Usage**: emit `post_published` (an already-defined event type that currently
  never fires).

## Out of scope

Share/copy-link UI (020); map rendering; SEO/OG polish; custom domains;
markdown. Privacy invariant is hard scope: originals never served publicly —
only variants (§4.4 + architecture invariant).

## Method (exSDD)

Brainstorm → skeleton (proto Publish/Unpublish + public route stub + RED tests)
= reviewed spec → GREEN. ADR likely (slug + visibility access model is a durable
why).

## Depends on

- Sessions 017 (Post model/service) + 018 (a draft to publish).

## Verification bar

Unit for publish/slug/visibility + access rules (public renders; unlisted
slug-only; private/draft → 404; unpublish → 404). **Live smoke is mandatory
(dqb):** publish, then fetch `/posts/[slug]` in a logged-out browser. `make gate`
+ `make coverage-gate` + `make test-guard` + `make smoke-ui`; final `/code-review`.

## References

- Epic `photo_ops-m71`; child `m71.4` (DoD 11–12). Reaches DoD §9 endpoint.
- Prior: sessions 017–018.
- Method + gate tier: `docs/agent-workflow-evolution.md` (Decisions 1, 7).
