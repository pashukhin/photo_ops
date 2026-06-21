FROM node:22-alpine
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json
RUN corepack enable && pnpm install --filter @photoops/web --prod=false --frozen-lockfile
COPY . .
RUN pnpm --filter @photoops/web build
CMD ["pnpm", "--filter", "@photoops/web", "start"]
