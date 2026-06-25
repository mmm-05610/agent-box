import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default tseslint.config(
  // Global ignores
  { ignores: ['dist', 'node_modules'] },

  // Base JS rules
  js.configs.recommended,

  // TypeScript strict rules
  ...tseslint.configs.recommended,

  // React hooks rules
  {
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // React hooks
      ...reactHooks.configs.recommended.rules,

      // React refresh — only export components
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],

      // ── Naming conventions ─────────────────────────────────────────
      // Components: PascalCase
      // Variables/functions: camelCase
      // Constants: UPPER_SNAKE_CASE or camelCase
      '@typescript-eslint/naming-convention': [
        'warn',
        // Components must be PascalCase
        {
          selector: 'function',
          filter: { match: true, regex: '^[A-Z]' },
          format: ['PascalCase'],
        },
        // Variables and functions: camelCase
        {
          selector: 'variableLike',
          format: ['camelCase', 'UPPER_CASE'],
          leadingUnderscore: 'allow',
        },
        {
          selector: 'function',
          format: ['camelCase', 'PascalCase'],
        },
        // Type/interface: PascalCase
        {
          selector: 'typeLike',
          format: ['PascalCase'],
        },
        // Enum members: PascalCase
        {
          selector: 'enumMember',
          format: ['PascalCase', 'UPPER_CASE'],
        },
      ],

      // ── Import rules ───────────────────────────────────────────────
      // Sorted imports (auto-fixable)
      'sort-imports': [
        'warn',
        {
          ignoreCase: true,
          ignoreDeclarationSort: true,
          ignoreMemberSort: false,
        },
      ],

      // ── Code quality ───────────────────────────────────────────────
      // No console.log in production (allow console.warn/error)
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // Prefer const
      'prefer-const': 'error',

      // No var
      'no-var': 'error',

      // Template literals over concatenation
      'prefer-template': 'warn',

      // Arrow functions over function expressions
      'prefer-arrow-callback': 'warn',

      // Destructuring
      'prefer-destructuring': [
        'warn',
        { array: false, object: true },
      ],

      // No unused variables (TypeScript handles this better)
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],

      // Explicit return types on exported functions
      '@typescript-eslint/explicit-function-return-type': [
        'warn',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
        },
      ],

      // No any
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
)
