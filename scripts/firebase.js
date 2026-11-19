// Runs the Firebase CLI with Java available for the emulators.
//
// If `java` is not on PATH, a portable JDK in ~/tools/jdk-21* (or $JAVA_HOME) is used
// for this command only; no system settings are changed.
//
// Usage: node scripts/firebase.js <firebase arguments...>
//   e.g. node scripts/firebase.js emulators:start --project demo-family-property

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

const isWindows = process.platform === 'win32'
const env = { ...process.env }

function javaOnPath() {
  return spawnSync('java -version', { stdio: 'ignore', shell: true }).status === 0
}

function findPortableJdk() {
  if (env.JAVA_HOME && existsSync(join(env.JAVA_HOME, 'bin'))) return env.JAVA_HOME
  const tools = join(homedir(), 'tools')
  if (!existsSync(tools)) return null
  const jdk = readdirSync(tools)
    .filter((d) => /^jdk-2[1-9]/.test(d))
    .sort()
    .pop()
  return jdk ? join(tools, jdk) : null
}

if (!javaOnPath()) {
  const jdk = findPortableJdk()
  if (!jdk) {
    console.error('Java 21+ is required for the Firebase emulators. Install it, or unpack a JDK into ~/tools/jdk-21….')
    process.exit(1)
  }
  env.JAVA_HOME = jdk
  env.PATH = join(jdk, 'bin') + delimiter + (env.PATH ?? env.Path ?? '')
  if (isWindows) env.Path = env.PATH
}

// Prefer running the CLI's JavaScript entry directly (no shell, so arguments keep their quoting).
function firebaseEntry() {
  const root = spawnSync('npm root -g', { encoding: 'utf8', shell: true }).stdout?.trim()
  const entry = root && join(root, 'firebase-tools', 'lib', 'bin', 'firebase.js')
  return entry && existsSync(entry) ? entry : null
}

const args = process.argv.slice(2)
const entry = firebaseEntry()
const child = entry
  ? spawn(process.execPath, [entry, ...args], { stdio: 'inherit', env })
  : spawn('firebase', args, { stdio: 'inherit', env, shell: isWindows })

child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)))
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig))
