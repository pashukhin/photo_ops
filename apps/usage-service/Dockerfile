FROM node:22-alpine
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/usage-service/package.json apps/usage-service/package.json
RUN corepack enable && pnpm install --filter @photoops/usage-service --prod=false --frozen-lockfile
COPY . .
RUN pnpm --filter @photoops/usage-service build
CMD ["pnpm", "--filter", "@photoops/usage-service", "start"]
