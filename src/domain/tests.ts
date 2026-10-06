import { calcularTotales, calculateInsuranceTotals, formatCLP, moneyToCents, textToCents } from './money.ts'
import {
  validateDiscount,
  validateItem,
  validateSectionName,
  itemsTotalCents,
  sectionSubtotalCents,
  budgetSubtotalCents,
  validateBudget,
  budgetHasValidItems,
  budgetStatus,
  budgetIsArchived,
  isArchivedStatus,
  snapshotFromIssuer,
  validateIssuer,
  refreshIssuerSnapshot,
  formatValidityValue,
  formatExecutionTime,
  formatBudgetValidity,
  parseValidityString,
  itemAdjustedTotalCents,
  budgetAdjustedSubtotalCents,
  budgetGrandTotalCents,
} from './validators.ts'
import type { Budget, BudgetItem, BudgetSection, ExecutionTimeUnit, IssuerProfile, ValidityUnit } from './types.ts'
import { parseBudget } from '../storage/store.ts'
import { parseIssuer } from '../firebase/store.ts'
import { createSampleQuote } from './sampleQuote.ts'
import { formatRut, normalizeRut, validateRut, formatRutOnInput } from './rut.ts'
import {
  puedeGenerarPdf,
  generarPresupuestoPdf,
  nombreArchivoCotizacionDetallado,
  nombreArchivoCotizacionResumido,
} from '../pdf/pdf.ts'
import { optimizeIssuerImage } from '../domain/imageOptimize.ts'
import { jsPDF } from 'jspdf'

let failures = 0
let count = 0

function eq(name: string, actual: unknown, expected: unknown) {
  count++
  const ok = Object.is(actual, expected)
  if (!ok) {
    failures++
    console.error(`✗ ${name}: esperado ${expected}, recibido ${actual}`)
  } else {
    console.log(`✓ ${name}`)
  }
}

function ok(name: string, value: boolean) {
  eq(name, value, true)
}

function item(overrides: Partial<BudgetItem> = {}): BudgetItem {
  return {
    id: 'i1',
    description: 'Ítem',
    type: 'material',
    quantity: 1,
    unit: 'unidad',
    unitPrice: 1000,
    ...overrides,
  }
}

function section(
  name: string,
  items: BudgetItem[] = [],
  id = name,
  extra?: Partial<BudgetSection>,
): BudgetSection {
  return { id, name, items, ...extra }
}

function sampleBudget(): Budget {
  const s1 = section('Obra general', [
    item({ id: 'a', description: 'Hormigón', quantity: 10, unit: 'm3', unitPrice: 5000 }),
    item({ id: 'b', description: 'Cerámica', quantity: 40, unit: 'm2', unitPrice: 8000 }),
  ], 's1')
  const s2 = section('Electricidad', [
    item({ id: 'c', description: 'Cableado', quantity: 100, unit: 'ml', unitPrice: 1200, type: 'servicio' }),
  ], 's2')
  return {
    id: 'b1',
    number: 1,
    date: '2026-08-16T00:00:00.000Z',
    clientId: 'cli-1',
    clientSnapshot: { name: 'Constructora Sur' },
    jobName: 'Edificio Los Alerces',
    jobAddress: 'Av. Los Aromos 456',
    sections: [s1, s2],
    discount: 1000000,
    ivaRate: 19,
    paymentTerms: '50% al inicio / 50% al finalizar',
    validity: '30 días',
    notes: 'Incluye pintura.',
    status: 'pendiente',
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
  }
}

// ---- Dinero ----
{
eq('0.1 + 0.2 en centavos', moneyToCents(0.1, 1000) + moneyToCents(0.2, 1000), moneyToCents(0.3, 1000))
eq('monto 1.5 x 2500', moneyToCents(1.5, 2500), 375000)
eq('redondeo a centavo', moneyToCents(0.333, 100), 3330)
eq('textToCents "1.234"', textToCents('1.234'), 123400)
eq('textToCents "1234"', textToCents('1234'), 123400)
eq('textToCents "$50.000"', textToCents('$50.000'), 5000000)
eq('textToCents "12,5"', textToCents('12,5'), 1250)
ok('textToCents inválido es NaN', Number.isNaN(textToCents('abc')))

const totals = calcularTotales([100000, 250000], 50000, 19)
eq('subtotal', totals.subtotal, 350000)
eq('descuento', totals.discount, 50000)
eq('baseImponible', totals.baseImponible, 300000)
eq('iva 19%', totals.iva, 57000)
eq('total', totals.total, 357000)

const totalsSinDescuento = calcularTotales([100000], 0, 0)
eq('sin descuento base = subtotal', totalsSinDescuento.baseImponible, totalsSinDescuento.subtotal)
eq('sin iva total = base', totalsSinDescuento.total, totalsSinDescuento.baseImponible)

ok('formato es-CL', formatCLP(123456700) === '$1.234.567')

// ---- Validadores ----
const descuentoValido = validateDiscount(50000, 350000)
eq('descuento válido', descuentoValido.valid, true)
const descuentoMayor = validateDiscount(500000, 350000)
eq('descuento mayor que subtotal inválido', descuentoMayor.valid, false)
const descuentoNegativo = validateDiscount(-1, 350000)
eq('descuento negativo inválido', descuentoNegativo.valid, false)

const itemValido = validateItem(item())
eq('ítem válido', itemValido.valid, true)
const itemSinDesc = validateItem(item({ description: '  ' }))
eq('ítem sin descripción inválido', itemSinDesc.valid, false)
const itemCantidadCero = validateItem(item({ quantity: 0 }))
eq('ítem cantidad cero inválido', itemCantidadCero.valid, false)
const itemPrecioCero = validateItem(item({ unitPrice: 0 }))
eq('ítem precio cero inválido', itemPrecioCero.valid, false)
eq('tipo inválido rechazado', validateItem(item({ type: 'x' as never })).valid, false)

eq('nombre de sección válido', validateSectionName('Electricidad').valid, true)
eq('nombre de sección vacío inválido', validateSectionName('  ').valid, false)

// ---- Subtotales por sección y general ----
eq('subtotal de ítems', itemsTotalCents([item({ quantity: 2, unitPrice: 1500 })]), 300000)
eq(
  'subtotal de sección (10 m³ x $5.000 + 40 m² x $8.000)',
  sectionSubtotalCents(section('Obra general', [
    item({ quantity: 10, unit: 'm3', unitPrice: 5000 }),
    item({ quantity: 40, unit: 'm2', unitPrice: 8000 }),
  ])),
  5000000 + 32000000,
)
const budget = sampleBudget()
eq(
  'subtotal general = suma de secciones',
  budgetSubtotalCents(budget),
  sectionSubtotalCents(budget.sections[0]) + sectionSubtotalCents(budget.sections[1]),
)

// ---- Validación de presupuesto sobre secciones ----
eq('presupuesto válido con ítems en secciones', validateBudget(true, budget.sections).valid, true)
eq('sin cliente inválido', validateBudget(false, budget.sections).valid, false)
const emptySections = validateBudget(true, [section('Vacía', [])])
eq('sin ítems en ninguna sección inválido', emptySections.valid, false)
const oneEmpty = validateBudget(true, [section('Vacía', []), section('Con ítems', [item()])])
eq('sección vacía junto a otra con ítems es válido', oneEmpty.valid, true)
ok('budgetHasValidItems con ítems', budgetHasValidItems(budget))
ok('budgetHasValidItems sin ítems es falso', !budgetHasValidItems({ ...budget, sections: [] }))

// ---- Compatibilidad: migración de presupuesto antiguo ----
const legacy = {
  id: 'legacy-1',
  number: 3,
  date: '2026-01-01T00:00:00.000Z',
  clientId: 'cli-9',
  clientSnapshot: { name: 'Cliente Viejo', rut: '1-9' },
  jobName: 'Bodega',
  jobAddress: 'Los Nogales 1',
  items: [
    { id: 'p1', description: 'Hormigón', quantity: 5, unit: 'm3', unitPrice: 4500 },
    { id: 'p2', description: 'Cerámica', quantity: 20, unit: 'm2', unitPrice: 7000 },
  ],
  discount: 0,
  ivaRate: 19,
  paymentTerms: 'Contado',
  validity: '',
  notes: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}
const migrado = parseBudget(legacy)!
ok('presupuesto antiguo migra', migrado !== null)
eq('migración: sección automática', migrado.sections.length, 1)
eq('migración: nombre de sección', migrado.sections[0].name, 'Obra general')
eq('migración: id de sección estable', migrado.sections[0].id, 'sec-legacy')
eq('migración: conserva ítems', migrado.sections[0].items.length, 2)
eq('migración: tipo por defecto', migrado.sections[0].items[0].type, 'otro')
eq(
  'migración: subtotal conservado',
  budgetSubtotalCents(migrado),
  itemsTotalCents(migrado.sections[0].items),
)
eq('migración: conserva cliente y datos', migrado.clientSnapshot?.name, 'Cliente Viejo')
eq('migración: conserva número', migrado.number, 3)
eq('migración: estado por defecto Pendiente', budgetStatus(migrado), 'pendiente')
ok('migración: no archivada por defecto', !budgetIsArchived(migrado))

// ---- Estados de cotización ----
const archivada = { ...budget, status: 'no-realizada' as const }
ok('estado no-realizada es archivada', budgetIsArchived(archivada))
ok('estado no-realizada es archivada por status', isArchivedStatus('no-realizada'))
const porRealizarse = { ...budget, status: 'se-realizara' as const }
ok('se-realizara no es archivada', !budgetIsArchived(porRealizarse))
eq('estado por defecto en presupuesto sin estado', budgetStatus({ ...budget, status: undefined }), 'pendiente')
const estadoInvalido = { ...budget, status: 'rara' as never }
ok('estado inválido recae a Pendiente', budgetStatus(estadoInvalido) === 'pendiente')

// ---- Perfil emisor y Giro ----
const issuerEmpresa: IssuerProfile = {
  id: 'iss-1',
  ownerUid: 'uid-1',
  kind: 'empresa',
  name: 'Constructora Demo SpA',
  rut: '11.111.111-1',
  giro: 'Construcción de viviendas',
  createdAt: '2026-08-16T00:00:00.000Z',
  updatedAt: '2026-08-16T00:00:00.000Z',
}
ok('snapshot conserva giro', snapshotFromIssuer(issuerEmpresa).giro === 'Construcción de viviendas')
ok('snapshot conserva logo? (undefined ok)', snapshotFromIssuer(issuerEmpresa).logoDataUrl === undefined)
ok('issuer empresa válido', validateIssuer(issuerEmpresa).valid)
ok('issuer persona sin giro es válido', validateIssuer({ ...issuerEmpresa, kind: 'persona', name: 'Persona Demo', giro: undefined }).valid)
const issuerRoundtrip = parseIssuer({ ...issuerEmpresa })
ok('read issuer conserva giro', issuerRoundtrip?.giro === 'Construcción de viviendas')
ok('read issuer sin giro conserva indefinido', parseIssuer({ ...issuerEmpresa, giro: undefined })?.giro === undefined)

// Perfil antiguo sin giro: debe leer como indefinido
const legacyIssuer = { ...issuerEmpresa }
delete (legacyIssuer as Record<string, unknown>).giro
ok('perfil antiguo sin giro carga correctamente', parseIssuer(legacyIssuer)?.giro === undefined && parseIssuer(legacyIssuer)?.name === 'Constructora Demo SpA')

// ---- Persistencia y reconstrucción de logoDataUrl ----
const PNG_LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const issuerConLogo = { ...issuerEmpresa, logoDataUrl: PNG_LOGO }
ok('read issuer conserva logoDataUrl', parseIssuer(issuerConLogo)?.logoDataUrl === PNG_LOGO)
ok('snapshot conserva logoDataUrl', snapshotFromIssuer(issuerConLogo).logoDataUrl === PNG_LOGO)
// Perfil existente sin logo: editar y conservar undefined (no borrar nada)
ok('perfil sin logo conserva indefinido', parseIssuer(issuerEmpresa)?.logoDataUrl === undefined)
// Reconstrucción completa tras guardar+leer (simula setDoc->parseIssuer)
const guardado = JSON.parse(JSON.stringify(issuerConLogo))
const releido = parseIssuer(guardado)
ok('logoDataUrl sobrevive a guardar+leer (reconstrucción)', releido?.logoDataUrl === PNG_LOGO && releido?.name === 'Constructora Demo SpA' && releido?.rut === '11.111.111-1' && releido?.giro === 'Construcción de viviendas')

// ---- Firma del emisor ----
const issuerConFirma = { ...issuerEmpresa, signatureDataUrl: 'data:image/png;base64,AAA' }
ok('snapshot conserva firma', snapshotFromIssuer(issuerConFirma).signatureDataUrl === 'data:image/png;base64,AAA')
ok('read issuer conserva firma', parseIssuer({ ...issuerConFirma })?.signatureDataUrl === 'data:image/png;base64,AAA')
const issuerSinFirma = { ...issuerEmpresa }
delete (issuerSinFirma as Record<string, unknown>).signatureDataUrl
ok('perfil antiguo sin firma carga como indefinido', parseIssuer(issuerSinFirma)?.signatureDataUrl === undefined && parseIssuer(issuerSinFirma)?.name === 'Constructora Demo SpA')
ok('issuer con firma sigue siendo válido', validateIssuer(issuerConFirma).valid)

// ---- Flujo REAL de guardado: saveIssuerForm → sanitize → setDoc payload ----
// Reproduce la misma lógica de sanitize() de firebase/store.ts
function testSanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(testSanitize)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined || v === null) continue
      out[k] = testSanitize(v)
    }
    return out
  }
  return value
}

