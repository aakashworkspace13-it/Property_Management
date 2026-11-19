// Vitest config for Firestore security-rules tests (npm run test:rules).
// These need the Firestore emulator, so they are kept out of the normal `npm test` run.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/rules/**/*.test.js'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
})
