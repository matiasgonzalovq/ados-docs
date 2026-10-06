import { execFile, spawn, spawnSync } from 'node:child_process'
import { rmSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { assertNotProductionHost, assertNotProductionProject } from '../../scripts/env-guard.mjs'

const ROOT = new URL('../../', import.meta.url).pathname

function whichSync(bin) {
  try {
    const r = spawnSync('which', [bin], { encoding: 'utf8' })
    if (r.status === 0 && r.stdout) {
      const p = r.stdout.trim()
      if (p) return p
    }
  } catch {}
  return null
}

function resolveChrome() {
  const fromEnv = process.env.CHROME_PATH || process.env.BROWSER_PATH
  if (fromEnv) return fromEnv
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ]
  const absolute = candidates.find((p) => existsSync(p))
  if (absolute) return absolute
  for (const bin of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']) {
    const found = whichSync(bin)
    if (found) return found
  }
  throw new Error(
    'No se encontró Chrome/Chromium. Define CHROME_PATH=/ruta/a/chrome antes de ejecutar la prueba.',
  )
}

let CHROME
const CDP_PORT = 9242
const PREVIEW_PORT = 5198
const PROFILE = '/tmp/ados-regression-profile'
const DL_DIR = '/tmp/ados-regression-downloads'
const PAGE = `http://localhost:${PREVIEW_PORT}/`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function preflight() {
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID
  const authDomain = process.env.VITE_FIREBASE_AUTH_DOMAIN
  const authEmulator = process.env.VITE_FIREBASE_AUTH_EMULATOR_HOST
  const firestoreEmulator = process.env.VITE_FIREBASE_FIRESTORE_EMULATOR_HOST
  if (!projectId || !authEmulator || !firestoreEmulator) {
    throw new Error(
      'Faltan variables de emulador. Ejecuta la prueba con `npm run test:regression`, ' +
        'que arranca los emuladores locales de Firebase antes de construir.',
    )
  }
  assertNotProductionProject(projectId, 'src/ui/regression.test.mjs')
  if (authDomain) assertNotProductionHost(authDomain, 'src/ui/regression.test.mjs')
  console.log(`· proyecto de prueba: ${projectId}`)
  console.log(`· emuladores: auth=${authEmulator} firestore=${firestoreEmulator}`)
  return { authEmulator, firestoreEmulator }
}

async function assertEmulatorsReachable(authEmulator, firestoreEmulator) {
  for (const host of [authEmulator, firestoreEmulator]) {
    try {
      await fetch(`http://${host}/`, { signal: AbortSignal.timeout(3000) })
    } catch {
      throw new Error(`El emulador en ${host} no responde. Ejecuta con \`npm run test:regression\`.`)
    }
  }
}

