import js from '@eslint/js';

/** @type {import('eslint').Linter.Config[]} */
const eslintConfig = [
  js.configs.recommended,
  {
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
    }
  }
];

export default eslintConfig;
