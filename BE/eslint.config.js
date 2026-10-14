import js from '@eslint/js';
import globals from 'globals';
export default [ { ignores: ['node_modules/**', 'storage/**'] }, js.configs.recommended,
  { files: ['**/*.js', '**/*.mjs'], languageOptions: { globals: globals.node },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } } ];
