# proto

## Local context

- Proto-first service contracts. `buf generate --template buf.gen.yaml` (via `make proto`) emits TypeScript into `packages/proto-ts`.
- Packages: `identity` (auth/user), `photo` (asset management), `common` (shared types), `cluster` (clustering), `connector` (external connectors), `publication` (publishing), `usage` (usage tracking).

## Local invariants

- Contracts are proto-first: edit `.proto` here, then regenerate. Do not hand-edit generated output.
- Run `make proto` after any contract change so `packages/proto-ts` stays in sync.
