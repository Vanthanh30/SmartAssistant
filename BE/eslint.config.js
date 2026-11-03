import js from '@eslint/js';
import globals from 'globals';
export default [
  { ignores: ['node_modules/**', 'storage/**', '.cache/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { globals: globals.node },
    rules: {
      'no-duplicate-imports': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
];
