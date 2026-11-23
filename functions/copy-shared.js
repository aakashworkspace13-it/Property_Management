// Copies the app's pure business logic (src/lib, without tests) into functions/shared so the
// server job uses exactly the same rules as the app. Runs before every functions deploy.
import { cpSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const target = join(here, 'shared')
rmSync(target, { recursive: true, force: true })
cpSync(join(here, '..', 'src', 'lib'), target, { recursive: true, filter: (src) => !src.endsWith('.test.js') })
console.log('Copied src/lib to functions/shared')
