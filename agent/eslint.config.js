import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  // Generated folders are never linted
  { ignores: ['dist/', 'coverage/'] },
  // Recommended rules for JavaScript and TypeScript
  js.configs.recommended,
  tseslint.configs.recommended,
);