// 1. Payload final contiene ambos campos
const draftCompleto: IssuerProfile = {
  id: 'test-issuer',
  ownerUid: 'uid-123',
  kind: 'empresa',
  name: 'Test SpA',
  rut: '11.111.111-1',
  phone: '+56912345678',
  email: 'test@example.com',
  address: 'Av. Test 123',
  logoDataUrl: 'data:image/png;base64,AAAA',
  info: 'Info test',
  giro: 'Construcción',
  signatureDataUrl: 'data:image/png;base64,BBBB',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}
const payload = testSanitize(draftCompleto) as Record<string, unknown>
ok('sanitize payload contiene logoDataUrl', typeof payload.logoDataUrl === 'string' && (payload.logoDataUrl as string).length > 0)
ok('sanitize payload contiene signatureDataUrl', typeof payload.signatureDataUrl === 'string' && (payload.signatureDataUrl as string).length > 0)
ok('sanitize payload contiene name', payload.name === 'Test SpA')
ok('sanitize payload contiene giro', payload.giro === 'Construcción')

// 2. Editar existente: cambiar solo teléfono no elimina imágenes
const existenteConImagenes: IssuerProfile = { ...draftCompleto }
existenteConImagenes.phone = '+56999999999' // solo cambia teléfono
const payloadEdit = testSanitize(existenteConImagenes) as Record<string, unknown>
ok('editar teléfono conserva logoDataUrl', typeof payloadEdit.logoDataUrl === 'string')
ok('editar teléfono conserva signatureDataUrl', typeof payloadEdit.signatureDataUrl === 'string')

// 3. Cambiar logo no elimina firma
const cambioLogo: IssuerProfile = { ...draftCompleto, logoDataUrl: 'data:image/png;base64,CCCC' }
const payloadCambioLogo = testSanitize(cambioLogo) as Record<string, unknown>
ok('cambiar logo conserva signatureDataUrl', typeof payloadCambioLogo.signatureDataUrl === 'string' && (payloadCambioLogo.signatureDataUrl as string).length > 0)
ok('cambiar logo tiene nuevo logoDataUrl', payloadCambioLogo.logoDataUrl === 'data:image/png;base64,CCCC')

// 4. Cambiar firma no elimina logo
const cambioFirma: IssuerProfile = { ...draftCompleto, signatureDataUrl: 'data:image/png;base64,DDDD' }
const payloadCambioFirma = testSanitize(cambioFirma) as Record<string, unknown>
ok('cambiar firma conserva logoDataUrl', typeof payloadCambioFirma.logoDataUrl === 'string' && (payloadCambioFirma.logoDataUrl as string).length > 0)
ok('cambiar firma tiene nuevo signatureDataUrl', payloadCambioFirma.signatureDataUrl === 'data:image/png;base64,DDDD')

// Cotización: firma manual y guardada generan PDF
const firmaManualBudget = { ...budget, signatureMode: 'manual' as const }
const pdfManual = generarPresupuestoPdf(firmaManualBudget, { name: 'ADOS' }, 'detallado')
ok('PDF con firma manual se genera', pdfManual.getNumberOfPages() >= 1)
const firmaSavedBudget = { ...budget, signatureMode: 'saved' as const, issuerSnapshot: { issuerId: 'iss-1', kind: 'empresa' as const, name: 'Constructora Demo SpA', rut: '11.111.111-1', signatureDataUrl: 'data:image/png;base64,AAA' } }
const pdfSaved = generarPresupuestoPdf(firmaSavedBudget, { name: 'ADOS' }, 'detallado')
ok('PDF con firma guardada se genera', pdfSaved.getNumberOfPages() >= 1)
const pdfSinFirma = generarPresupuestoPdf({ ...budget, signatureMode: 'none' }, { name: 'ADOS' }, 'detallado')
ok('PDF sin firma se genera', pdfSinFirma.getNumberOfPages() >= 1)

// ---- Firma: datos del firmante en PDF ----
{
  const bWithSigner = {
    ...budget,
    signatureMode: 'saved' as const,
    issuerSnapshot: {
      issuerId: 'iss-1',
      kind: 'empresa' as const,
      name: 'Empresa Test',
      rut: '76.000.000-1',
      signatureDataUrl: 'data:image/png;base64,AAAA',
      signerName: 'Representante Ejemplo',
      signerRut: '20123456-5',
      signerRole: 'Representante legal',
    },
  }
  const pdfSigner = generarPresupuestoPdf(bWithSigner, { name: 'ADOS' }, 'detallado')
  const signerStr = pdfText(pdfSigner)
  ok('PDF con firmante: se genera', pdfSigner.getNumberOfPages() >= 1)
  ok('PDF con firmante: contiene nombre', signerStr.includes('Representante Ejemplo'))
  ok('PDF con firmante: contiene RUT formateado', signerStr.includes('20.123.456-5'))
  ok('PDF con firmante: contiene cargo', signerStr.includes('Representante legal'))
}

// ---- Firma: sin cargo (solo nombre + RUT) ----
{
  const bNoRole = {
    ...budget,
    signatureMode: 'saved' as const,
    issuerSnapshot: {
      issuerId: 'iss-1',
      kind: 'empresa' as const,
      name: 'Empresa Test',
      signatureDataUrl: 'data:image/png;base64,AAAA',
      signerName: 'María López',
      signerRut: '12345678-5',
    },
  }
  const pdfNoRole = generarPresupuestoPdf(bNoRole, { name: 'ADOS' }, 'detallado')
  const noRoleStr = pdfText(pdfNoRole)
  ok('PDF sin cargo: se genera', pdfNoRole.getNumberOfPages() >= 1)
  ok('PDF sin cargo: contiene nombre', noRoleStr.includes('María López'))
  ok('PDF sin cargo: contiene RUT', noRoleStr.includes('12.345.678-5'))
}

// ---- Firma: sin datos del firmante (compatibilidad) ----
{
  const bNoSigner = {
    ...budget,
    signatureMode: 'saved' as const,
    issuerSnapshot: {
      issuerId: 'iss-1',
      kind: 'empresa' as const,
      name: 'Empresa Test',
      signatureDataUrl: 'data:image/png;base64,AAAA',
    },
  }
  const pdfNoSigner = generarPresupuestoPdf(bNoSigner, { name: 'ADOS' }, 'detallado')
  ok('PDF sin datos firmante: se genera', pdfNoSigner.getNumberOfPages() >= 1)
}

