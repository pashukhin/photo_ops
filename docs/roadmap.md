# Roadmap

## Durable stages

1. Project frame.
2. Upload thin slice.
3. Media processing.
4. Usage ledger.
5. Clustering.
6. Publication.
7. Sharing/connectors.
8. Product polish and hardening.

Stages 1–5 are shipped (upload → media/EXIF → usage ledger → time-only
clustering, all wired end-to-end). Stages 6–7 (the published photo story — the
product's reason to exist) are **not built**: `publication-service` and
`connector-service` are still 501 health-only stubs.

## Ordered session plan (to a published public page)

Established after the 2026-07-05 deep review. Critical path to the MVP endpoint
(project_description.md §9: a published public photo story) is
`m71.1 → m71.3 → m71.4` — sessions **017 → 018 → 019**. Geo and the P2 integrity
bugs are **not** on that path and follow. Keep the meta-track frozen (exSDD
self-maintenance, mutation testing, MCP evals) until 019 ships — the backlog is
~43% process; ROI there is negative by the project's own Decision 6.

| Session | Stage | Delivers | Issues | DoD |
| --- | --- | --- | --- | --- |
| 016 *(in progress)* | — | P1 integrity bugfixes (double-bill, event loss) | `v6c`,`35w` | — |
| 017 | 6 | Publication foundation: `Post`/`PostPhoto`, real `publication-service`, `CreatePostFromCluster` | `m71.1` | 9 |
| 018 | 6 | Cluster→draft bridge + editor (title/body/captions/order) | `m71.2`,`m71.3` | 8, 10 |
| **019** ⭐ | 6 | **Publish + public `/posts/[slug]` page — reaches the MVP endpoint** | `m71.4` | 11–12 |
| 020 | 7/8 | Share (copy-link; Telegram deferred) + product polish + demo dataset | `m71.5` | 13 |
| 021 | 8 | Pipeline integrity hardening (before final demo recording) | `0od`,`opm`,`42b`,`1m8` | — |
| 022 | 5/6 | Geo-normalization (reverse-geocoding + `Location`); enables space-time clustering | `3iy` | 5 |

Epic: `photo_ops-m71`. Session briefs: `sessions/016…022`. Later (post-MVP):
usage pricing units (`590`/`9u5`/`n48`/`jxy`), OpenTelemetry (`pb6`), Telegram
connector, consumer reconnect/supervision (`03x`,`di8`).
