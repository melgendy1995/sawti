// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

module.exports = defineConfig([
  {
    ignores: [
      'android/**',
      'dist/**',
      'coverage/**',
      '.angular/**',
      'www/**',
    ],
  },
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'app',
          style: 'kebab-case',
        },
      ],
    },
  },

  // --- Layering rules (plan v1.1 §3.1). Enforced with no-restricted-imports
  //     as far as ESLint path patterns allow. dependency-cruiser comes later.
  //
  // NOTE: ESLint flat config does not merge `no-restricted-imports` across
  // blocks — the last matching block wins for that rule. The blocks below are
  // therefore kept mutually exclusive (via `ignores`), and each one restates
  // every pattern it needs.

  // domain/** is pure TS: no Angular, Dexie or Capacitor.
  {
    files: ['src/app/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@angular/*', '@angular/**'],
              message: 'domain/ must not import @angular/* (pure TS only).',
            },
            {
              group: ['dexie', 'dexie/*'],
              message: 'domain/ must not import dexie (pure TS only).',
            },
            {
              group: ['@capacitor/*', '@capacitor/**'],
              message: 'domain/ must not import @capacitor/* (pure TS only).',
            },
          ],
        },
      ],
    },
  },

  // features/** must not import other features/*, and must not import @capacitor/*.
  {
    files: ['src/app/features/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/features/*/**', 'src/app/features/*/**'],
              message:
                'A feature must not import another feature. Share through core/ or shared/ instead.',
            },
            {
              group: ['@capacitor/*', '@capacitor/**'],
              message:
                'Only core/platform/ may import @capacitor/*. Wrap native APIs behind a platform adapter.',
            },
            {
              group: ['dexie', 'dexie/*'],
              message:
                'Only the data layer in core/storage/ may import dexie. Features talk to repositories.',
            },
          ],
        },
      ],
    },
  },

  // core/platform/ is the only tree allowed to import @capacitor/*. It still
  // must not talk to Dexie; repositories own the database.
  {
    files: ['src/app/core/platform/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['dexie', 'dexie/*'],
              message:
                'Only the data layer in core/storage/ may import dexie. Platform code stays free of it.',
            },
          ],
        },
      ],
    },
  },

  // core/storage/ is the Dexie data layer (db, live queries, repositories,
  // snapshots). It must not import @capacitor/* — native I/O stays in platform/.
  {
    files: ['src/app/core/storage/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@capacitor/*', '@capacitor/**'],
              message:
                'Only core/platform/ may import @capacitor/*. Wrap native APIs behind a platform adapter.',
            },
          ],
        },
      ],
    },
  },

  // Everything else under src/app (shared, app root, core except platform
  // and storage) may not import @capacitor/* or dexie. domain/ and features/
  // have their own blocks above.
  {
    files: ['src/app/**/*.ts'],
    ignores: [
      'src/app/domain/**/*.ts',
      'src/app/features/**/*.ts',
      'src/app/core/platform/**/*.ts',
      'src/app/core/storage/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@capacitor/*', '@capacitor/**'],
              message:
                'Only core/platform/ may import @capacitor/*. Wrap native APIs behind a platform adapter.',
            },
            {
              group: ['dexie', 'dexie/*'],
              message:
                'Only the data layer in core/storage/ may import dexie. Other code uses repositories.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {},
  },
]);
