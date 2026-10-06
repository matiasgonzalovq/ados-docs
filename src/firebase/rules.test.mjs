import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { assertDemoProjectId } from '../../scripts/env-guard.mjs'

const PROJECT_ID = assertDemoProjectId(process.env.GCLOUD_PROJECT || 'demo-ados-docs', 'pruebas de reglas')
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8086').split(':')

let testEnv

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
      host,
      port: Number(port),
    },
  })
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users/alice/profile/me'), { name: 'Alice' })
    await setDoc(doc(ctx.firestore(), 'users/bob/profile/me'), { name: 'Bob' })
    await setDoc(doc(ctx.firestore(), 'config/global'), { marca: 'no debería existir' })
  })
})

after(async () => {
  if (testEnv) await testEnv.cleanup()
})

test('usuario autenticado lee y escribe sus propios datos', async () => {
  const alice = testEnv.authenticatedContext('alice')
  const own = doc(alice.firestore(), 'users/alice/profile/me')
  await assertSucceeds(getDoc(own))
  await assertSucceeds(setDoc(doc(alice.firestore(), 'users/alice/quotes/q1'), { total: 100 }))
  await assertSucceeds(getDoc(doc(alice.firestore(), 'users/alice/quotes/q1')))
})

test('usuario A no lee ni escribe datos de usuario B', async () => {
  const alice = testEnv.authenticatedContext('alice')
  await assertFails(getDoc(doc(alice.firestore(), 'users/bob/profile/me')))
  await assertFails(setDoc(doc(alice.firestore(), 'users/bob/quotes/robada'), { total: 1 }))
  await assertFails(setDoc(doc(alice.firestore(), 'users/bob/profile/me'), { name: 'hackeado' }))
})

test('usuario no autenticado es rechazado', async () => {
  const anon = testEnv.unauthenticatedContext()
  await assertFails(getDoc(doc(anon.firestore(), 'users/alice/profile/me')))
  await assertFails(setDoc(doc(anon.firestore(), 'users/alice/profile/me'), { name: 'anon' }))
})

test('rutas fuera de users/{uid} quedan denegadas', async () => {
  const alice = testEnv.authenticatedContext('alice')
  await assertFails(getDoc(doc(alice.firestore(), 'config/global')))
  await assertFails(setDoc(doc(alice.firestore(), 'config/global'), { marca: 'x' }))
  await assertFails(getDoc(doc(alice.firestore(), 'admins/alice')))
})
