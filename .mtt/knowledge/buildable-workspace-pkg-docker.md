---
title: Buildable workspace package + Docker
tags:
    - build
    - docker
    - pnpm
priority: high
created: "2026-07-26T16:53:00Z"
updated: "2026-07-26T16:53:00Z"
---
A BUILT workspace package (own build script, package.json main: dist/index.js) consumed at
runtime needs two Dockerfile things `make gate` (no Docker) cannot catch — only
`make smoke-stack` does:
(1) the service's install MUST use the '...' closure
(`pnpm install --filter "@photoops/<svc>..."`) so the dependency's devDeps (typescript)
install, else its `tsc` build dies with `sh: tsc: not found`.
(2) the runtime image MUST contain packages/<pkg>/dist so the workspace symlink
node_modules/@photoops/<pkg> resolves at require() time.
Single-stage Dockerfiles satisfy (2) for free; a multi-stage image must COPY packages/<pkg>
into the runtime stage AND packages/<pkg>/node_modules into the build stage. Source-only
packages (proto-ts) avoid all this.
