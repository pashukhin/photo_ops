FROM node:22-alpine
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/publication-service/package.json apps/publication-service/package.json
RUN corepack enable && pnpm install --filter @photoops/publication-service --prod=false --frozen-lockfile
COPY . .
RUN pnpm --filter @photoops/publication-service build
CMD ["pnpm", "--filter", "@photoops/publication-service", "start"]
