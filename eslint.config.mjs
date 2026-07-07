// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";
import globals from "globals";

export default tseslint.config(
  // --- Ignores (generated, build artifacts, deps) ---
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "packages/proto-ts/**", // GENERATED — never lint or edit
      ".claude/**", // VENDORED plugin (superpowers) — third-party, not ours to lint
      "**/node_modules/**",
      "**/.venv/**", // Python virtualenv (media-worker) — installed packages
      "**/*.egg-info/**", // Python editable-install metadata
      "**/*.tsbuildinfo",
      // next-env.d.ts is Next.js generated; it uses /// <reference path> which
      // @typescript-eslint/triple-slash-reference flags — ignore it.
      "apps/web/next-env.d.ts",
    ],
  },

  // --- JS recommended (baseline for all files) ---
  eslint.configs.recommended,

  // --- TypeScript-eslint recommended (syntactic, no type-awareness) for .ts/.tsx ---
  ...tseslint.configs.recommended.map((cfg) => ({
    ...cfg,
    files: ["**/*.ts", "**/*.tsx"],
  })),

  // --- Type-aware promise-safety rules (the core gate) ---
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        projectService: {
          // vitest.config.ts files that live outside their service's src-only
          // tsconfig; type-check them against a default project so the type-aware
          // rules still run. (apps/web's is already in its `**/*.ts` tsconfig, so
          // it must NOT be listed here — that would be a double-inclusion error.)
          allowDefaultProject: [
            "packages/*/vitest.config.ts",
            "apps/api-gateway/vitest.config.ts",
            "apps/photo-service/vitest.config.ts",
            "apps/publication-service/vitest.config.ts",
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/require-await": "error",
      "@typescript-eslint/await-thenable": "error",
    },
  },

  // --- Disable type-checked rules for plain JS/MJS/CJS files ---
  // (apps/web/next.config.js and eslint.config.mjs are outside any tsconfig)
  {
    ...tseslint.configs.disableTypeChecked,
    files: ["**/*.{js,mjs,cjs}"],
  },

  // --- CommonJS globals for .js files (e.g. apps/web/next.config.js uses module.exports) ---
  {
    files: ["**/*.js", "**/*.cjs"],
    languageOptions: {
      globals: {
        ...globals.commonjs,
        ...globals.node,
      },
    },
  },

  // --- Next.js plugin scoped to apps/web ---
  {
    files: ["apps/web/**"],
    plugins: {
      "@next/next": nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      // App Router project has no pages/ directory; point the rule at the
      // correct location so it doesn't emit a spurious warning.
      "@next/next/no-html-link-for-pages": ["warn", "apps/web/app"],
      // Every <img> in apps/web renders a short-lived PRESIGNED MinIO variant URL
      // on a force-dynamic / no-store surface (see apps/web/CLAUDE.md — "variant
      // thumbnail ... never originals", re-fetched for a fresh presigned preview).
      // next/image would proxy + cache those URLs (fighting the presigned-freshness
      // the pages are force-dynamic to preserve) and needs images.remotePatterns for
      // a dynamic MinIO host. Raw <img> is the deliberate, correct choice here.
      "@next/next/no-img-element": "off",
    },
  },
);
