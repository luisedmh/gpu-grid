import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  // Generated folders are never linted
  { ignores: ['dist/', 'coverage/', 'src/generated/'] },
  // Recommended rules for JavaScript and TypeScript
  js.configs.recommended,
  tseslint.configs.recommended,
  // Arguments starting with _ are intentionally unused (e.g. Express handler signatures)
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
