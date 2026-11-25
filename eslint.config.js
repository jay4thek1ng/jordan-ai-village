import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['web/**', 'site/**', 'data/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['scripts/**/*.mjs', 'server.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly', URL: 'readonly', fetch: 'readonly', setTimeout: 'readonly', window: 'readonly' } },
  },
  {
    files: ['sw/**/*.js'],
    languageOptions: { globals: { self: 'readonly', caches: 'readonly', fetch: 'readonly', URL: 'readonly', __PRECACHE__: 'readonly' } },
  },
);
