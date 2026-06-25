FROM node:22-alpine AS deps
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/identity-service/package.json apps/identity-service/package.json
COPY packages/proto-ts/package.json packages/proto-ts/package.json
COPY packages/observability/package.json packages/observability/package.json
RUN pnpm install --filter @photoops/identity-service... --frozen-lockfile

FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/identity-service/node_modules ./apps/identity-service/node_modules
COPY . .
RUN pnpm --filter "@photoops/identity-service..." build

FROM node:22-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/identity-service ./apps/identity-service
COPY --from=build /repo/proto ./proto
WORKDIR /repo/apps/identity-service
CMD ["node", "dist/main.js"]
