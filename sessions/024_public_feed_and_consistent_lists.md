# Session 024: Public posts feed + consistent filter/sort/pagination

Status: **Draft (заготовка).** Not yet brainstormed. Scope below is a proposal to
refine at session start. The **last P1 release-readiness session** — after it lands,
all of `9q4.1`–`9q4.4` are done and the **release-quality demo** can be recorded.

> Human-readable scoping summary. Accepted design + plan land at session start
> under `docs/superpowers/specs` & `plans` (exSDD). Does not restate design
> (Principle 7).

## Goal

> Give a user a **public feed** of their published stories (paginated, with a
> calendar/date navigation) — the anonymous-facing home for their public posts —
> and make **filter + sort + pagination consistent** across every list surface, so
> the product stops feeling like a set of one-off screens.

## Proposed scope (refine at session start)

- **`photo_ops-9q4.1` — public user posts feed:**
  - A **public** (anonymous) gateway route: list a user's **published + public**
    posts, paginated, date-filterable. `unlisted` posts stay **excluded** (the
    unguessable-slug model, s019 D2/D4 — this is not a leak of unlisted stories).
  - A web public route rendering the feed with **pagination** + a **calendar / date**
    affordance. SSR, consistent with the public `/posts/[slug]` page.
- **`photo_ops-9q4.4` — consistent lists:**
  - Extract **one shared toolbar + pagination pattern** (the gallery's server-side
    sort/filter/paginate from s011 is the reference) and apply it to the owner posts
    listing, clusters list, usage report, and the new public feed.
  - **Absorb** the point items: `photo_ops-nst` (gallery status-filter widget) and
    `photo_ops-jfv` (usage combobox filters).

## Out of scope

Full-text / relevance search; hashtag navigation (`9q4.6`); `og:image` previews
(`278`, later). A public **discovery** across all users (this feed is per-user;
still no global directory).

## Method (exSDD)

Brainstorm (settle the public-feed identity/route shape — per-user vs global,
calendar granularity; the shared list contract) → skeleton (public gateway route +
web feed route + shared toolbar/pagination + RED tests) = reviewed spec → GREEN.
**dqb mandatory** — the public feed is a logged-out SSR + HTTP boundary; extend
`smoke-publication.sh` (feed reachable logged-out, paginates) and `make smoke-ui`
(the shared controls render across surfaces).

## Depends on

- The published-post + owner-listing surfaces (s019/020). Independent of geo (022)
  and the cluster workspace (023) — could in principle move earlier, but sequenced
  here so the demo records with the full P1 set in place.

## Verification bar

jsdom for the feed rendering + pagination + calendar and the shared toolbar across
surfaces; live `make smoke-publication` (public feed logged-out + pagination) +
`make smoke-ui`; `make gate` + `make coverage-gate` + `make test-guard`; final
`/code-review`. **After this session: record the release-quality demo** (run
`scripts/seed-demo.sh` from 021, walk the runbook).

## References

- `photo_ops-9q4.1`, `photo_ops-9q4.4` (epic `9q4`); absorbs `nst`, `jfv`.
- Public-page anchor + unlisted model: s019 design (`docs/superpowers/specs`).
- Method + gate tier: `docs/agent-workflow-evolution.md` (Decisions 1, 7).
