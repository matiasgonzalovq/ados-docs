import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertDemoProjectId, assertSafeEnv } from './env-guard.mjs'
import { firebaseEmulatorsExec, requireJava, resolveFirebaseBin } from './firebase-cli.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CONFIG = 'firebase.emulators.json'
const PROJECT_ID = process.env.REGRESSION_PROJECT_ID || 'demo-ados-docs'
const AUTH_EMU = process.env.REGRESSION_AUTH_EMULATOR_HOST || '127.0.0.1:9099'
const FIRESTORE_EMU = process.env.REGRESSION_FIRESTORE_EMULATOR_HOST || '127.0.0.1:8086'

function fail(message) {
  console.error('\n[regression] ' + message)
  process.exit(1)
}

function preflight() {
  if (process.env.REGRESSION_ALLOW_REMOTE === '1') {
    throw new Error(
      '[env-guard] REGRESSION_ALLOW_REMOTE=1 no está soportado: las pruebas de regresión solo ' +
        'corren contra los emuladores locales de Firebase.',
    )
  }
  assertDemoProjectId(PROJECT_ID, 'projectId de regresión')
  if (!/^[\w.-]+:\d+$/.test(AUTH_EMU) || !/^[\w.-]+:\d+$/.test(FIRESTORE_EMU)) {
    throw new Error('[env-guard] Hosts de emulador mal formados.')
  }
}

function buildEnv() {
  return {
    ...process.env,
    VITE_FIREBASE_API_KEY: 'demo-api-key',
    VITE_FIREBASE_AUTH_DOMAIN: `${PROJECT_ID}.firebaseapp.com`,
    VITE_FIREBASE_PROJECT_ID: PROJECT_ID,
    VITE_FIREBASE_APP_ID: '1:000000000000:web:demo',
    VITE_FIREBASE_STORAGE_BUCKET: `${PROJECT_ID}.firebasestorage.app`,
    VITE_FIREBASE_AUTH_EMULATOR_HOST: AUTH_EMU,
    VITE_FIREBASE_FIRESTORE_EMULATOR_HOST: FIRESTORE_EMU,
    FIREBASE_AUTH_EMULATOR_HOST: AUTH_EMU,
    FIRESTORE_EMULATOR_HOST: FIRESTORE_EMU,
    GCLOUD_PROJECT: PROJECT_ID,
    GCLOUD_PROJECT_ID: PROJECT_ID,
  }
}

async function main() {
  preflight()

  if (!existsSync(join(ROOT, CONFIG))) {
    fail('falta ' + CONFIG)
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

  const env = assertSafeEnv(buildEnv(), 'entorno de regresión')

  console.log('· firebase: ' + bin)
  console.log('· proyecto (solo emuladores): ' + PROJECT_ID)
  console.log('· auth emulator:      ' + AUTH_EMU)
  console.log('· firestore emulator: ' + FIRESTORE_EMU)

  const result = await firebaseEmulatorsExec({
    root: ROOT,
    bin,
    project: PROJECT_ID,
    only: 'auth,firestore',
    config: CONFIG,
    command: 'node src/ui/regression.test.mjs',
    env,
  })
  if (result.error) {
    fail('no se pudo arrancar la CLI de Firebase: ' + result.error.message)
  }
  process.exit(result.code)
}

main().catch((err) => {
  console.error('\n[regression] ' + err.message)
  process.exit(1)
})
