import path from 'path';
import { configDefaults, defineConfig } from 'vitest/config';

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
    exclude: [...configDefaults.exclude, 'smoke/**']
  }
});
