import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // Security-rules tests need the Firestore emulator; run them with `npm run test:rules`.
    exclude: [...configDefaults.exclude, 'tests/rules/**'],
  },
})
