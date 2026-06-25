FROM node:22-alpine
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api-gateway/package.json apps/api-gateway/package.json
COPY packages/proto-ts/package.json packages/proto-ts/package.json
COPY packages/observability/package.json packages/observability/package.json
RUN corepack enable && pnpm install --filter @photoops/api-gateway --prod=false --frozen-lockfile
COPY . .
RUN pnpm --filter "@photoops/api-gateway..." build
CMD ["pnpm", "--filter", "@photoops/api-gateway", "start"]
