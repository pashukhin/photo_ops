FROM node:22-alpine
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/identity-service/package.json apps/identity-service/package.json
COPY packages/proto-ts/package.json packages/proto-ts/package.json
COPY packages/observability/package.json packages/observability/package.json
RUN corepack enable && pnpm install --filter "@photoops/identity-service..." --prod=false --frozen-lockfile
COPY . .
RUN pnpm --filter "@photoops/identity-service..." build
CMD ["pnpm", "--filter", "@photoops/identity-service", "start"]
