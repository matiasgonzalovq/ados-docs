import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertDemoProjectId, assertSafeEnv } from './env-guard.mjs'
import { firebaseEmulatorsExec, requireJava, resolveFirebaseBin } from './firebase-cli.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CONFIG = 'firebase.emulators.json'
const PROJECT_ID = process.env.RULES_PROJECT_ID || 'demo-ados-docs'
const FIRESTORE_EMU = process.env.RULES_FIRESTORE_EMULATOR_HOST || '127.0.0.1:8086'

function fail(message) {
  console.error('\n[rules] ' + message)
  process.exit(1)
}

function buildEnv() {
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (key.startsWith('VITE_FIREBASE_')) delete env[key]
  }
  env.FIRESTORE_EMULATOR_HOST = FIRESTORE_EMU
  env.GCLOUD_PROJECT = PROJECT_ID
  env.GCLOUD_PROJECT_ID = PROJECT_ID
  return env
}

async function main() {
  assertDemoProjectId(PROJECT_ID, 'projectId de pruebas de reglas')

  if (!existsSync(join(ROOT, CONFIG))) {
    fail('falta ' + CONFIG)
  }
  if (!existsSync(join(ROOT, 'firestore.rules'))) {
    fail('falta firestore.rules')
  }
  const bin = resolveFirebaseBin(ROOT)
  if (!bin) {
    fail(
      'no se encontró firebase-tools. Ejecuta `npm ci` (firebase-tools es una devDependency) ' +
        'o instálalo con `npm i -g firebase-tools`.',
    )
  }
  const javaError = requireJava()
  if (javaError) {
    fail(javaError)
  }

  const env = assertSafeEnv(buildEnv(), 'entorno de pruebas de reglas')

  console.log('· firebase: ' + bin)
  console.log('· proyecto (solo emuladores): ' + PROJECT_ID)
  console.log('· firestore emulator: ' + FIRESTORE_EMU)

  const result = await firebaseEmulatorsExec({
    root: ROOT,
    bin,
    project: PROJECT_ID,
    only: 'firestore',
    config: CONFIG,
    command: 'node --test src/firebase/rules.test.mjs',
    env,
  })
  if (result.error) {
    fail('no se pudo arrancar la CLI de Firebase: ' + result.error.message)
  }
  process.exit(result.code)
}

main().catch((err) => {
  console.error('\n[rules] ' + err.message)
  process.exit(1)
})
