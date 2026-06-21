FROM node:22-alpine
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/connector-service/package.json apps/connector-service/package.json
RUN corepack enable && pnpm install --filter @photoops/connector-service --prod=false --frozen-lockfile
COPY . .
RUN pnpm --filter @photoops/connector-service build
CMD ["pnpm", "--filter", "@photoops/connector-service", "start"]
