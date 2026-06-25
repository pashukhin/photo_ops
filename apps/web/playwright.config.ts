import { defineConfig } from '@playwright/test';

// Live UI smoke against an already-running stack (`make up` / `make smoke-stack`).
// Run via `make smoke-ui` (installs the chromium binary on first use). This is a
// thin end-to-end render/integration check — NOT part of `make gate` (vitest
// excludes smoke/**).
const WEB_URL = process.env.SMOKE_WEB_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './smoke',
  testMatch: '**/*.smoke.ts',
  timeout: 60_000,
  use: {
    baseURL: WEB_URL,
    headless: true
  }
});