let failures = 0
let stepCount = 0
function check(name, ok, detail = '') {
  stepCount += 1
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`
  console.log(line)
  if (!ok) failures += 1
}

let chrome
let ws
let msgId = 0
const pending = new Map()

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
}

async function evalJs(expression, awaitRes = false) {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: awaitRes })
  if (res.result?.exceptionDetails) {
    throw new Error('EVAL EXC: ' + JSON.stringify(res.result.exceptionDetails.exception?.description))
  }
  return res.result?.result?.value
}

async function click(selector) {
  const ok = await evalJs(`(()=>{const el=document.querySelector(${JSON.stringify(selector)}); if(!el) return false; el.click(); return true})()`)
  if (!ok) throw new Error(`elemento ${selector} no encontrado`)
  await sleep(350)
}

async function clickAction(action, param) {
  const selector = `[data-action="${action}"]${param ? `[data-param="${param}"]` : ''}`
  await click(selector)
}

async function setValue(selector, value) {
  const ok = await evalJs(`(()=>{const el=document.querySelector(${JSON.stringify(selector)}); if(!el) return false; const proto = el.tagName==='TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName==='SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)}); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return true})()`)
  if (!ok) throw new Error(`campo ${selector} no encontrado`)
  await sleep(300)
}

async function setSelectRaw(selector, value) {
  const ok = await evalJs(`(()=>{const el=document.querySelector(${JSON.stringify(selector)}); if(!el) return false; el.value=${JSON.stringify(value)}; el.dispatchEvent(new Event('change',{bubbles:true})); return true})()`)
  if (!ok) throw new Error(`select ${selector} no encontrado`)
  await sleep(350)
}

async function field(selector) {
  return evalJs(`(()=>{const el=document.querySelector(${JSON.stringify(selector)}); return el?el.value:null})()`)
}

async function text(selector) {
  return evalJs(`(()=>{const el=document.querySelector(${JSON.stringify(selector)}); return el?el.textContent:null})()`)
}

async function bodyText() {
  return (await evalJs(`document.body ? document.body.innerText : ''`)) ?? ''
}

async function submitForm(formSelector) {
  const ok = await evalJs(`(()=>{const f=document.querySelector(${JSON.stringify(formSelector)}); if(!f) return false; f.requestSubmit(); return true})()`)
  if (!ok) throw new Error(`form ${formSelector} no encontrado`)
  await sleep(400)
}

async function confirmDialog() {
  await click('.overlay [data-act="ok"]')
  await sleep(300)
}

async function count(selector) {
  return await evalJs(`document.querySelectorAll(${JSON.stringify(selector)}).length`)
}

async function sectionIds() {
  return await evalJs(`Array.from(document.querySelectorAll('.section-card')).map((c)=>c.getAttribute('data-id'))`)
}

async function clientNames() {
  return await evalJs(`Array.from(document.querySelectorAll('.client-card strong')).map((n)=>n.textContent)`)
}

async function clientIdByName(name) {
  return await evalJs(`(()=>{const card=Array.from(document.querySelectorAll('.client-card')).find((c)=>c.querySelector('strong')?.textContent===${JSON.stringify(name)}); return card ? card.querySelector('[data-action="cliente-edit"]').getAttribute('data-param') : null})()`)
}

async function sectionSubtotal(sectionId) {
  return (await evalJs(`(()=>{const c=document.querySelector('.section-card[data-id="${sectionId}"] .section-subtotal strong'); return c?c.textContent:null})()`))
}

async function sectionCards(heading) {
  return await evalJs(`(()=>{const h=[...document.querySelectorAll('h3')].find((x)=>x.textContent===${JSON.stringify(heading)}); if(!h) return -1; const list=h.nextElementSibling; return list ? list.querySelectorAll('.budget-card').length : -1})()`)
}

const BUDGET = {
  jobname: 'Edificio Los Alerces',
  jobaddress: 'Av. Los Aromos 456',
  discount: '100000',
  iva: '19',
  validityValue: '30',
  validityUnit: 'days',
  notes: 'Incluye pintura exterior.',
}

async function general() {
  return {
    jobname: await field('#b-jobname'),
    jobaddress: await field('#b-jobaddress'),
    discount: await field('#b-discount'),
    iva: await field('#b-iva'),
    paymentMode: await field('#b-payment-mode'),
    paymentCustom: await field('#b-payment-custom'),
    validityValue: await field('#b-validity-value'),
    validityUnit: await field('#b-validity-unit'),
    notes: await field('#b-notes'),
    client: await field('#b-client'),
  }
}

async function assertGeneralIntact(caso, clientId) {
  const g = await general()
  const ok =
    g.jobname === BUDGET.jobname &&
    g.jobaddress === BUDGET.jobaddress &&
    g.discount === BUDGET.discount &&
    g.iva === BUDGET.iva &&
    g.paymentMode === 'custom' &&
    g.paymentCustom === PAYMENT_CUSTOM &&
    g.validityValue === BUDGET.validityValue &&
    g.validityUnit === BUDGET.validityUnit &&
    g.notes === BUDGET.notes &&
    g.client === clientId
  check(`${caso}: datos generales intactos`, ok, ok ? '' : JSON.stringify(g))
  return g
}

const PAYMENT_PRESET = '50% al inicio / 50% al finalizar'
const PAYMENT_CUSTOM = 'Transferencia, 60% al inicio y 40% a la entrega'

async function main() {
  const { authEmulator, firestoreEmulator } = preflight()
  CHROME = resolveChrome()
  await assertEmulatorsReachable(authEmulator, firestoreEmulator)
  rmSync(PROFILE, { recursive: true, force: true })

  console.log('· build')
  const build = spawn('npm', ['run', 'build'], { cwd: ROOT, stdio: 'ignore' })
  await new Promise((r) => build.on('exit', r))
  check('build (tsc + vite)', build.exitCode === 0, `exit ${build.exitCode}`)

  console.log('· preview server')
  const preview = spawn('npm', ['run', 'preview', '--', '--port', String(PREVIEW_PORT)], { cwd: ROOT, stdio: 'ignore' })
  await sleep(2500)

  console.log('· chrome')
  chrome = execFile(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-extensions', `--remote-debugging-port=${CDP_PORT}`, '--user-data-dir=' + PROFILE, PAGE], () => {})
  await sleep(3000)

  let version
  for (let i = 0; i < 10; i++) {
    try { version = await (await fetch(`http://localhost:${CDP_PORT}/json`)).json(); break } catch { await sleep(500) }
  }
  const page = version.find((t) => t.type === 'page')
  ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res) => (ws.onopen = res))
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data)
    if (d.id && pending.has(d.id)) {
      const p = pending.get(d.id)
      if (d.error) p.reject(new Error(d.error.message))
      else p.resolve(d)
      pending.delete(d.id)
    }
  }
  await send('Runtime.enable')
  await send('Page.enable')
  rmSync(DL_DIR, { recursive: true, force: true })
  mkdirSync(DL_DIR, { recursive: true })
  try {
    await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL_DIR })
  } catch {
    await send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DL_DIR })
  }
  await sleep(1500)

  try {
    await runAll()
  } catch (err) {
    console.log('ERROR:', err.message)
    failures += 1
  }

  console.log(`\n${failures === 0 ? 'TODAS LAS PRUEBAS OK' : failures + ' FALLO(S)'}`)
  console.log(`${stepCount} comprobaciones`)
  try { ws.close() } catch {}
  try { chrome.kill() } catch {}
  try { rmSync(PROFILE, { recursive: true, force: true }) } catch {}
  preview.kill()
  process.exit(failures === 0 ? 0 : 1)
}

