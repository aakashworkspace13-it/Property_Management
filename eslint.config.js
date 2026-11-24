import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'functions/shared', 'functions/node_modules', 'apps-script/Code.gs', 'apps-script/.build']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    // Google Apps Script (apps-script/main.js): plain script; these functions are called by name.
    files: ['apps-script/main.js'],
    rules: { 'no-unused-vars': ['error', { varsIgnorePattern: '^(setup|sendTestToMe|sendDailyReminders)$' }] },
  },
  {
    // Node.js tooling scripts (not part of the browser app)
    files: ['scripts/**/*.js', 'functions/**/*.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
])
