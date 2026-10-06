import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { isProductionHost, isProductionProjectId, assertDemoProjectId } from './env-guard.mjs'
import { scanRepo } from './scan.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

function run(args, env) {
  return spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 30000,
  })
}

function envWithout(prefixes) {
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (prefixes.some((p) => key.startsWith(p))) delete env[key]
  }
  return env
}

function gitTracks(file) {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', file], { cwd: ROOT, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

test('la regresión rechaza el projectId de producción', () => {
  const r = run(['scripts/run-regression.mjs'], { REGRESSION_PROJECT_ID: 'ados-docs' })
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /PRODUCCIÓN/)
})

test('la regresión rechaza projectId que no empieza por demo-', () => {
  const r = run(['scripts/run-regression.mjs'], { REGRESSION_PROJECT_ID: 'mi-proyecto-real' })
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /demo-/)
})

test('la regresión se niega a correr sin configuración de emulador', () => {
  const r = run(['src/ui/regression.test.mjs'], envWithout(['VITE_FIREBASE_']))
  const out = (r.stdout ?? '') + (r.stderr ?? '')
  assert.notEqual(r.status, 0)
  assert.match(out, /Faltan variables de emulador/)
})

test('env-guard detecta el proyecto de producción y acepta demo-', () => {
  assert.equal(isProductionProjectId('ados-docs'), true)
  assert.equal(isProductionProjectId('ADOS-DOCS'), true)
  assert.equal(isProductionProjectId('demo-ados-docs'), false)
  assert.equal(isProductionHost('ados-docs.firebaseapp.com'), true)
  assert.equal(isProductionHost('demo-ados-docs.firebaseapp.com'), false)
  assert.doesNotThrow(() => assertDemoProjectId('demo-ados-docs', 'test'))
  assert.throws(() => assertDemoProjectId('ados-docs', 'test'), /PRODUCCIÓN/)
  assert.throws(() => assertDemoProjectId('otro-proyecto', 'test'), /demo-/)
})

test('los emuladores siempre arrancan con un proyecto demo-', () => {
  const regression = readFileSync(join(ROOT, 'scripts/run-regression.mjs'), 'utf8')
  const rules = readFileSync(join(ROOT, 'scripts/run-rules.mjs'), 'utf8')
  assert.match(regression, /'demo-ados-docs'/)
  assert.match(rules, /'demo-ados-docs'/)
  assert.doesNotMatch(regression + rules, /(?<!demo-)ados-docs/)
})

test('los workflows de CI no referencian producción ni secretos', () => {
  const dir = join(ROOT, '.github/workflows')
  assert.ok(existsSync(dir), 'falta .github/workflows')
  const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f))
  assert.ok(files.length > 0, 'no hay workflows')
  for (const file of files) {
    const text = readFileSync(join(dir, file), 'utf8')
    assert.doesNotMatch(text, /(?<!demo-)ados-docs/, `${file} menciona el proyecto de producción`)
    assert.doesNotMatch(text, /secrets\./, `${file} usa secretos`)
    assert.match(text, /demo-/, `${file} no usa el prefijo demo-`)
  }
})

test('.env.example no contiene valores reales', () => {
  const text = readFileSync(join(ROOT, '.env.example'), 'utf8')
  assert.doesNotMatch(text, /AIza[0-9A-Za-z_-]{20,}/)
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('#') || trimmed === '') continue
    const match = trimmed.match(/^(VITE_[A-Z0-9_]+)=(.*)$/)
    if (!match) continue
    assert.equal(match[2], '', `${match[1]} tiene un valor: ${match[2]}`)
  }
})

test('no hay archivos de entorno ni punteros de proyecto trackeados', () => {
  assert.equal(gitTracks('.firebaserc'), false, '.firebaserc está trackeado')
  assert.equal(gitTracks('.env'), false, '.env está trackeado')
  assert.equal(gitTracks('.env.local'), false, '.env.local está trackeado')
  assert.equal(gitTracks('.env.production'), false, '.env.production está trackeado')
})

test('la configuración de la app no hardcodea el proyecto de producción', () => {
  const config = readFileSync(join(ROOT, 'src/firebase/config.ts'), 'utf8')
  assert.doesNotMatch(config, /ados-docs/)
  assert.doesNotMatch(config, /firebaseapp\.com/)
  const json = JSON.parse(readFileSync(join(ROOT, 'firebase.json'), 'utf8'))
  assert.equal('project' in json, false, 'firebase.json declara un proyecto')
  assert.doesNotMatch(JSON.stringify(json), /ados-docs/)
})

test('el script npm de regresión pasa por el guard', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  assert.equal(pkg.scripts['test:regression'], 'node scripts/run-regression.mjs')
  assert.equal(pkg.scripts['test:rules'], 'node scripts/run-rules.mjs')
  assert.doesNotMatch(pkg.scripts['test:regression'], /regression\.test\.mjs/)
})

test('scan: sin secretos ni PII en archivos trackeados', () => {
  const findings = scanRepo(ROOT)
  const detail = findings.map((f) => `${f.file}:${f.line} ${f.type}`).join('\n')
  assert.equal(findings.length, 0, `hallazgos:\n${detail}`)
})