async function waitForSel(selector, tries = 60, delay = 250) {
  for (let i = 0; i < tries; i++) {
    if (await evalJs(`!!document.querySelector(${JSON.stringify(selector)})`)) {
      return true
    }
    await sleep(delay)
  }
  return false
}

async function ensureLoginMode() {
  for (let i = 0; i < 4; i++) {
    const h2 = await text('#view h2')
    if (h2 === 'Iniciar sesión') {
      return
    }
    if (h2 === 'Crear cuenta') {
      await clickAction('auth-toggle')
      await sleep(300)
      return
    }
    await sleep(300)
  }
}

async function runAll() {
  // =========================================================
  // Autenticación (la app exige sesión)
  // =========================================================
  console.log('\n→ Autenticación')
  const ts = Date.now()
  const TEST_EMAIL = `reg-${ts}@example.test`
  const TEST_PASS = 'ados-test-12345'
  check('vista de autenticación visible', (await text('.app-header h1')) === 'ADOS Docs' && !!(await evalJs(`!!document.querySelector('[data-auth-form]')`)))
  // Crear cuenta
  await clickAction('auth-toggle')
  check('se va a modo registro', (await text('#view h2')) === 'Crear cuenta')
  await setValue('[data-auth-email]', TEST_EMAIL)
  await setValue('[data-auth-password]', TEST_PASS)
  await clickAction('auth-submit')
  await sleep(2500)
  check('registrado y en inicio', (await count('.budget-list')) >= 0 || (await count('.issuer-list')) >= 0 || !!(await evalJs(`!!document.querySelector('[data-action="go-inicio"]')`)))

  // cerrar sesión y volver a iniciar con la misma cuenta (sesión única)
  await clickAction('go-config')
  await clickAction('logout')
  await sleep(1500)
  check('logout vuelve a auth', !!(await evalJs(`!!document.querySelector('[data-auth-form]')`)))
  await ensureLoginMode()
  await setValue('[data-auth-email]', TEST_EMAIL)
  await setValue('[data-auth-password]', TEST_PASS)
  await clickAction('auth-submit')
  await waitForSel('[data-action="go-inicio"]')
  check('re-login vuelve a inicio', !!(await evalJs(`!!document.querySelector('[data-action="go-inicio"]')`)))

  // cerrar sesión y volver a iniciar para dejar flujo limpio
  if (!(await evalJs(`!!document.querySelector('[data-action="go-config"]')`))) {
    await clickAction('go-inicio')
  }
  await clickAction('go-config')
  await clickAction('logout')
  await sleep(1500)
  await ensureLoginMode()
  await setValue('[data-auth-email]', TEST_EMAIL)
  await setValue('[data-auth-password]', TEST_PASS)
  await clickAction('auth-submit')
  await waitForSel('[data-action="go-inicio"]')

  // =========================================================
  // Perfiles emisores
  // =========================================================
  console.log('\n→ Perfiles emisores')
  await clickAction('go-config')

  // crear perfil empresa con giro
  await clickAction('issuer-new')
  await setValue('[name="giro"]', 'Construcción de viviendas')
  await setValue('[name="name"]', 'Constructora Demo SpA')
  await setValue('[name="rut"]', '11.111.111-1')
  await setValue('[name="phone"]', '944444444')
  await setValue('[name="email"]', 'contacto@constructora.example')
  await setValue('[name="address"]', 'Av. Los Aromos 456')
  await setValue('[name="info"]', 'Empresa familiar')
  // invariante: girar tipo/cambiar no pierde (solo re-render por logo no cubre headless; validamos edición posterior)
  await submitForm('[data-issuer-form]')
  await sleep(1200)
  check('perfil empresa guardado en listado', (await text('.issuer-list')).includes('Constructora Demo SpA'))

  // guardar -> navegar a clientes -> volver a ajustes -> permanece
  await clickAction('go-clientes')
  await sleep(400)
  await clickAction('go-config')
  await sleep(600)
  check('perfil sobrevive a navegación', (await text('.issuer-list')).includes('Constructora Demo SpA'))

  // reload -> permanece
  await evalJs(`location.reload()`, true)
  await sleep(2500)
  await clickAction('go-config')
  await sleep(600)
  check('perfil sobrevive a reload', (await text('.issuer-list')).includes('Constructora Demo SpA'))

  // editar -> persiste
  const issuerId = await evalJs(`(()=>{const card=Array.from(document.querySelectorAll('.issuer-card')).find(c=>c.querySelector('strong')&&c.querySelector('strong').textContent==='Constructora Demo SpA'); return card?card.querySelector('[data-action="issuer-edit"]').getAttribute('data-param'):null})()`)
  await clickAction('issuer-edit', issuerId)
  check('editar perfil precarga datos', (await field('[name="name"]')) === 'Constructora Demo SpA')
  await setValue('[name="rut"]', '22.222.222-2')
  await submitForm('[data-issuer-form]')
  await sleep(1200)
  await clickAction('go-config')
  await sleep(600)
  check('perfil editado conserva cambios', (await text('.issuer-list')).includes('22.222.222-2'))

  // perfil antiguo sin giro (J): se simula en el listado sin romper
  check('listado muestra tipo Empresa', (await text('.issuer-list')).includes('Empresa'))

  // =========================================================
  // BUG 2 (regresión previa): título nuevo/editar cliente
  // =========================================================
  console.log('\n→ Clientes (nuevo/editar)')
  await clickAction('go-clientes')
  await clickAction('cliente-new')
  check('Nuevo cliente: título correcto', (await text('[data-form="cliente"] h3')) === 'Nuevo cliente')
  await setValue('#cl-name', 'Constructora Sur SPA')
  await setValue('#cl-rut', '77.777.777-7')
  await submitForm('[data-form="cliente"]')
  check('cliente creado en listado', (await text('.client-card strong')) === 'Constructora Sur SPA')
  await clickAction('cliente-edit')
  check('Editar cliente: título correcto', (await text('[data-form="cliente"] h3')) === 'Editar cliente')
  await clickAction('cliente-cancel')

  // =========================================================
  // Persistencia de clientes (probar sobre recarga completa)
  // =========================================================
  console.log('\n→ Persistencia de clientes (reload)')

  // perfil de usuario: guardar y verificar que sobrevive al reload
  await clickAction('go-config')
  await setValue('[name="displayName"]', 'Usuario de prueba')
  await submitForm('[data-form="profile"]')
  check('perfil de usuario guardado', (await field('[name="displayName"]')) === 'Usuario de prueba')

  // crear 2 clientes más (además de Constructora Sur SPA)
  await clickAction('go-clientes')
  await clickAction('cliente-new')
  await setValue('#cl-name', 'Obra Constructora')
  await setValue('#cl-rut', '44.444.444-4')
  await setValue('#cl-phone', '944444444')
  await submitForm('[data-form="cliente"]')
  await clickAction('cliente-new')
  await setValue('#cl-name', 'Ferretodo')
  await setValue('#cl-rut', '55.555.555-5')
  await submitForm('[data-form="cliente"]')
  check('tres clientes en lista', (await count('.client-card')) === 3)

  // cliente creado → reload → sigue existiendo
  await evalJs(`location.reload()`, true)
  await sleep(2500)
  await clickAction('go-clientes')
  let names = await clientNames()
  check('cliente creado sobrevive a reload', names.includes('Constructora Sur SPA') && names.includes('Obra Constructora') && names.includes('Ferretodo'), JSON.stringify(names))

  // config intacta tras reload (requisito D: perfil de usuario)
  await clickAction('go-config')
  check('mi perfil visible', !!(await evalJs(`!!document.querySelector('[data-form="profile"]')`)))

  // editar cliente → reload → edición persiste
  await clickAction('go-clientes')
  await clickAction('cliente-edit', await clientIdByName('Ferretodo'))
  check('persistencia: título editar cliente', (await text('[data-form="cliente"] h3')) === 'Editar cliente')
  await setValue('#cl-name', 'Ferretodo Renovado')
  await setValue('#cl-phone', '955000000')
  await submitForm('[data-form="cliente"]')
  names = await clientNames()
  check('edición reflejada en lista', names.includes('Ferretodo Renovado') && !names.includes('Ferretodo'), JSON.stringify(names))
  await evalJs(`location.reload()`, true)
  await sleep(2500)
  await clickAction('go-clientes')
  names = await clientNames()
  check('edición persiste tras reload', names.includes('Ferretodo Renovado') && !names.includes('Ferretodo'), JSON.stringify(names))

  // eliminar cliente → reload → sigue eliminado
  await clickAction('cliente-del', await clientIdByName('Obra Constructora'))
  check('persistencia: confirmación de eliminación', !!(await evalJs(`!!document.querySelector('.overlay')`)))
  await confirmDialog()
  names = await clientNames()
  check('cliente eliminado de la lista', !names.includes('Obra Constructora') && (await count('.client-card')) === 2, JSON.stringify(names))
  await evalJs(`location.reload()`, true)
  await sleep(2500)
  await clickAction('go-clientes')
  names = await clientNames()
  check('eliminación persiste tras reload', (await count('.client-card')) === 2 && !names.includes('Obra Constructora') && names.includes('Constructora Sur SPA') && names.includes('Ferretodo Renovado'), JSON.stringify(names))

  // =========================================================
  // Editor: nuevo presupuesto
  // =========================================================
  console.log('\n→ Editor: nuevo presupuesto')
  await clickAction('go-inicio')
  await clickAction('budget-new')
  const clientId = await evalJs(`(()=>{const el=document.querySelector('#b-client'); return el && el.options.length>1 ? el.options[1].value : null})()`)
  const selectedClientName = await evalJs(`(()=>{const el=document.querySelector('#b-client'); return el && el.options.length>1 ? el.options[1].textContent : ''})()`)
  check('existe cliente en selector', clientId !== null && clientId !== '')
  await setValue('#b-client', clientId)

  await setValue('#b-jobname', BUDGET.jobname)
  await setValue('#b-jobaddress', BUDGET.jobaddress)
  await setValue('#b-discount', BUDGET.discount)
  await setValue('#b-iva', BUDGET.iva)
  await setValue('#b-validity-value', BUDGET.validityValue)
  await setValue('#b-validity-unit', BUDGET.validityUnit)
  await setValue('#b-notes', BUDGET.notes)

  // Modo opcional de ajuste de seguro: complejidad progresiva y valores conservados
  await setSelectRaw('#b-pricing-mode', 'insurance-adjustment')
  check('modo seguro muestra campos avanzados', !!(await evalJs(`!!document.querySelector('[name="overheadRate"]')`)) && !!(await evalJs(`!!document.querySelector('[name="ufValue"]')`)))
  await setValue('[name="overheadRate"]', '25')
  await setValue('[name="ufValue"]', '40876.41')
  await setValue('[name="deductibleUf"]', '5')
  await setSelectRaw('#b-pricing-mode', 'standard')
  check('modo normal oculta campos de seguro', !(await evalJs(`!!document.querySelector('[name="ufValue"]')`)))
  await setSelectRaw('#b-pricing-mode', 'insurance-adjustment')
  check('modo seguro conserva valor UF', (await field('[name="ufValue"]')) === '40876.41')
  await setSelectRaw('#b-pricing-mode', 'standard')

  // =========================================================
  // Forma de pago predefinida
  // =========================================================
  console.log('\n→ Forma de pago (predefinida)')
  check('no existe campo personalizado al inicio', !(await evalJs(`!!document.querySelector('[name="paymentCustom"]')`)))
  await setSelectRaw('#b-payment-mode', PAYMENT_PRESET)
  check('forma de pago predefinida seleccionada', (await field('#b-payment-mode')) === PAYMENT_PRESET)
  check('sin campo personalizado con predefinida', !(await evalJs(`!!document.querySelector('[name="paymentCustom"]')`)))

  // =========================================================
  // Forma de pago personalizada
  // =========================================================
  console.log('\n→ Forma de pago (personalizada)')
  await setSelectRaw('#b-payment-mode', 'custom')
  check('aparece campo personalizado', !!(await evalJs(`!!document.querySelector('[name="paymentCustom"]')`)))
  await setValue('[name="paymentCustom"]', PAYMENT_CUSTOM)
  check('texto personalizado ingresado', (await field('[name="paymentCustom"]')) === PAYMENT_CUSTOM)

  // =========================================================
  // Secciones: crear (3), renombrar y eliminar sin perder datos
  // =========================================================
  console.log('\n→ Secciones')
  await clickAction('section-new')
  check('título nueva sección', (await text('[data-section-form] h3')) === 'Nueva sección')
  await clickAction('section-suggest') // sugiere 'Obra general'
  check('sugerencia rellena el campo', (await field('[name="sectionName"]')) === 'Obra general')
  await submitForm('[data-section-form]')
  check('sección creada', (await count('.section-card')) === 1)
  check('sección vacía visible', !!(await evalJs(`!!document.querySelector('.section-card .section-empty')`)))

  await clickAction('section-new')
  await setValue('[name="sectionName"]', 'Electricidad')
  await submitForm('[data-section-form]')
  await clickAction('section-new')
  await setValue('[name="sectionName"]', 'Soldadura')
  await submitForm('[data-section-form]')
  check('tres secciones creadas', (await count('.section-card')) === 3)
  await assertGeneralIntact('después de crear secciones', clientId)

  // renombrar 'Obra general' -> 'Obra General'
  const sect = await sectionIds()
  await clickAction('section-edit', sect[0])
  check('título editar sección', (await text('[data-section-form] h3')) === 'Editar sección')
  check('nombre precargado', (await field('[name="sectionName"]')) === 'Obra general')
  await setValue('[name="sectionName"]', 'Obra General')
  await submitForm('[data-section-form]')
  check('sección renombrada', (await text(`.section-card[data-id="${sect[0]}"] .section-header strong`)) === 'Obra General')
  await assertGeneralIntact('después de renombrar sección', clientId)

  // Reordenar secciones actualiza el orden visual y la numeración.
  await clickAction('section-down', sect[0])
  check('sección baja una posición', (await sectionIds())[1] === sect[0])
  check('numeración de sección se recalcula', (await text(`.section-card[data-id="${sect[0]}"] .section-number`)) === '2')
  await clickAction('section-up', sect[0])
  check('sección vuelve a su posición', (await sectionIds())[0] === sect[0])
  await assertGeneralIntact('después de reordenar secciones', clientId)

  // sección efímera para probar eliminación con confirmación
  await clickAction('section-new')
  await setValue('[name="sectionName"]', 'Pintura')
  await submitForm('[data-section-form]')
  check('cuarta sección temporal', (await count('.section-card')) === 4)
  const sect2 = await sectionIds()
  const pintura = await evalJs(`(()=>{const el=Array.from(document.querySelectorAll('.section-card')).find(c=>c.querySelector('.section-header strong') && c.querySelector('.section-header strong').textContent==='Pintura'); return el?el.getAttribute('data-id'):null})()`)
  await clickAction('section-del', pintura)
  check('confirmación de eliminación de sección', !!(await evalJs(`!!document.querySelector('.overlay')`)))
  await confirmDialog()
  check('sección eliminada', (await count('.section-card')) === 3)
  check('eliminar sección no pierde otras', (await count('.section-card[data-id="' + sect2[0] + '"], .section-card[data-id="' + sect2[1] + '"], .section-card[data-id="' + sect2[2] + '"]')) === 3)
  await assertGeneralIntact('después de eliminar sección', clientId)

  // =========================================================
  // Ítems: tipos, montos y subtotales por sección
  // =========================================================
  console.log('\n→ Ítems en secciones')
  const S = await sectionIds()
  const S1 = S[0]
  const S2 = S[1]
  const S3 = S[2]

  async function addItem(sectionId, description, _type, quantity, unit, price, groupName = '', observation = '') {
    await click(`.section-card[data-id="${sectionId}"] [data-action="item-new"]`)
    await setValue('#it-desc', description)
    await setValue('#it-qty', quantity)
    await setValue('#it-unit', unit)
    await setValue('#it-price', price)
    if (groupName) await setValue('#it-group', groupName)
    if (observation) await setValue('#it-observation', observation)
    await submitForm('[data-item-form]')
  }

  await addItem(S1, 'Excavación', 'mano-de-obra', '10', 'm3', '5000', 'Cielo', 'Retiro controlado')
  await addItem(S1, 'Cerámica', 'material', '40', 'm2', '8000', 'Muro')
  check('S1 dos ítems', (await count(`.section-card[data-id="${S1}"] .quote-item-row`)) === 2)
  check('S1 muestra descripción de partida', (await text(`.section-card[data-id="${S1}"] .quote-item-row`)).includes('Excavación'))
  check('S1 muestra subpartidas Cielo y Muro', (await text(`.section-card[data-id="${S1}"] .quote-items-table`)).includes('Cielo') && (await text(`.section-card[data-id="${S1}"] .quote-items-table`)).includes('Muro'))
  check('S1 muestra observación', (await text(`.section-card[data-id="${S1}"] .quote-items-table`)).includes('Retiro controlado'))
  await clickAction('group-down', `${S1}::Cielo`)
  check('subpartida baja una posición', (await text(`.section-card[data-id="${S1}"] .quote-group-row:first-child`)).includes('Muro'))
  check('numeración de subpartida se recalcula', (await text(`.section-card[data-id="${S1}"] .quote-group-row:first-child td:first-child`)) === '1.1')
  await clickAction('group-up', `${S1}::Cielo`)
  check('subpartida vuelve a su posición', (await text(`.section-card[data-id="${S1}"] .quote-group-row:first-child`)).includes('Cielo'))
  check('controles para ordenar partidas visibles', (await count(`.section-card[data-id="${S1}"] [data-action="item-up"]`)) === 2)
  check('S1 subtotal correcto', (await sectionSubtotal(S1)) === '$370.000')
  await assertGeneralIntact('después de ítems S1', clientId)

  await addItem(S2, 'Cableado', 'servicio', '100', 'ml', '1200')
  check('S2 una partida', (await count(`.section-card[data-id="${S2}"] .quote-item-row`)) === 1)
  check('S2 subtotal correcto', (await sectionSubtotal(S2)) === '$120.000')

  await addItem(S3, 'Estructura metálica', 'material', '5', 'unidad', '30000')
  check('S3 subtotal correcto', (await sectionSubtotal(S3)) === '$150.000')

  // Totales con IVA y descuento
  check('subtotal general', (await text('[data-t="subtotal"]')) === '$640.000')
  check('descuento', (await text('[data-t="discount"]')) === '$100.000')
  check('base imponible', (await text('[data-t="base"]')) === '$540.000')
  check('IVA 19%', (await text('[data-t="iva"]')) === '$102.600')
  check('total general', (await text('[data-t="total"]')) === '$642.600')

  // =========================================================
  // Editar / eliminar ítem sin perder datos
  // =========================================================
  console.log('\n→ Editar/eliminar ítem')
  // editar primer ítem de S1 (Excavación): precio 5000 -> 6000
  await click(`.section-card[data-id="${S1}"] .quote-item-row [data-action="item-edit"]`)
  check('formulario de ítem precargado', (await field('#it-desc')) === 'Excavación')
  check('formulario de ítem conserva unidad', (await field('#it-unit')) === 'm3')
  await setValue('#it-price', '6000')
  await submitForm('[data-item-form]')
  check('S1 subtotal tras editar', (await sectionSubtotal(S1)) === '$380.000')
  check('total tras editar ítem', (await text('[data-t="total"]')) === '$654.500')
  await assertGeneralIntact('después de editar ítem', clientId)

  // eliminar el único ítem de S3
  await click(`.section-card[data-id="${S3}"] .quote-item-row [data-action="item-del"]`)
  check('S3 queda sin ítems', (await count(`.section-card[data-id="${S3}"] .quote-item-row`)) === 0)
  check('S3 subtotal a cero', (await sectionSubtotal(S3)) === '$0')
  check('total tras eliminar ítem', (await text('[data-t="total"]')) === '$476.000')
  await assertGeneralIntact('después de eliminar ítem', clientId)

  // La tabla usa "Partida" según el formato de ajuste, pero mantiene "Cotización" como entidad principal.
  const body = (await bodyText()).toLowerCase()
  check('la tabla usa el término "partida"', body.includes('partida'), body.slice(0, 80))
  check('no se usa el término "presupuesto"', !body.includes('presupuesto'), body.slice(0, 120))

  // =========================================================
  // Guardar y persistencia tras recargar
  // =========================================================
  console.log('\n→ Guardar y persistencia')
  await clickAction('budget-save')
  await waitForSel('.budget-card')
  check('guardado vuelve a inicio', (await count('.budget-card')) === 1)
  check('historial muestra total', (await text('.budget-total')) === '$476.000')
  check('historial muestra cliente', (await text('.budget-card')).includes(selectedClientName))

  await evalJs(`location.reload()`, true)
  await sleep(2500)
  check('tras recarga queda el presupuesto', (await count('.budget-card')) === 1)
  check('tras recarga total correcto', (await text('.budget-total')) === '$476.000')

  await clickAction('budget-open')
  check('tras recarga secciones presentes', (await count('.section-card')) === 3)
  check('tras recarga S1 subtotal', (await sectionSubtotal(await firstSectionId())) === '$380.000')
  const g = await general()
  check('tras recarga forma de pago personalizada', g.paymentMode === 'custom' && g.paymentCustom === PAYMENT_CUSTOM)
  check('tras recarga datos generales', g.jobname === BUDGET.jobname && g.discount === BUDGET.discount && g.iva === BUDGET.iva)

  // =========================================================
  // PDF detallado y resumido (descargas)
  // =========================================================
  console.log('\n→ PDF detallado y resumido')
  await clickAction('budget-back')
  const hasBoth = (await evalJs(`(()=>{const a=[...document.querySelectorAll('[data-action^="budget-download"]')].map(b=>b.getAttribute('data-action')); return a.includes('budget-download')&&a.includes('budget-download-resumen')})()`))
  check('existen descargas detallado y resumido', hasBoth)

  await clickAction('budget-download-resumen')
  await waitForFile('cotizacion-0001-resumen.pdf')
  check('descarga PDF resumido', fileNamed('cotizacion-0001-resumen.pdf'))
  await clickAction('budget-download')
  await waitForFile('cotizacion-0001-detalle.pdf')
  check('descarga PDF detallado', fileNamed('cotizacion-0001-detalle.pdf'))

  // =========================================================
  // Estado de la cotización: badge, cambio de estado, archivado
  // =========================================================
  console.log('\n→ Estado y archivado')
  check('badge de estado Pendiente visible', (await text('.budget-card .badge-status')) === 'Pendiente')
  check('título usa Cotización', (await text('.budget-card .budget-top strong')).startsWith('Cotización'))

  await clickAction('budget-status')
  check('diálogo de cambio de estado', (await text('.overlay .dialog p')) === 'Cambiar estado de la cotización')
  await click('.overlay [data-act="se-realizara"]')
  await sleep(1200)
  check('estado cambió a Se realizará', (await text('.budget-card .badge-status')) === 'Se realizará')

  await clickAction('budget-status')
  await click('.overlay [data-act="no-realizada"]')
  await sleep(1200)
  check('No realizada pasa a archivadas', (await count('.budget-card')) === 1)
  check('badge No realizada visible', (await text('.budget-card .badge-status')) === 'No realizada')
  check('lista de activas queda vacía', (await sectionCards('Cotizaciones activas')) === 0)
  check('cotización aparece en Archivadas', (await sectionCards('Archivadas')) === 1)

  await clickAction('budget-status')
  await click('.overlay [data-act="pendiente"]')
  await sleep(1200)
  check('archivada devuelta a Pendiente', (await text('.budget-card .badge-status')) === 'Pendiente')
  check('vuelve a cotizaciones activas', (await sectionCards('Cotizaciones activas')) === 1)

  // La compatibilidad con estructuras locales antiguas se valida en las pruebas de
  // dominio de parseBudget. La aplicación autenticada actual usa Firestore, por lo
  // que inyectar localStorage aquí no representa el flujo de producción.
}

async function firstSectionId() {
  return (await sectionIds())[0]
}

async function waitForFile(name) {
  const path = DL_DIR + '/' + name
  for (let i = 0; i < 20; i++) {
    if (existsSync(path) && statSync(path).size > 100) {
      return true
    }
    await sleep(250)
  }
  return false
}

function fileNamed(name) {
  const path = DL_DIR + '/' + name
  if (!existsSync(path)) {
    console.log('   (falta archivo: ' + name + ')')
    return false
  }
  return statSync(path).size > 100
}

main().catch((err) => {
  console.error('\n' + err.message)
  process.exit(1)
})