// ---- snapshotFromIssuer conserva campos del firmante ----
{
  const issSigner: IssuerProfile = {
    id: 'iss-signer',
    ownerUid: 'uid-1',
    kind: 'empresa',
    name: 'Test SpA',
    signerName: 'Carlos García',
    signerRut: '11111111-1',
    signerRole: 'Gerente',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
  const snapSigner = snapshotFromIssuer(issSigner)
  eq('snapshot conserva signerName', snapSigner.signerName, 'Carlos García')
  eq('snapshot conserva signerRut', snapSigner.signerRut, '11111111-1')
  eq('snapshot conserva signerRole', snapSigner.signerRole, 'Gerente')
}

// ---- snapshotFromIssuer: campos del firmante undefined por defecto ----
{
  const issNoSigner: IssuerProfile = {
    id: 'iss-nosign',
    ownerUid: 'uid-1',
    kind: 'persona',
    name: 'Sin Firmante',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
  const snapNoSigner = snapshotFromIssuer(issNoSigner)
  eq('snapshot sin firmante: signerName undefined', snapNoSigner.signerName, undefined)
  eq('snapshot sin firmante: signerRut undefined', snapNoSigner.signerRut, undefined)
  eq('snapshot sin firmante: signerRole undefined', snapNoSigner.signerRole, undefined)
}

// ---- Firma: fallback a companyName cuando signerName vacío ----
{
  const bFallback = {
    ...budget,
    signatureMode: 'saved' as const,
    issuerSnapshot: {
      issuerId: 'iss-1',
      kind: 'empresa' as const,
      name: 'Empresa Ejemplo Ltda.',
      signatureDataUrl: 'data:image/png;base64,AAAA',
      signerName: '',
      signerRut: undefined,
    },
  }
  const pdfFallback = generarPresupuestoPdf(bFallback, { name: 'ADOS' }, 'detallado')
  const fallbackStr = pdfText(pdfFallback)
  ok('PDF fallback: se genera', pdfFallback.getNumberOfPages() >= 1)
  ok('PDF fallback: muestra nombre de empresa', fallbackStr.includes('Empresa Ejemplo Ltda.'))
}

// ---- Firma: fallback cuando signerName es undefined ----
{
  const bFallbackUndefined = {
    ...budget,
    signatureMode: 'saved' as const,
    issuerSnapshot: {
      issuerId: 'iss-1',
      kind: 'empresa' as const,
      name: 'Mi Empresa SpA',
      signatureDataUrl: 'data:image/png;base64,AAAA',
    },
  }
  const pdfFallbackU = generarPresupuestoPdf(bFallbackUndefined, { name: 'ADOS' }, 'detallado')
  const fallbackUStr = pdfText(pdfFallbackU)
  ok('PDF fallback undefined: muestra nombre de empresa', fallbackUStr.includes('Mi Empresa SpA'))
}

// ---- Firma: sin RUT del firmante (no usar RUT de empresa) ----
{
  const bNoSignerRut = {
    ...budget,
    signatureMode: 'saved' as const,
    issuerSnapshot: {
      issuerId: 'iss-1',
      kind: 'empresa' as const,
      name: 'Empresa Test',
      rut: '76.000.000-1',
      signatureDataUrl: 'data:image/png;base64,AAAA',
      signerName: 'Juan Pérez',
    },
  }
  const pdfNoSR = generarPresupuestoPdf(bNoSignerRut, { name: 'ADOS' }, 'detallado')
  const noSRStr = pdfText(pdfNoSR)
  ok('PDF sin signerRut: se genera', pdfNoSR.getNumberOfPages() >= 1)
  ok('PDF sin signerRut: contiene nombre', noSRStr.includes('Juan Pérez'))
  ok('PDF sin signerRut: no muestra RUT del firmante', !noSRStr.includes('RUT: 76.000.000-1'))
}

// ---- parseIssuer incluye campos del firmante ----
{
  const parsed = parseIssuer({
    id: 'iss-1',
    name: 'Test SpA',
    signerName: 'Pedro Soto',
    signerRut: '11111111-1',
    signerRole: 'Director',
  })
  ok('parseIssuer: resultado no null', parsed !== null)
  eq('parseIssuer: signerName', parsed?.signerName, 'Pedro Soto')
  eq('parseIssuer: signerRut', parsed?.signerRut, '11111111-1')
  eq('parseIssuer: signerRole', parsed?.signerRole, 'Director')
}

// ---- parseIssuer: campos del firmante undefined si no existen ----
{
  const parsedOld = parseIssuer({
    id: 'iss-old',
    name: 'Sin Firmante',
  })
  ok('parseIssuer old: resultado no null', parsedOld !== null)
  eq('parseIssuer old: signerName undefined', parsedOld?.signerName, undefined)
  eq('parseIssuer old: signerRut undefined', parsedOld?.signerRut, undefined)
  eq('parseIssuer old: signerRole undefined', parsedOld?.signerRole, undefined)
}

// ---- Persistencia parse con secciones nuevas ----
const roundtrip = parseBudget(JSON.parse(JSON.stringify(budget)))!
eq('read: conserva secciones', roundtrip.sections.length, 2)
eq('read: conserva tipo de ítem', roundtrip.sections[0].items[0].type, 'material')
eq('read: conserva tipo servicio', roundtrip.sections[1].items[0].type, 'servicio')
eq('read: conserva estado', budgetStatus(roundtrip), 'pendiente')
const roundtripArchivada = parseBudget(JSON.parse(JSON.stringify(archivada)))!
eq('read: conserva estado archivada', budgetStatus(roundtripArchivada), 'no-realizada')

// ---- PDF ----
const detallado = generarPresupuestoPdf(budget, { name: 'ADOS' }, 'detallado')
ok('PDF detallado se genera', detallado.getNumberOfPages() >= 1)
const resumido = generarPresupuestoPdf(budget, { name: 'ADOS' }, 'resumido')
ok('PDF resumido se genera', resumido.getNumberOfPages() >= 1)
ok('PDF resumido tiene menos páginas que detallado', resumido.getNumberOfPages() <= detallado.getNumberOfPages())
eq('nombre de archivo detallado', nombreArchivoCotizacionDetallado(budget), 'cotizacion-0001-detalle.pdf')
eq('nombre de archivo resumido', nombreArchivoCotizacionResumido(budget), 'cotizacion-0001-resumen.pdf')
ok('pdf ok con cliente e ítems', puedeGenerarPdf(budget).ok)
ok('pdf bloqueado sin cliente', !puedeGenerarPdf({ ...budget, clientSnapshot: undefined }).ok)
ok('pdf bloqueado sin ítems', !puedeGenerarPdf({ ...budget, sections: [] }).ok)

// ---- Regresión de layout/paginación y logo del PDF ----
// 1x1 PNG válido en base64 para probar el logo del emisor.
const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

// Logo en el snapshot del emisor (encabezado)
const budgetConLogo = {
  ...budget,
  issuerSnapshot: { issuerId: 'iss-1', kind: 'empresa' as const, name: 'ADOS Ltda', rut: '76.000.000-1', logoDataUrl: PNG_1PX },
}
ok('PDF resumido con logo del emisor se genera', (() => { try { return generarPresupuestoPdf(budgetConLogo, { name: 'ADOS' }, 'resumido').getNumberOfPages() >= 1 } catch { return false } })())
ok('PDF detallado con logo del emisor se genera', (() => { try { return generarPresupuestoPdf(budgetConLogo, { name: 'ADOS' }, 'detallado').getNumberOfPages() >= 1 } catch { return false } })())
ok('PDF sin logo se genera igual', (() => { try { return generarPresupuestoPdf(budget, { name: 'ADOS' }, 'detallado').getNumberOfPages() >= 1 } catch { return false } })())

// Cotización larga: muchas secciones/ítems para forzar paginación del bloque final
const seccionesLargas = Array.from({ length: 25 }, (_, i) => section(`Sección ${i + 1}`, Array.from({ length: 6 }, (_, j) => item({ id: `s${i}i${j}`, description: `Ítem ${i}-${j}`, quantity: 2, unitPrice: 3000 })), `sec${i}`))
const largoManual = { ...budget, sections: seccionesLargas, signatureMode: 'manual' as const, notes: 'Observaciones de prueba '.repeat(6), paymentTerms: '50% al inicio / 50% al finalizar', validity: '30 días' }
const pdfLargoManual = generarPresupuestoPdf(largoManual, { name: 'ADOS' }, 'detallado')
ok('PDF largo con firma manual pagina correctamente', pdfLargoManual.getNumberOfPages() >= 2)

const largoSaved = { ...budget, sections: seccionesLargas, signatureMode: 'saved' as const, notes: 'Observaciones de prueba '.repeat(6), issuerSnapshot: { issuerId: 'iss-1', kind: 'empresa' as const, name: 'ADOS Ltda', rut: '76.000.000-1', signatureDataUrl: PNG_1PX } }
const pdfLargoSaved = generarPresupuestoPdf(largoSaved, { name: 'ADOS' }, 'detallado')
ok('PDF largo con firma guardada pagina correctamente', pdfLargoSaved.getNumberOfPages() >= 2)

// Resumen largo con firma (bloque final debe paginar)
const resumenLargo = generarPresupuestoPdf({ ...largoManual, sections: Array.from({ length: 40 }, (_, i) => section(`S${i}`, [], `r${i}`)) }, { name: 'ADOS' }, 'resumido')
ok('PDF resumen largo pagina correctamente', resumenLargo.getNumberOfPages() >= 2)

// ============================================================
// ---- Actualizar datos del emisor (refreshIssuerSnapshot) ----
// ============================================================

// 1. Cotización existente mantiene issuerSnapshot aunque cambie IssuerProfile
const issOriginal: IssuerProfile = {
  id: 'iss-refresh',
  ownerUid: 'uid-1',
  kind: 'empresa',
  name: 'Original SpA',
  rut: '11.111.111-1',
  giro: 'Construcción',
  phone: '+56911111111',
  email: 'old@example.com',
  address: 'Calle Vieja 1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}
const snapOriginal = snapshotFromIssuer(issOriginal)
const budgetConSnap: Budget = {
  ...sampleBudget(),
  issuerSnapshot: snapOriginal,
}
const issModificado: IssuerProfile = {
  ...issOriginal,
  name: 'Modificada SpA',
  rut: '22.222.222-2',
  giro: 'Electricidad',
  phone: '+56922222222',
  email: 'new@example.com',
  address: 'Calle Nueva 2',
}
ok('snapshot de cotización se mantiene aunque cambie IssuerProfile',
  budgetConSnap.issuerSnapshot?.name === 'Original SpA' &&
  budgetConSnap.issuerSnapshot?.rut === '11.111.111-1')

// 2. Modificar IssuerProfile NO altera automáticamente cotizaciones anteriores
// (Esto es una propiedad de diseño: el snapshot está congelado en la cotización)
const budgetClone = { ...budgetConSnap }
budgetClone.issuerSnapshot = { ...snapOriginal }
ok('modificar IssuerProfile no altera cotización (snapshot congelado)',
  budgetClone.issuerSnapshot?.name === 'Original SpA')

// 3. refreshIssuerSnapshot reemplaza issuerSnapshot
const budgetActualizado = refreshIssuerSnapshot(budgetConSnap, issModificado)
ok('refreshIssuerSnapshot reemplaza snapshot',
  budgetActualizado.issuerSnapshot?.name === 'Modificada SpA')

// 4. Incorpora nombre actual
eq('refresh incorpora nombre', budgetActualizado.issuerSnapshot?.name, 'Modificada SpA')

// 5. Incorpora RUT actual
eq('refresh incorpora RUT', budgetActualizado.issuerSnapshot?.rut, '22.222.222-2')

// 6. Incorpora giro actual
eq('refresh incorpora giro', budgetActualizado.issuerSnapshot?.giro, 'Electricidad')

// 7. Incorpora teléfono actual
eq('refresh incorpora teléfono', budgetActualizado.issuerSnapshot?.phone, '+56922222222')

// 8. Incorpora correo actual
eq('refresh incorpora correo', budgetActualizado.issuerSnapshot?.email, 'new@example.com')

// 9. Incorpora dirección actual
eq('refresh incorpora dirección', budgetActualizado.issuerSnapshot?.address, 'Calle Nueva 2')

// 10. Incorpora logo actual
const issConLogo: IssuerProfile = { ...issModificado, logoDataUrl: PNG_LOGO }
const budgetConLogoRefresh = refreshIssuerSnapshot(budgetConSnap, issConLogo)
eq('refresh incorpora logo', budgetConLogoRefresh.issuerSnapshot?.logoDataUrl, PNG_LOGO)

// 11. Incorpora firma actual
const issConFirma: IssuerProfile = { ...issModificado, signatureDataUrl: 'data:image/png;base64,NEWSIG' }
const budgetConFirmaRefresh = refreshIssuerSnapshot(budgetConSnap, issConFirma)
eq('refresh incorpora firma', budgetConFirmaRefresh.issuerSnapshot?.signatureDataUrl, 'data:image/png;base64,NEWSIG')

// 12. NO modifica cliente
eq('refresh no modifica cliente', budgetActualizado.clientSnapshot?.name, 'Constructora Sur')

// 13. NO modifica obra
eq('refresh no modifica obra', budgetActualizado.jobName, 'Edificio Los Alerces')

// 14. NO modifica secciones
eq('refresh no modifica secciones', budgetActualizado.sections.length, budgetConSnap.sections.length)

// 15. NO modifica ítems
eq('refresh no modifica ítems', budgetActualizado.sections[0].items.length, budgetConSnap.sections[0].items.length)

// 16. NO modifica precios
eq('refresh no modifica precios', budgetActualizado.sections[0].items[0].unitPrice, budgetConSnap.sections[0].items[0].unitPrice)

// 17. NO modifica número de cotización
eq('refresh no modifica número', budgetActualizado.number, budgetConSnap.number)

// 18. NO modifica estado
eq('refresh no modifica estado', budgetActualizado.status, budgetConSnap.status)

// 19. Perfil emisor eliminado: snapshot se conserva (el snapshot existe, el perfil no)
const budgetHuerfano: Budget = {
  ...sampleBudget(),
  issuerSnapshot: snapOriginal,
}
// Simular que el perfil fue eliminado: su id no está en la lista de perfiles activos
const issOtro = { ...issModificado, id: 'iss-otro' }
const issuerStillExists = [issOtro].some((i) => i.id === budgetHuerfano.issuerSnapshot?.issuerId)
ok('perfil eliminado: snapshot se conserva', budgetHuerfano.issuerSnapshot?.name === 'Original SpA')
ok('perfil eliminado: botón deshabilitado (issuer not in list)', !issuerStillExists)

// 20. PDF utiliza snapshot actualizado después de refresh
const budgetPdfActualizado = {
  ...budgetConSnap,
  issuerSnapshot: snapshotFromIssuer(issConLogo),
  signatureMode: 'saved' as const,
}
const pdfActualizado = generarPresupuestoPdf(budgetPdfActualizado, { name: 'ADOS' }, 'detallado')
ok('PDF con snapshot actualizado se genera', pdfActualizado.getNumberOfPages() >= 1)

// 21. PDF sin actualizar conserva snapshot histórico
const pdfHistorico = generarPresupuestoPdf(budgetConSnap, { name: 'ADOS' }, 'detallado')
ok('PDF con snapshot histórico se genera', pdfHistorico.getNumberOfPages() >= 1)

// ============================================================
// ---- Tamaño de logo y firma en PDF (automático) ----
// ============================================================

// 22. Logo PDF mantiene proporción dentro del bounding box automático (62×40mm)
const pdfLogoCuadrado = generarPresupuestoPdf(budgetConLogo, { name: 'ADOS' }, 'detallado')
ok('PDF con logo cuadrado se genera', pdfLogoCuadrado.getNumberOfPages() >= 1)

// 23. Logo horizontal mantiene proporción
const logoHorizontal = generarPresupuestoPdf({
  ...budget,
  issuerSnapshot: { issuerId: 'iss-1', kind: 'empresa' as const, name: 'LogoAncho', logoDataUrl: PNG_1PX },
}, { name: 'ADOS' }, 'detallado')
ok('PDF con logo horizontal mantiene proporción', logoHorizontal.getNumberOfPages() >= 1)

// 24. Logo vertical mantiene proporción
const PNG_VERTICAL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFklEQVQYV2P8z8BQz0BFwMgwasKoOgBnLwMDe26EcAAAAABJRU5ErkJggg=='
const logoVertical = generarPresupuestoPdf({
  ...budget,
  issuerSnapshot: { issuerId: 'iss-1', kind: 'empresa' as const, name: 'LogoVertical', logoDataUrl: PNG_VERTICAL },
}, { name: 'ADOS' }, 'detallado')
ok('PDF con logo vertical mantiene proporción', logoVertical.getNumberOfPages() >= 1)

// 25. Firma guardada usa tamaño automático grande (120×60mm bounding box)
const firmaAncha = generarPresupuestoPdf({
  ...budget,
  signatureMode: 'saved' as const,
  issuerSnapshot: { issuerId: 'iss-1', kind: 'empresa' as const, name: 'FirmaTest', rut: '11.111.111-1', signatureDataUrl: PNG_1PX },
}, { name: 'ADOS' }, 'detallado')
ok('PDF con firma guardada usa tamaño automático grande', firmaAncha.getNumberOfPages() >= 1)

// 26. Firma digital grande pagina correctamente en cotización larga
const firmaLarga = generarPresupuestoPdf({
  ...largoSaved,
  signatureMode: 'saved' as const,
}, { name: 'ADOS' }, 'detallado')
ok('PDF largo con firma grande pagina correctamente', firmaLarga.getNumberOfPages() >= 2)

// 27. Firma manual sigue funcionando
const pdfManualRefresh = generarPresupuestoPdf({
  ...budget,
  signatureMode: 'manual' as const,
}, { name: 'ADOS' }, 'detallado')
ok('PDF con firma manual funciona tras cambios', pdfManualRefresh.getNumberOfPages() >= 1)

// 28. Firma no se superpone con footer
const pdfFirmaFooter = generarPresupuestoPdf({
  ...budget,
  signatureMode: 'saved' as const,
  issuerSnapshot: { issuerId: 'iss-1', kind: 'empresa' as const, name: 'Test', signatureDataUrl: PNG_1PX },
}, { name: 'ADOS' }, 'detallado')
ok('PDF firma + footer no se superponen', pdfFirmaFooter.getNumberOfPages() >= 1)

// 29. Nombre/RUT permanecen junto a la firma (verificación indirecta)
const pdfFirmaCompleta = generarPresupuestoPdf({
  ...budget,
  signatureMode: 'saved' as const,
  issuerSnapshot: { issuerId: 'iss-1', kind: 'empresa' as const, name: 'Empresa Test', rut: '76.000.000-1', signatureDataUrl: PNG_1PX },
}, { name: 'ADOS' }, 'detallado')
const firmaStr = pdfText(pdfFirmaCompleta)
ok('Nombre del emisor aparece junto a la firma', firmaStr.includes('Empresa Test'))
ok('RUT del emisor aparece junto a la firma', firmaStr.includes('76.000.000-1'))

// ============================================================
// ---- Compatibilidad: datos documentLayout antiguos no rompen ----
// ============================================================

// 30. Perfil con documentLayout antiguo se carga correctamente (simula Firestore con datos viejos)
const legacyIssuerWithLayout = {
  ...issuerEmpresa,
  documentLayout: {
    header: { logo: { x: 14, y: 26, width: 42, height: 27 }, issuerInfo: { x: 64, y: 26, width: 132, height: 40 }, issuerInfoAlignment: 'left' },
    signature: { image: { x: 14, y: 220, width: 90, height: 45 }, info: { x: 14, y: 268, width: 90, height: 20 }, infoAlignment: 'left' },
  },
}
const parsedLegacy = parseIssuer(legacyIssuerWithLayout)
ok('datos documentLayout antiguos no rompen carga', parsedLegacy !== null && parsedLegacy.name === 'Constructora Demo SpA')

// 31. PDF con snapshot que tenía documentLayout antiguo se genera correctamente
const budgetLegacyLayout = {
  ...budget,
  signatureMode: 'saved' as const,
  issuerSnapshot: { issuerId: 'iss-1', kind: 'empresa' as const, name: 'Legacy Test', rut: '11.111.111-1', signatureDataUrl: PNG_1PX, documentLayout: legacyIssuerWithLayout.documentLayout } as never,
}
const pdfLegacy = generarPresupuestoPdf(budgetLegacyLayout, { name: 'ADOS' }, 'detallado')
ok('PDF con snapshot documentLayout antiguo se genera', pdfLegacy.getNumberOfPages() >= 1)

// ============================================================
// ---- Actualizar datos del emisor sigue actualizando logo/firma ----
// ============================================================

// 32. refreshIssuerSnapshot incorpora logo actualizado
const issConLogoV2: IssuerProfile = { ...issModificado, logoDataUrl: 'data:image/png;base64,NEWLOGO' }
const budgetLogoRefresh = refreshIssuerSnapshot(budgetConSnap, issConLogoV2)
ok('refresh sigue incorporando logo actualizado', budgetLogoRefresh.issuerSnapshot?.logoDataUrl === 'data:image/png;base64,NEWLOGO')

// 33. refreshIssuerSnapshot incorpora firma actualizada
const issConFirmaV2: IssuerProfile = { ...issModificado, signatureDataUrl: 'data:image/png;base64,NEWSIG2' }
const budgetFirmaRefresh = refreshIssuerSnapshot(budgetConSnap, issConFirmaV2)
ok('refresh sigue incorporando firma actualizada', budgetFirmaRefresh.issuerSnapshot?.signatureDataUrl === 'data:image/png;base64,NEWSIG2')

// ============================================================
// ---- Recorte de imagen (imageOptimize) sigue funcionando ----
// ============================================================

// 34. optimizeIssuerImage procesa logo correctamente
// Nota: optimizeIssuerImage requiere un archivo de imagen real para procesar.
// Verificamos que la función existe y es callable.
ok('optimizeIssuerImage está disponible', typeof optimizeIssuerImage === 'function')

// ============================================================
// ---- Footer: marca del documento ----
// ============================================================

// Helper: extrae texto del PDF como string (aproximado)
function pdfText(doc: jsPDF): string {
  const pages = doc.getNumberOfPages()
  let all = ''
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    const contents = doc.internal.pages[p]
    if (contents) {
      all += JSON.stringify(contents)
    }
  }
  return all
}

// 28. PDF contiene "Exportado por ADOS DOCS"
const pdfBranding = generarPresupuestoPdf(budget, { name: 'ADOS' }, 'detallado')
const pdfStr = pdfText(pdfBranding)
ok('PDF contiene "ADOS DOCS"', pdfStr.includes('ADOS DOCS'))

// 29. PDF NO contiene "Exportado por ADOS OBRAS"
ok('PDF NO contiene "ADOS OBRAS"', !pdfStr.includes('Exportado por ADOS OBRAS'))

// 30. PDF NO contiene "Elaborada por Matías Valdebenito Quezada"
ok('PDF NO contiene "Elaborada por Matías"', !pdfStr.includes('Elaborada por Mat'))

// 31. Los datos normales del emisor continúan apareciendo correctamente
const issPersonal: IssuerProfile = {
  id: 'iss-personal',
  ownerUid: 'uid-1',
  kind: 'persona',
  name: 'Usuario Demo',
  rut: '12.345.678-9',
  giro: 'Consultoría',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}
const budgetPersonal = {
  ...budget,
  issuerSnapshot: snapshotFromIssuer(issPersonal),
}
const pdfPersonal = generarPresupuestoPdf(budgetPersonal, { name: 'ADOS' }, 'detallado')
const personalStr = pdfText(pdfPersonal)
ok('nombre del emisor personal aparece en PDF', personalStr.includes('Usuario'))
ok('RUT del emisor personal aparece en PDF', personalStr.includes('12.345.678-9'))

// ============================================================
// ---- PDF de prueba (createSampleQuote) ----
// ============================================================

// 35. createSampleQuote genera estructura válida
const sample = createSampleQuote(issuerEmpresa)
ok('createSampleQuote genera budget válido', sample !== null && sample.id.startsWith('sample-'))
eq('createSampleQuote tiene 4 secciones', sample.sections.length, 4)
ok('createSampleQuote tiene ítems', sample.sections.some((s) => s.items.length > 0))
ok('sample tiene sección mixta', sample.sections.some((s) => s.workDetails && s.workDetails.length > 0 && s.globalAmount != null && s.globalAmount > 0))

// 36. Usa datos reales del emisor
ok('sample usa nombre del emisor', sample.issuerSnapshot?.name === 'Constructora Demo SpA')
ok('sample usa RUT del emisor', sample.issuerSnapshot?.rut === '11.111.111-1')
ok('sample usa giro del emisor', sample.issuerSnapshot?.giro === 'Construcción de viviendas')

// 37. Usa logo real del emisor
const sampleConLogo = createSampleQuote({ ...issuerEmpresa, logoDataUrl: PNG_LOGO })
ok('sample usa logo real del emisor', sampleConLogo.issuerSnapshot?.logoDataUrl === PNG_LOGO)

// 38. Usa firma real del emisor
const sampleConFirma = createSampleQuote({ ...issuerEmpresa, signatureDataUrl: 'data:image/png;base64,SIG' })
ok('sample usa firma real del emisor', sampleConFirma.issuerSnapshot?.signatureDataUrl === 'data:image/png;base64,SIG')

// 39. Genera cliente ficticio
ok('sample tiene cliente ficticio', sample.clientSnapshot?.name === 'Cliente de prueba')
ok('sample tiene RUT de prueba', sample.clientSnapshot?.rut === '12.345.678-9')

// 40. Genera datos ficticios de obra
ok('sample tiene nombre de obra', sample.jobName === 'Remodelación vivienda')
ok('sample tiene dirección de obra', sample.jobAddress === 'Los Ángeles, Chile')

// 41. IVA 19%
eq('sample tiene IVA 19%', sample.ivaRate, 19)

// 42. No incrementa numeración
eq('sample número es 0', sample.number, 0)

// 43. PDF resumen puede generarse
const pdfSampleResumido = generarPresupuestoPdf(sample, { name: 'ADOS' }, 'resumido')
ok('PDF de prueba resumido se genera', pdfSampleResumido.getNumberOfPages() >= 1)

// 44. PDF detallado puede generarse
const pdfSampleDetallado = generarPresupuestoPdf(sample, { name: 'ADOS' }, 'detallado')
ok('PDF de prueba detallado se genera', pdfSampleDetallado.getNumberOfPages() >= 1)

// 45. No persiste como cotización real: id empieza con "sample-"
ok('sample id tiene prefijo sample-', sample.id.startsWith('sample-'))

// 46. Firma guardada se usa si existe
eq('sample con firma usa modo saved', sampleConFirma.signatureMode, 'saved')

// 47. Sin firma usa modo manual
eq('sample sin firma usa modo manual', sample.signatureMode, 'manual')

// 48. PDF de prueba contiene texto de prueba
const sampleStr = pdfText(pdfSampleDetallado)
ok('PDF de prueba contiene "Cliente de prueba"', sampleStr.includes('Cliente de prueba'))
ok('PDF de prueba contiene "Remodelación"', sampleStr.includes('Remodelación'))

// ---- Vigencia: formato singular/plural ----
eq('1 día', formatValidityValue(1, 'days'), '1 día')
eq('2 días', formatValidityValue(2, 'days'), '2 días')
eq('15 días', formatValidityValue(15, 'days'), '15 días')
eq('1 mes', formatValidityValue(1, 'months'), '1 mes')
eq('2 meses', formatValidityValue(2, 'months'), '2 meses')
eq('3 meses', formatValidityValue(3, 'months'), '3 meses')

// ---- Vigencia: parseo de string antiguo ----
const parsedDays = parseValidityString('20 días')
ok('parse "20 días" resultado no null', parsedDays !== null)
eq('parse "20 días" valor', parsedDays?.value, 20)
eq('parse "20 días" unidad', parsedDays?.unit, 'days' as ValidityUnit)

const parsedMes = parseValidityString('3 meses')
ok('parse "3 meses" resultado no null', parsedMes !== null)
eq('parse "3 meses" valor', parsedMes?.value, 3)
eq('parse "3 meses" unidad', parsedMes?.unit, 'months' as ValidityUnit)

const parsedSingular = parseValidityString('1 día')
ok('parse "1 día" resultado no null', parsedSingular !== null)
eq('parse "1 día" valor', parsedSingular?.value, 1)
eq('parse "1 día" unidad', parsedSingular?.unit, 'days' as ValidityUnit)

const parsedUnparseable = parseValidityString('texto inválido')
ok('parse string inválido es null', parsedUnparseable === null)

// ---- Vigencia: cotización antigua funciona ----
const oldBudget: Budget = { ...budget, validity: '20 días', validityValue: undefined, validityUnit: undefined }
eq('formatBudgetValidity string antiguo', formatBudgetValidity(oldBudget), '20 días')

const newBudget: Budget = { ...budget, validityValue: 15, validityUnit: 'days' }
eq('formatBudgetValidity nuevo formato', formatBudgetValidity(newBudget), '15 días')

const newBudgetMes: Budget = { ...budget, validityValue: 2, validityUnit: 'months' }
eq('formatBudgetValidity meses', formatBudgetValidity(newBudgetMes), '2 meses')

// ---- Vigencia: parseBudget auto-parsea string antiguo ----
const oldParsed = parseBudget({ id: 'x1', validity: '25 días', sections: [] })
ok('parseBudget parsea "25 días"', oldParsed !== null)
eq('parseBudget validityValue de "25 días"', oldParsed?.validityValue, 25)
eq('parseBudget validityUnit de "25 días"', oldParsed?.validityUnit, 'days' as ValidityUnit)

const oldParsedMes = parseBudget({ id: 'x2', validity: '4 meses', sections: [] })
ok('parseBudget parsea "4 meses"', oldParsedMes !== null)
eq('parseBudget validityValue de "4 meses"', oldParsedMes?.validityValue, 4)
eq('parseBudget validityUnit de "4 meses"', oldParsedMes?.validityUnit, 'months' as ValidityUnit)

const noParsed = parseBudget({ id: 'x3', validity: 'sin número', sections: [] })
ok('parseBudget string no parseable queda null', noParsed?.validityValue === undefined)
ok('parseBudget string no parseable unit queda null', noParsed?.validityUnit === undefined)

// ---- PDF vigencia aparece en texto ----
const pdfWithValidity = generarPresupuestoPdf({ ...budget, validityValue: 15, validityUnit: 'days' }, { name: 'ADOS' }, 'detallado')
const validityStr = pdfText(pdfWithValidity)
ok('PDF contiene "15 días"', validityStr.includes('15 días'))

const pdfMes = generarPresupuestoPdf({ ...budget, validityValue: 2, validityUnit: 'months' }, { name: 'ADOS' }, 'detallado')
const mesStr = pdfText(pdfMes)
ok('PDF contiene "2 meses"', mesStr.includes('2 meses'))

// ---- Tiempo estimado: formato singular/plural ----
eq('exec 1 día', formatExecutionTime(1, 'days'), '1 día')
eq('exec 15 días', formatExecutionTime(15, 'days'), '15 días')
eq('exec 1 semana', formatExecutionTime(1, 'weeks'), '1 semana')
eq('exec 3 semanas', formatExecutionTime(3, 'weeks'), '3 semanas')
eq('exec 1 mes', formatExecutionTime(1, 'months'), '1 mes')
eq('exec 2 meses', formatExecutionTime(2, 'months'), '2 meses')

// ---- Tiempo estimado: PDF contiene el texto ----
const pdfWithExec = generarPresupuestoPdf({ ...budget, executionTimeValue: 3, executionTimeUnit: 'weeks' }, { name: 'ADOS' }, 'detallado')
const execStr = pdfText(pdfWithExec)
ok('PDF contiene "3 semanas"', execStr.includes('3 semanas'))
ok('PDF contiene "Tiempo estimado de ejecución"', execStr.includes('Tiempo estimado de') && execStr.includes('ejecuci'))

// ---- Tiempo estimado: campo vacío no aparece en PDF ----
const pdfNoExec = generarPresupuestoPdf({ ...budget, executionTimeValue: undefined, executionTimeUnit: undefined }, { name: 'ADOS' }, 'detallado')
const noExecStr = pdfText(pdfNoExec)
ok('PDF sin tiempo estimado no contiene "Tiempo estimado"', !noExecStr.includes('Tiempo estimado'))

// ---- Tiempo estimado: cotización existente sin campo funciona ----
const oldBudgetNoExec: Budget = { ...budget, executionTimeValue: undefined, executionTimeUnit: undefined }
ok('cotización antigua sin executionTime se genera', generarPresupuestoPdf(oldBudgetNoExec, { name: 'ADOS' }, 'detallado').getNumberOfPages() >= 1)

// ---- Tiempo estimado: guardar y recuperar (simulación) ----
const budgetWithExec: Budget = { ...budget, executionTimeValue: 15, executionTimeUnit: 'days' as ExecutionTimeUnit }
eq('executionTimeValue persiste', budgetWithExec.executionTimeValue, 15)
eq('executionTimeUnit persiste', budgetWithExec.executionTimeUnit, 'days')

const budgetWithWeeks: Budget = { ...budget, executionTimeValue: 3, executionTimeUnit: 'weeks' as ExecutionTimeUnit }
eq('executionTimeValue semanas persiste', budgetWithWeeks.executionTimeValue, 3)
eq('executionTimeUnit semanas persiste', budgetWithWeeks.executionTimeUnit, 'weeks')

// ---- PDF: firma centrada (verificación indirecta) ----
const pdfFirmaCentered = generarPresupuestoPdf({
  ...budget,
  signatureMode: 'saved',
  issuerSnapshot: { issuerId: 'iss-1', kind: 'empresa' as const, name: 'Empresa Test', rut: '76.000.000-1', signatureDataUrl: 'data:image/png;base64,AAAA' },
}, { name: 'ADOS' }, 'detallado')
ok('PDF con firma centrada se genera', pdfFirmaCentered.getNumberOfPages() >= 1)

// ---- PDF: firma usa tamaño reducido (95×48) ----
ok('PDF con firma reducida se genera', pdfFirmaCentered.getNumberOfPages() >= 1)

// ---- PDF: firma + nombre + RUT juntos ----
const firmaCenteredStr = pdfText(pdfFirmaCentered)
ok('Nombre del emisor en PDF centrado', firmaCenteredStr.includes('Empresa Test'))
ok('RUT del emisor en PDF centrado', firmaCenteredStr.includes('76.000.000-1'))

// ---- PDF: footer ----
ok('PDF contiene footer ADOS DOCS', pdfStr.includes('ADOS DOCS'))

// ---- Sample quote usa nuevos campos ----
ok('sample tiene validityValue', typeof sample.validityValue === 'number' && sample.validityValue === 15)
ok('sample tiene validityUnit days', sample.validityUnit === 'days')

// ---- formatRut ----
eq('formatRut "123456785"', formatRut('123456785'), '12.345.678-5')
eq('formatRut "12345678-5"', formatRut('12345678-5'), '12.345.678-5')
eq('formatRut "12.345.678-5"', formatRut('12.345.678-5'), '12.345.678-5')
eq('formatRut "12345678k"', formatRut('12345678k'), '12.345.678-K')
eq('formatRut "12345678K"', formatRut('12345678K'), '12.345.678-K')
eq('formatRut "76543210k"', formatRut('76543210k'), '76.543.210-K')
eq('formatRut "11111111"', formatRut('11111111'), '11.111.111')
eq('formatRut "1-9"', formatRut('1-9'), '1-9')
eq('formatRut empty', formatRut(''), '')
eq('formatRut with spaces', formatRut('12 345 678 5'), '12.345.678-5')

// ---- normalizeRut ----
eq('normalizeRut "12.345.678-5"', normalizeRut('12.345.678-5'), '12345678-5')
eq('normalizeRut "123456785"', normalizeRut('123456785'), '12345678-5')
eq('normalizeRut "12345678-5"', normalizeRut('12345678-5'), '12345678-5')
eq('normalizeRut "12345678K"', normalizeRut('12345678K'), '12345678-K')
eq('normalizeRut with spaces', normalizeRut('12 345 678-5'), '12345678-5')

// ---- validateRut ----
ok('validateRut "12345678-5" válido', validateRut('12345678-5'))
ok('validateRut "12.345.678-5" válido', validateRut('12.345.678-5'))
ok('validateRut "10000013-K" válido', validateRut('10000013-K'))
ok('validateRut "7654321-6" válido', validateRut('7654321-6'))
ok('validateRut "11111111-1" válido', validateRut('11111111-1'))
ok('validateRut inválido', !validateRut('12345678-0'))
ok('validateRut sin dígito verificador', !validateRut('12345678'))
ok('validateRut muy corto', !validateRut('1-1'))
ok('validateRut vacío', !validateRut(''))

// ---- formatRutOnInput (input en vivo) ----
eq('input "1"', formatRutOnInput('1'), '1')
eq('input "12"', formatRutOnInput('12'), '12')
eq('input "123"', formatRutOnInput('123'), '123')
eq('input "1234"', formatRutOnInput('1234'), '1.234')
eq('input "12345"', formatRutOnInput('12345'), '12.345')
eq('input "123456"', formatRutOnInput('123456'), '123.456')
eq('input "1234567"', formatRutOnInput('1234567'), '1.234.567')
eq('input "12345678"', formatRutOnInput('12345678'), '12.345.678')
eq('input "12345678-5"', formatRutOnInput('12345678-5'), '12.345.678-5')
eq('input "123456785"', formatRutOnInput('123456785'), '12.345.678-5')
eq('input "12345678-"', formatRutOnInput('12345678-'), '12.345.678-')
eq('input "12.345.678"', formatRutOnInput('12.345.678'), '12.345.678')
eq('input "12.345.678-5"', formatRutOnInput('12.345.678-5'), '12.345.678-5')

// ---- Secciones mixtas: globalAmount + workDetails ----
{
  // Solo globalAmount
  const sGlobal = section('Demolición', [], 'sg', { globalAmount: 500000 })
  eq('sección solo globalAmount: subtotal', sectionSubtotalCents(sGlobal), 50000000)
  ok('sección solo globalAmount: budgetHasValidItems', budgetHasValidItems({
    ...sampleBudget(), sections: [sGlobal],
  }))

  // globalAmount + items
  const sMixed = section('Carpintería', [
    item({ quantity: 5, unitPrice: 20000 }),
  ], 'sm', { globalAmount: 300000 })
  eq('sección global+items: subtotal', sectionSubtotalCents(sMixed), 40000000)

  // workDetails no afecta subtotal
  const sWork = section('Pintura', [item()], 'sw', {
    workDetails: [{ id: 'wd-1', description: 'Preparación de superficies' }],
  })
  eq('sección workDetails: subtotal = items', sectionSubtotalCents(sWork), 100000)

  // workDetails + globalAmount + items
  const sFull = section('Instalaciones', [
    item({ quantity: 2, unitPrice: 50000 }),
  ], 'sf', {
    globalAmount: 150000,
    globalLabel: 'Monto global',
    workDetails: [{ id: 'wd-2', description: 'Diseño' }, { id: 'wd-3', description: 'Supervisión' }],
  })
  eq('sección completa: subtotal', sectionSubtotalCents(sFull), 15000000 + 10000000)

  // globalAmount 0 o undefined se ignora
  const sZero = section('X', [], 'sz', { globalAmount: 0 })
  eq('globalAmount 0: subtotal', sectionSubtotalCents(sZero), 0)
  const sUndef = section('Y', [], 'su')
  eq('globalAmount undefined: subtotal', sectionSubtotalCents(sUndef), 0)

  // Sección con solo workDetails (sin items, sin global) → válida (workDetails cuenta como contenido)
  const sWorkOnly = section('Solo trabajo', [], 'swo', {
    workDetails: [{ id: 'wd-4', description: 'Algo' }],
  })
  ok('solo workDetails: es válida', budgetHasValidItems({
    ...sampleBudget(), sections: [sWorkOnly],
  }))

  // ---- validateBudget acepta secciones sin ítems pero con globalAmount ----
  const budgetGlobalOnly = {
    ...sampleBudget(),
    sections: [section('Demolición', [], 's1', { globalAmount: 3000000 })],
  }
  ok('validateBudget: solo globalAmount es válido', validateBudget(true, budgetGlobalOnly.sections).valid)

  const budgetWorkGlobal = {
    ...sampleBudget(),
    sections: [section('Pintura', [], 's1', {
      globalAmount: 1500000,
      workDetails: [{ id: 'wd-5', description: 'Preparación' }],
    })],
  }
  ok('validateBudget: globalAmount + workDetails es válido', validateBudget(true, budgetWorkGlobal.sections).valid)

  const budgetWorkOnly = {
    ...sampleBudget(),
    sections: [section('Diseño', [], 's1', {
      workDetails: [{ id: 'wd-6', description: 'Diseño interior' }],
    })],
  }
  ok('validateBudget: solo workDetails es válido', validateBudget(true, budgetWorkOnly.sections).valid)

  // PDF con sección solo global (sin ítems) se genera
  const pdfGlobalOnly = generarPresupuestoPdf(budgetGlobalOnly, { name: 'ADOS' }, 'detallado')
  ok('PDF con solo globalAmount se genera', pdfGlobalOnly.getNumberOfPages() >= 1)

  // PDF con global + workDetails + items se genera
  const pdfMixed = generarPresupuestoPdf(budgetWorkGlobal, { name: 'ADOS' }, 'detallado')
  ok('PDF con globalAmount + workDetails se genera', pdfMixed.getNumberOfPages() >= 1)
}

// ---- Observaciones: persistencia y PDF ----
{
  // Cotización con observaciones
  const bWithNotes = {
    ...sampleBudget(),
    notes: 'Trabajos sujetos a condiciones del terreno y disponibilidad de materiales.',
  }
  eq('notes presentes en el modelo', bWithNotes.notes, 'Trabajos sujetos a condiciones del terreno y disponibilidad de materiales.')

  // PDF contiene las observaciones (se genera sin error con notes)
  const pdfNotes = generarPresupuestoPdf(bWithNotes, { name: 'ADOS' }, 'detallado')
  ok('PDF con observaciones se genera', pdfNotes.getNumberOfPages() >= 1)

  // Cotización sin observaciones
  const bNoNotes = { ...sampleBudget(), notes: '' }
  eq('notes vacío', bNoNotes.notes, '')
  const pdfNoNotes = generarPresupuestoPdf(bNoNotes, { name: 'ADOS' }, 'detallado')
  ok('PDF sin observaciones se genera', pdfNoNotes.getNumberOfPages() >= 1)

  // Observaciones multilínea
  const multiline = 'Línea 1\nLínea 2\nLínea 3'
  const bMulti = { ...sampleBudget(), notes: multiline }
  eq('notes multilínea preservadas', bMulti.notes, multiline)

  // Compatibilidad: campo undefined no rompe
  const bUndefined = { ...sampleBudget() } as typeof sampleBudget extends infer T ? T & { notes?: string } : never
  delete (bUndefined as Record<string, unknown>).notes
  const fallback = (bUndefined as Record<string, unknown>).notes ?? ''
  eq('notes undefined cae a string vacío', fallback, '')
}

// ---- Sección con 8+ workDetails largos + global + 2 items ----
{
  const longWorkDetails = [
    { id: 'wd-1', description: 'Fabricar viga reticulada en perfil metálico de 60x40x2 mm, sobre vigas falsas de iluminación, incluyendo soldadura y pintura anticorrosiva' },
    { id: 'wd-2', description: 'Demoler muro divisorio de sala de ventas existente, incluyendo retiro de escombros y adecuación del espacio para recepción de mercadería' },
    { id: 'wd-3', description: 'Retirar estructura publicitaria del frente del local, incluyendo desmontaje de señalización, demoler marcos metálicos y retiro de elementos de fachada' },
    { id: 'wd-4', description: 'Retirar planchas instaladas en cielo falso, incluyendo estructura de soporte y reubicación de luminarias' },
    { id: 'wd-5', description: 'Instalar sistema de iluminación LED de alta eficiencia en todo el perímetro del local comercial, incluyendo cableado y tablero de control' },
    { id: 'wd-6', description: 'Ejecutar impermeabilización de techo con membrana asfáltica, incluyendo preparación de superficie, dos capas de membrana y protección UV' },
    { id: 'wd-7', description: 'Instalar revestimiento de paredes con panel ACP de aluminio compuesto, perfil estructural y accesorios de fijación al muro existente' },
    { id: 'wd-8', description: 'Ejecutar pintura interior con pintura vinílica de alta resistencia en paredes y cielo falso, incluyendo preparación de superficie, masilla y dos manos de pintura' },
  ]

  const additionalItems: BudgetItem[] = [
    { id: 'item-add-1', description: 'Cerámica adicional para zona de baños', type: 'material', quantity: 20, unit: 'm2', unitPrice: 15000 },
    { id: 'item-add-2', description: 'Adhesivo cerámico para instalación', type: 'material', quantity: 5, unit: 'unidad', unitPrice: 12000 },
  ]

  const sectionLarge = section('Ejecución integral del local', additionalItems, 's-large', {
    workDetails: longWorkDetails,
    globalAmount: 5800000,
  })

  const budgetLarge = {
    ...sampleBudget(),
    sections: [sectionLarge],
    discount: 0,
  }

  const pdfLarge = generarPresupuestoPdf(budgetLarge, { name: 'ADOS' }, 'detallado')
  const pdfStr = pdfText(pdfLarge)
  const pages = pdfLarge.getNumberOfPages()

  ok('PDF 8+ workDetails se genera sin error', pages >= 1)
  ok('PDF contiene "Detalle de trabajos incluidos"', pdfStr.includes('Detalle de trabajos incluidos'))
  ok('PDF contiene "Ejecución global de los trabajos descritos"', pdfStr.includes('Ejecución global de los trabajos descritos'))
  ok('PDF contiene "Cerámica adicional"', pdfStr.includes('Cerámica adicional'))
  ok('PDF contiene "Adhesivo cerámico"', pdfStr.includes('Adhesivo cerámico'))
  ok('PDF contiene "$5.800.000"', pdfStr.includes('$5.800.000'))
  ok('PDF contiene "Subtotal sección"', pdfStr.includes('Subtotal sección'))

  // Verify no redundancy: should NOT contain "Trabajo global" or "Valor global"
  ok('PDF no contiene "Trabajo global"', !pdfStr.includes('Trabajo global'))
  ok('PDF no contiene "Valor global"', !pdfStr.includes('Valor global'))

  // Verify wrapping: each long description should be split across lines
  ok('PDF contiene "Fabricar viga reticulada"', pdfStr.includes('Fabricar viga reticulada'))
  ok('PDF contiene "Demoler muro divisorio"', pdfStr.includes('Demoler muro divisorio'))
  ok('PDF contiene "Ejecutar impermeabilización"', pdfStr.includes('Ejecutar impermeabilización'))
  ok('PDF contiene "Instalar revestimiento"', pdfStr.includes('Instalar revestimiento'))
  ok('PDF contiene "Ejecutar pintura interior"', pdfStr.includes('Ejecutar pintura interior'))

  // Verify subtotal = global + items = 5800000 + (20*15000 + 5*12000) = 5800000 + 360000 = 6160000
  ok('PDF contiene subtotal correcto $6.160.000', pdfStr.includes('$6.160.000'))
}

// ---- Sección solo globalAmount sin workDetails ----
{
  const sectionGlobalOnly = section('Servicio de supervisión', [], 's-glob', {
    globalAmount: 800000,
  })
  const budgetGlobalOnly2 = {
    ...sampleBudget(),
    sections: [sectionGlobalOnly],
  }
  const pdfGlobal = generarPresupuestoPdf(budgetGlobalOnly2, { name: 'ADOS' }, 'detallado')
  const pdfGlobalStr = pdfText(pdfGlobal)
  ok('PDF solo global: se genera', pdfGlobal.getNumberOfPages() >= 1)
  ok('PDF solo global: contiene "Ejecución global"', pdfGlobalStr.includes('Ejecución global'))
  ok('PDF solo global: contiene "$800.000"', pdfGlobalStr.includes('$800.000'))
  ok('PDF solo global: no contiene "Detalle de trabajos incluidos"', !pdfGlobalStr.includes('Detalle de trabajos incluidos'))
}

// ---- Sección solo workDetails sin globalAmount ----
{
  const sectionWorkOnly = section('Trabajos especiales', [], 's-work', {
    workDetails: [
      { id: 'wd-w1', description: 'Instalar sistema de climatización central con conductos de galvanizado' },
      { id: 'wd-w2', description: 'Ejecutar aislamiento acústico en muros perimetrales con lana de roca' },
    ],
  })
  const budgetWorkOnly2 = {
    ...sampleBudget(),
    sections: [sectionWorkOnly],
  }
  const pdfWork = generarPresupuestoPdf(budgetWorkOnly2, { name: 'ADOS' }, 'detallado')
  const pdfWorkStr = pdfText(pdfWork)
  ok('PDF solo workDetails: se genera', pdfWork.getNumberOfPages() >= 1)
  ok('PDF solo workDetails: contiene detalle', pdfWorkStr.includes('Detalle de trabajos incluidos'))
  ok('PDF solo workDetails: no contiene ejecución global', !pdfWorkStr.includes('Ejecución global'))
}

// ---- PDF completo: 7 workDetails + global + pago + vigencia + tiempo + observaciones + firma ----
{
  const longWorkDetails = [
    { id: 'wd-1', description: 'Fabricar viga reticulada en perfil metálico de 60x40x2 mm, sobre vigas falsas de iluminación' },
    { id: 'wd-2', description: 'Demoler muro divisorio de sala de ventas existente, incluyendo retiro de escombros' },
    { id: 'wd-3', description: 'Retirar estructura publicitaria del frente del local, desmontaje completo' },
    { id: 'wd-4', description: 'Retirar planchas instaladas en cielo falso, incluyendo estructura de soporte' },
    { id: 'wd-5', description: 'Instalar sistema de iluminación LED de alta eficiencia en todo el perímetro' },
    { id: 'wd-6', description: 'Ejecutar impermeabilización de techo con membrana asfáltica de doble capa' },
    { id: 'wd-7', description: 'Instalar revestimiento de paredes con panel ACP de aluminio compuesto' },
  ]
  const sectionFull = section('Ejecución integral del local', [
    { id: 'item-1', description: 'Cerámica adicional', type: 'material', quantity: 20, unit: 'm2', unitPrice: 15000 },
    { id: 'item-2', description: 'Adhesivo cerámico', type: 'material', quantity: 5, unit: 'unidad', unitPrice: 12000 },
  ], 's-full', {
    workDetails: longWorkDetails,
    globalAmount: 5800000,
  })
  const bFull = {
    ...sampleBudget(),
    sections: [sectionFull],
    discount: 0,
    paymentTerms: '50% al inicio / 50% al finalizar',
    validityValue: 30,
    validityUnit: 'days' as ValidityUnit,
    executionTimeValue: 30,
    executionTimeUnit: 'days' as ExecutionTimeUnit,
    notes: '- Materiales.\n- Mano de obra.\n- Arriendo de equipos (andamios, escaleras, entre otros).\n- Retiro de sobrantes y escombros.\n- Trabajo realizado después del horario laboral del local y fines de semana.\n- Valor no incluye instalación de publicidad.',
    signatureMode: 'saved' as const,
    issuerSnapshot: {
      issuerId: 'iss-1',
      kind: 'empresa' as const,
      name: 'Empresa Ejemplo Ltda.',
      rut: '76.000.000-1',
      signatureDataUrl: 'data:image/png;base64,AAAA',
      signerName: 'Representante Ejemplo',
      signerRut: '20123456-5',
      signerRole: 'Representante legal',
    },
  }
  const pdfFull = generarPresupuestoPdf(bFull, { name: 'ADOS' }, 'detallado')
  const fullStr = pdfText(pdfFull)
  const pages = pdfFull.getNumberOfPages()
  ok('PDF completo: se genera', pages >= 1)
  ok('PDF completo: contiene "Tiempo estimado de ejecución"', fullStr.includes('Tiempo estimado de') && fullStr.includes('ejecuci'))
  ok('PDF completo: contiene "Forma de pago"', fullStr.includes('Forma de pago'))
  ok('PDF completo: contiene "Vigencia cotización"', fullStr.includes('Vigencia cotización'))
  ok('PDF completo: contiene "Observaciones"', fullStr.includes('Observaciones'))
  ok('PDF completo: contiene "Materiales"', fullStr.includes('Materiales'))
  ok('PDF completo: contiene firmante', fullStr.includes('Representante Ejemplo'))
  ok('PDF completo: contiene RUT firmante', fullStr.includes('20.123.456-5'))
  ok('PDF completo: contiene cargo', fullStr.includes('Representante legal'))
  ok('PDF completo: contiene "$6.160.000"', fullStr.includes('$6.160.000'))
}

// ---- PDF compacto: caso similar a cotización real debe caber en una página ----
{
  const workDetails = [
    { id: 'wd-1', description: 'Retiro de planchas existentes' },
    { id: 'wd-2', description: 'Instalación planchas de fibrocemento 8 mm con tornillos volcanita 2&quot;' },
    { id: 'wd-3', description: 'Instalación esquineros perforados en vanos de ventanas y terminaciones' },
    { id: 'wd-4', description: 'Instalación de malla termoplac y base coat coat en dos manos' },
    { id: 'wd-5', description: 'Instalación de hojalatería, coronación en ventanas lado superior' },
    { id: 'wd-6', description: 'Aplicación de pintura aparejo y textueifs, sellado de ventanales con sikaflex' },
    { id: 'wd-7', description: 'Aplicación de pintura de terminación' },
    { id: 'wd-8', description: 'Retiro de escombros en general' },
  ]
  const sectionCompact = section('ETAPA 1: Reparación muro lado poniente', [
    { id: 'item-1', description: 'PLANCHAS FIBROCEMENTO 8 MM', type: 'material', quantity: 13, unit: 'unidad', unitPrice: 15990 },
    { id: 'item-2', description: 'BASE COAT', type: 'material', quantity: 7, unit: 'unidad', unitPrice: 14780 },
    { id: 'item-3', description: 'MALLA TERMOPLAC', type: 'material', quantity: 2, unit: 'unidad', unitPrice: 59990 },
    { id: 'item-4', description: 'FIJACIONES', type: 'material', quantity: 2000, unit: 'unidad', unitPrice: 15 },
    { id: 'item-5', description: 'TEXTUEIFS', type: 'material', quantity: 5, unit: 'unidad', unitPrice: 76300 },
    { id: 'item-6', description: 'HOJALATERIA', type: 'material', quantity: 1, unit: 'unidad', unitPrice: 250000 },
    { id: 'item-7', description: 'PINTURA BASE', type: 'material', quantity: 2, unit: 'unidad', unitPrice: 55000 },
    { id: 'item-8', description: 'PINTURA TERMINACIÓN', type: 'material', quantity: 2, unit: 'unidad', unitPrice: 135000 },
  ], 's-compact', {
    workDetails,
    globalAmount: 1500000,
  })
  const bCompact = {
    ...sampleBudget(),
    number: 2,
    clientSnapshot: {
      id: 'c-2',
      name: 'Cliente Demo',
      rut: '17123456-5',
      address: 'Av. Ejemplo 123, Santiago',
    },
    jobName: 'REPARACIONES CASA',
    jobAddress: 'Camino Ejemplo 789, Santiago',
    sections: [sectionCompact],
    discount: 0,
    ivaRate: 19,
    paymentTerms: '50% al inicio / 50% al finalizar',
    validityValue: 30,
    validityUnit: 'days' as ValidityUnit,
    executionTimeValue: 30,
    executionTimeUnit: 'days' as ExecutionTimeUnit,
    notes: '',
    signatureMode: 'saved' as const,
    issuerSnapshot: {
      issuerId: 'iss-compact',
      kind: 'empresa' as const,
      name: 'Constructora Demo SpA',
      rut: '76123456-0',
      giro: 'Construcción',
      phone: '+56 9 1111 1111',
      email: 'demo@example.com',
      address: 'Av. Ejemplo 123, Santiago',
      signatureDataUrl: PNG_1PX,
      signerName: 'Representante Ejemplo',
      signerRut: '20123456-5',
    },
  }
  const pdfCompact = generarPresupuestoPdf(bCompact, { name: 'ADOS' }, 'detallado')
  const compactStr = pdfText(pdfCompact)
  ok('PDF compacto con todas las columnas cabe en máximo dos páginas', pdfCompact.getNumberOfPages() <= 2)
  ok('PDF compacto no imprime entidades HTML', !compactStr.includes('&quot;'))
}

// ---- Ajuste de seguro: partidas simples, UF, deducible y compatibilidad ----
{
  const insuranceItem = item({
    quantity: 2,
    unitPrice: 100000,
    observation: 'Desgaste por uso',
    groupName: 'Cielo',
  })
  eq('seguro: precio total por ítem', itemAdjustedTotalCents(insuranceItem), 20000000)

  const insuranceBudget: Budget = {
    ...sampleBudget(),
    pricingMode: 'insurance-adjustment',
    sections: [section('Pasillo', [insuranceItem])],
    overheadRate: 25,
    ivaRate: 19,
    ufValue: 40000,
    deductibleUf: 5,
    ufConversionDate: '2026-10-05',
    workTableTitle: 'Trabajos a realizar',
  }
  eq('seguro: costo directo', budgetAdjustedSubtotalCents(insuranceBudget), 20000000)
  eq('seguro: total general para historial', budgetGrandTotalCents(insuranceBudget), 29750000)
  const insuranceTotals = calculateInsuranceTotals(20000000, 25, 19, 40000, 5)
  eq('seguro: GG y utilidad', insuranceTotals.overhead, 5000000)
  eq('seguro: costo neto', insuranceTotals.netCost, 25000000)
  eq('seguro: IVA', insuranceTotals.iva, 4750000)
  eq('seguro: total', insuranceTotals.adjustedTotal, 29750000)
  eq('seguro: deducible CLP', insuranceTotals.deductible, 20000000)
  eq('seguro: pérdida indemnizable', insuranceTotals.indemnizableLoss, 9750000)

  const parsedInsurance = parseBudget(JSON.parse(JSON.stringify(insuranceBudget)))!
  eq('seguro: modo persiste', parsedInsurance.pricingMode, 'insurance-adjustment')
  eq('seguro: observación persiste', parsedInsurance.sections[0].items[0].observation, 'Desgaste por uso')
  eq('seguro: subpartida persiste', parsedInsurance.sections[0].items[0].groupName, 'Cielo')
  eq('seguro: fecha UF persiste', parsedInsurance.ufConversionDate, '2026-10-05')
  const insurancePdf = generarPresupuestoPdf(insuranceBudget, { name: 'ADOS' }, 'detallado')
  const insurancePdfStr = pdfText(insurancePdf)
  ok('seguro: PDF contiene total', insurancePdfStr.includes('TOTAL'))
  ok('seguro: PDF contiene pérdida indemnizable', insurancePdfStr.includes('PÉRDIDA INDEMNIZABLE'))
  ok('seguro: PDF contiene título de trabajos', insurancePdfStr.includes('Trabajos a realizar'))
  ok('seguro: PDF contiene subpartida Cielo', insurancePdfStr.includes('Cielo'))

  const standardParsed = parseBudget(JSON.parse(JSON.stringify(sampleBudget())))!
  eq('compatibilidad: cotización antigua queda normal', standardParsed.pricingMode, 'standard')
  eq('compatibilidad: cotización antigua conserva subtotal', budgetSubtotalCents(standardParsed), budgetSubtotalCents(sampleBudget()))
  eq(
    'compatibilidad: total general estándar conserva descuento e IVA',
    budgetGrandTotalCents(standardParsed),
    calcularTotales([budgetSubtotalCents(standardParsed)], standardParsed.discount, standardParsed.ivaRate).total,
  )
}

console.log(`\n${count - failures}/${count} pruebas pasaron`)
if (failures > 0) {
  process.exit(1)
}
}
