import tsParser from '@typescript-eslint/parser';

const correctness = {
  'no-debugger': 'error',
  'no-dupe-keys': 'error',
  'no-duplicate-case': 'error',
  'no-func-assign': 'error',
  'no-unreachable': 'error',
  'no-unsafe-finally': 'error',
};

export default [
  { ignores: ['public/twin-presence/vision-runtime/**'] },
  { files: ['src/twin-workspace/**/*.tsx'], languageOptions: { parser: tsParser }, rules: correctness },
  { files: ['public/twin-presence/**/*.mjs', 'tests/twin-*.test.mjs'], rules: { ...correctness, 'no-unused-vars': 'error' } },
];
