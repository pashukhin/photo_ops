import path from 'path';
import { configDefaults, coverageConfigDefaults, defineConfig } from 'vitest/config';

// Web tests run in jsdom so React component behavior (rendering, clicks, modal
// open, polling) can be exercised with @testing-library/react. Pure helpers and
// SSR-string tests still work in this environment. The live Playwright UI smoke
// (smoke/**) is driven by `make smoke-ui`, not vitest.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.')
    }
  },
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    exclude: [...configDefaults.exclude, 'smoke/**'],
    coverage: {
      // Extend the default excludes with Next.js build artifacts and config
      // files not included in vitest's default coverage exclude list.
      // Required for `make coverage-ts` (photo_ops-osq Task 3c) to produce
      // clean cobertura output with only real repo source paths.
      exclude: [
        ...coverageConfigDefaults.exclude,
        '.next/**',
        'next.config.js',
        'postcss.config.mjs',
        'playwright.config.ts',
        'next-env.d.ts',
        'smoke/**',
        // Leaflet mount glue: no layout in jsdom, so its render/click are verified
        // by the live smoke-ui, not units (spec 2026-07-09 decision 3, coverage R1).
        // All testable map logic lives in components/map/points.ts (covered).
        'components/map/PhotoMap.tsx'
      ]
    }
  }
});
