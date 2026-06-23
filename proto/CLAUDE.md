# proto

## Local context

- Proto-first service contracts. `buf generate --template buf.gen.yaml` (via `make proto`) emits TypeScript into `packages/proto-ts`.
- Packages: `identity` (auth/user), `photo` (asset management), `common` (shared types), `cluster` (clustering), `connector` (external connectors), `publication` (publishing), `usage` (usage tracking).

## Local invariants

- Contracts are proto-first: edit `.proto` here, then regenerate. Do not hand-edit generated output.
- Run `make proto` after any contract change, then verify with `git status` that the regenerated `packages/proto-ts` is staged in the same change — generated code must never drift from the `.proto` sources.
