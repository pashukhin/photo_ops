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

Stages 1–6 are shipped: upload → media/EXIF → usage ledger → time-only clustering
→ the full **publication vertical** (cluster → draft post → publish → public
`/posts/[slug]` page). The MVP endpoint (`project_description.md` §9: a published
public photo story) was reached in **session 019**; epic `photo_ops-m71` is closed.
Stage 7 (Sharing/connectors) is **partly** done — own-platform share (copy-link +
generated share text + text Open Graph) shipped in **020**; `connector-service` is
still a stub, so an actual publisher (Telegram) is pending (`9q4.5`). Stage 8
(product polish/hardening) is **in progress** — a thin polish pass landed in 020;
the release/demo-readiness gaps are grouped under epic `photo_ops-9q4`.

## Shipped sessions (011–020)

| Session | Stage | Delivered | Issues |
| --- | --- | --- | --- |
| 016 | — | P1 integrity bugfixes (double-bill, event loss) | `v6c`,`35w` |
| 017 | 6 | Publication foundation: `Post`/`PostPhoto`, real `publication-service`, `CreatePostFromCluster` | `m71.1` |
| 018 | 6 | Cluster→draft bridge + editor (title/body/captions/order) | `m71.2`,`m71.3` |
| **019** ⭐ | 6 | **Publish + public `/posts/[slug]` page — reaches the MVP endpoint** | `m71.4` |
| 020 | 7/8 | Share (copy-link + share text + text OG) + thin product polish + demo **runbook** (doc; seed → 021) | `m71.5` |

Earlier sessions (011–015: rich gallery, usage service, clustering, UI shell,
polish) are covered by their briefs under `sessions/`.

## Forward plan

The MVP endpoint is reached; the forward path closes the **release/demo-readiness
gaps** (epic `photo_ops-9q4`) before a single, release-quality **demo recording**.
Sequencing settled 2026-07-07: **integrity → geo → cluster/location → feed/filters
→ demo → connector**. The demo gates on the P1 items (`9q4.1`–`9q4.4`); Telegram
(`9q4.5`, P2) is release-desirable and follows.

| Session | Stage | Delivers | Issues |
| --- | --- | --- | --- |
| 021 | 8 | Pipeline integrity hardening + demo seed script (from the 020 runbook) | `0od`,`opm`,`42b`,`1m8` |
| **022** ✅ | 5/6 | Geo-normalization: `Location` + offline reverse-geocoding + gallery place-tag — **delivered** (ADR-0007); foundation for the cluster map + manual location | `3iy` |
| **023** ✅ | 5 | User-friendly cluster workspace (delete + view: tree + **map** [Leaflet, vendored offline basemap, ADR-0008] + time **histogram**) + manual **photo** location (owner-scoped `SetPhotoLocation`, map-clicked point) — **delivered**; cluster-level location deferred | `9q4.2`,`9q4.3` |
| 024 | 8 | Public user posts **feed** (pagination + calendar) + consistent **filter/sort/pagination** everywhere | `9q4.1`,`9q4.4` (absorbs `nst`,`jfv`) |
| **DEMO** ⭐ | — | **Release-quality demo recording** — all P1 (`9q4.1`–`9q4.4`) landed | — |
| 025 | 7 | Telegram-channel **publisher** (connector) + per-user settings | `9q4.5` |

Briefs exist for `021` and `022` (`sessions/021…`, `022…`); `023`–`025` are
planning-level until their session is scoped.

Later (post-demo, P3 / nice-to-have): hashtags + navigation (`9q4.6`), `og:image`
for public link previews (`278`), clustering decomposition + HDBSCAN (`2xu`), usage
pricing units (`590`/`9u5`/`n48`/`jxy`), OpenTelemetry (`pb6`), consumer
reconnect/supervision (`03x`,`di8`), and the deferred review cleanups (`x36`,`e9g`,
`7x5`,`0st`,`34t`).

Epics: `photo_ops-m71` (publication vertical — **closed**), `photo_ops-9q4`
(release/demo readiness). Session briefs live under `sessions/`.
