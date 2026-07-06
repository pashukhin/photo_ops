# Demo runbook — publication + share flow

Manual, reproducible steps to prepare the demo dataset and record the
publish → share flow. Session 020 ships this as a **document**; session 021 turns
it into a seed script (`photo_ops`-021). No seed code exists yet, so the steps
below build the dataset from scratch via the normal UI/API flow.

## Preconditions

- Local stack up: `make dev` + `make migrate` (see `infra/docker/CLAUDE.md`).
- media-worker venv present (EXIF/variant processing): `apps/media-worker/.venv`.
- Web at `http://localhost:3000`, gateway at `http://localhost:3001`.

## 1. Demo account

Sign in as `demo@photoops.local` (password `demo12345`). **If the account is
absent** (a fresh stack has no seed), sign up with those credentials — the flow is
identical from there.

## 2. Build the dataset (once)

1. **Upload** a small burst of JPEGs with EXIF timestamps (a handful from one
   outing reads best). The gallery shows them moving `uploading → processing →
   ready`; wait for `ready` (variants + EXIF are extracted).
2. **Cluster:** Clusters → pick `time_only` → Generate; wait until the result is
   `ready`; open it.
3. **Create post:** on a selectable node (leaf/segment/internal with photos) click
   **Create post** → you land in the editor.
4. **Edit:** give it a real title + a one/two-sentence body; caption a couple of
   photos; reorder if you like; **Save**.

## 3. Record the share flow

1. **Publish:** in the editor's Publish section choose **Public** → **Publish**.
   The panel flips to the published state showing the **canonical URL**
   (`http://localhost:3000/posts/<slug>`) + **Copy link** + **Copy share text**.
2. **Copy link** → paste somewhere to show the absolute URL. **Copy share text** →
   paste to show the generated `New photo story: <title> / <short desc> / <link>`.
3. **Open the link in a fresh / incognito window** (logged out): the public page
   renders the story — title, body, dates, photos (prepared variants, never
   originals).
4. **Show the OG meta:** view-source (or a link-unfurl tool) → `og:title`,
   `og:description`, `og:url`, `og:type=article`, `twitter:card`. (No `og:image`
   yet — deferred, `photo_ops-278`; and an external crawler cannot reach a local
   MinIO, so a live external image preview needs a public deploy.)
5. **Find it again:** back in the app, top-nav **Posts** → the `/posts` listing
   shows the post with its status; the row links back to the editor.
6. **Unpublish** (optional): the public URL 404s; republish keeps the same slug.

## Notes

- The slug is an opaque, immutable token minted at first publish — the link is
  stable across unpublish/republish (design 019 D2/D3).
- The canonical origin is `NEXT_PUBLIC_WEB_ORIGIN` (build-time; default
  `http://localhost:3000`) — see the share design D1.
