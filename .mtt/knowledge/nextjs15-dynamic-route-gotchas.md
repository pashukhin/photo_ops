---
title: Next.js 15 dynamic-route gotchas
tags:
    - nextjs
    - web
priority: medium
created: "2026-07-26T16:53:00Z"
updated: "2026-07-26T16:53:00Z"
---
(1) Next.js 15 dynamic-route params are ASYNC: app/.../[id]/page.tsx must be
`async function Page({ params }: { params: Promise<{ id: string }> })` and `await params`;
a sync `{id:string}` type FAILS `next build` (PageProps constraint). jsdom spec renders it
via `render(await Page({ params: Promise.resolve({id}) }))`.
(2) git treats `[ ]` in a pathspec as a glob character-class, so
`git add "app/posts/[id]/page.tsx"` matches NOTHING and aborts non-zero (silently stages
nothing if stderr is hidden). Fix: `:(literal)path` pathspec magic, `git add -A <dir>/`, or
escape the brackets.
