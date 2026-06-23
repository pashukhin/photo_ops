# ADR-0002: Toolchain Pinning With mise

Date: 2026-06-23
Status: Accepted

## Context

Dev/test/CI tooling spans two planes. The JavaScript toolchain (tsc, eslint,
vitest, buf) is already hermetic via pnpm: it lives in `node_modules` and is
pinned by `pnpm-lock.yaml`. Runtime infrastructure (Postgres, MinIO, RabbitMQ,
the services) already runs in Docker Compose. The open question is the
polyglot/binary tooling — node, pnpm, go, python — which otherwise gets
installed globally and pollutes the host with unpinned versions.

## Decision

Pin polyglot/binary tools declaratively with mise (`.tool-versions`): node,
pnpm, go, python. Keep buf as a pnpm devDependency. Keep the JS toolchain in
pnpm and runtime/integration infrastructure in Docker. Expose one canonical
`make bootstrap` (mise install + pnpm install + env file). CI reuses the same
pinned versions.

## Considered Alternatives

- Per-tool `docker run` wrappers — maximum hermeticity, but high iteration
  friction (container startup, volume mounts on every `tsc`/`go test`) and
  weak IDE integration (gopls/pyright want a local toolchain). Rejected for the
  active dev loop.
- Devcontainer — strongest isolation (host needs only Docker + IDE), but a
  larger commit and lower payoff while Go/Python services are still scaffolds.
  Deferred until those services gain real behavior.
- Global host installs — rejected: pollutes the host and is not reproducible.

## Consequences

- Reproducible, removable toolchain managed under mise; nothing leaks globally.
- One bootstrap path, consistent with the "one canonical workflow" guardrail.
- CI and local dev share the same version pins.
- Developers install mise once; that is the only new host prerequisite beyond
  Docker.
