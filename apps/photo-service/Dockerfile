FROM node:22-alpine
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/photo-service/package.json apps/photo-service/package.json
COPY packages/proto-ts/package.json packages/proto-ts/package.json
RUN corepack enable && pnpm install --filter @photoops/photo-service --prod=false --frozen-lockfile
COPY . .
RUN pnpm --filter @photoops/photo-service build
CMD ["pnpm", "--filter", "@photoops/photo-service", "start"]
