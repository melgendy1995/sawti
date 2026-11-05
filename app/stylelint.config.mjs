/** @type {import('stylelint').Config} */
export default {
  // Logical properties only (plan §3.1 RTL). Limit the CLI to app/src.
  customSyntax: 'postcss-scss',
  rules: {
    'property-disallowed-list': [
      'margin-left',
      'margin-right',
      'padding-left',
      'padding-right',
      'left',
      'right',
    ],
    'declaration-property-value-disallowed-list': {
      'text-align': ['left', 'right'],
    },
  },
};
