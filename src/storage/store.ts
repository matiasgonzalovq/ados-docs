import type { Budget, BudgetItem, BudgetSection, CatalogItem, Client, CompanyConfig, ExecutionTimeUnit, IssuerSnapshot, Unit, ValidityUnit } from '../domain/types.ts'
import { isItemType, isUnit, isBudgetStatus, DEFAULT_BUDGET_STATUS } from '../domain/units.ts'
import { parseValidityString } from '../domain/validators.ts'

export type AppState = {
  company: CompanyConfig
  clients: Client[]
  budgets: Budget[]
  nextBudgetNumber: number
  catalog: CatalogItem[]
}

export const EMPTY_STATE: AppState = {
  company: { name: '' },
  clients: [],
  budgets: [],
  nextBudgetNumber: 1,
  catalog: [],
}

const KEYS = {
  company: 'ados.company',
  clients: 'ados.clients',
  budgets: 'ados.budgets',
  nextBudgetNumber: 'ados.nextBudgetNumber',
  themeColor: 'ados.themeColor',
  catalog: 'ados.catalog',
} as const

const MAX_LOGO_BYTES = 1024 * 1024

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asBoolean(value: unknown): boolean {
  return value === true
}

function parseCompany(value: unknown): CompanyConfig {
  if (!isRecord(value)) {
    return { name: '' }
  }
  const name = typeof value.name === 'string' ? value.name : ''
  return {
    name,
    rut: asOptionalString(value.rut),
    phone: asOptionalString(value.phone),
    email: asOptionalString(value.email),
    address: asOptionalString(value.address),
    logoDataUrl: asOptionalString(value.logoDataUrl),
  }
}

function parseItem(value: unknown, index: number): BudgetItem | null {
  if (!isRecord(value)) {
    return null
  }
  let unit: Unit = 'unidad'
  const candidateUnit = value.unit
  if (isUnit(candidateUnit)) {
    unit = candidateUnit
  }
  let type = 'otro' as BudgetItem['type']
  if (isItemType(value.type)) {
    type = value.type
  }
  const description = typeof value.description === 'string' ? value.description : ''
  const quantity = asNumber(value.quantity, 0)
  const unitPrice = asNumber(value.unitPrice, 0)
  if (description.trim() === '' || quantity <= 0 || unitPrice <= 0) {
    return null
  }
  return {
    id: typeof value.id === 'string' ? value.id : `inv-${index}`,
    description,
    type,
    quantity,
    unit,
    unitPrice,
    observation: asOptionalString(value.observation),
    groupName: asOptionalString(value.groupName),
  }
}

function parseSection(value: unknown, index: number): BudgetSection | null {
  if (!isRecord(value)) {
    return null
  }
  const rawName = typeof value.name === 'string' ? value.name.trim() : ''
  const name = rawName === '' ? `Sección ${index + 1}` : rawName
  const items = Array.isArray(value.items)
    ? (value.items as unknown[]).map(parseItem).filter((i): i is BudgetItem => i !== null)
    : []
  return {
    id: typeof value.id === 'string' && value.id !== '' ? value.id : `sec-${index}`,
    name,
    items,
    workDetails: Array.isArray(value.workDetails)
      ? value.workDetails
          .filter(isRecord)
          .map((detail, detailIndex) => ({
            id: typeof detail.id === 'string' ? detail.id : `work-${index}-${detailIndex}`,
            description: typeof detail.description === 'string' ? detail.description : '',
          }))
          .filter((detail) => detail.description.trim() !== '')
      : undefined,
    globalAmount: typeof value.globalAmount === 'number' && value.globalAmount >= 0
      ? value.globalAmount
      : undefined,
    globalLabel: asOptionalString(value.globalLabel),
  }
}

const LEGACY_SECTION_ID = 'sec-legacy'
const LEGACY_SECTION_NAME = 'Obra general'

function parseClient(value: unknown): Client | null {
  if (!isRecord(value)) {
    return null
  }
  const name = typeof value.name === 'string' ? value.name : ''
  if (name.trim() === '') {
    return null
  }
  return {
    id: typeof value.id === 'string' ? value.id : `inv-${name}`,
    name,
    rut: asOptionalString(value.rut),
    phone: asOptionalString(value.phone),
    address: asOptionalString(value.address),
  }
}

function parseIssuerSnapshot(value: unknown): IssuerSnapshot | undefined {
  if (!isRecord(value) || typeof value.issuerId !== 'string' || typeof value.name !== 'string') return undefined
  return {
    issuerId: value.issuerId,
    kind: value.kind === 'persona' ? 'persona' : 'empresa',
    name: value.name,
    rut: asOptionalString(value.rut),
    phone: asOptionalString(value.phone),
    email: asOptionalString(value.email),
    address: asOptionalString(value.address),
    logoDataUrl: asOptionalString(value.logoDataUrl),
    logoUrl: asOptionalString(value.logoUrl),
    info: asOptionalString(value.info),
    giro: asOptionalString(value.giro),
    signatureDataUrl: asOptionalString(value.signatureDataUrl),
    signatureUrl: asOptionalString(value.signatureUrl),
    signerName: asOptionalString(value.signerName),
    signerRut: asOptionalString(value.signerRut),
    signerRole: asOptionalString(value.signerRole),
    themeColor: Array.isArray(value.themeColor) && value.themeColor.length === 3
      ? value.themeColor.map((channel) => asNumber(channel, 0)) as [number, number, number]
      : undefined,
  }
}

export function parseBudget(value: unknown): Budget | null {
  if (!isRecord(value)) {
    return null
  }
  const id = typeof value.id === 'string' ? value.id : ''
  if (id === '') {
    return null
  }
  const number = asNumber(value.number, 0)
  const rawSections = Array.isArray(value.sections)
    ? (value.sections as unknown[]).map(parseSection).filter((s): s is BudgetSection => s !== null)
    : []
  const rawLegacyItems = Array.isArray(value.items)
    ? (value.items as unknown[]).map(parseItem).filter((i): i is BudgetItem => i !== null)
    : []
  const sections: BudgetSection[] =
    rawSections.length > 0
      ? rawSections
      : rawLegacyItems.length > 0
        ? [{ id: LEGACY_SECTION_ID, name: LEGACY_SECTION_NAME, items: rawLegacyItems }]
        : rawSections
  const rawSnapshot = isRecord(value.clientSnapshot) ? value.clientSnapshot : undefined
  const snapshot = rawSnapshot
    ? {
        name: typeof rawSnapshot.name === 'string' ? rawSnapshot.name : '',
        rut: asOptionalString(rawSnapshot.rut),
        phone: asOptionalString(rawSnapshot.phone),
        address: asOptionalString(rawSnapshot.address),
      }
    : undefined
  const validity = typeof value.validity === 'string' ? value.validity : ''
  let validityValue = typeof value.validityValue === 'number' && value.validityValue > 0 ? value.validityValue : undefined
  let validityUnit: ValidityUnit | undefined = value.validityUnit === 'days' || value.validityUnit === 'months' ? value.validityUnit : undefined
  const executionTimeValue = typeof value.executionTimeValue === 'number' && value.executionTimeValue > 0 ? value.executionTimeValue : undefined
  const executionTimeUnit: ExecutionTimeUnit | undefined = value.executionTimeUnit === 'days' || value.executionTimeUnit === 'weeks' || value.executionTimeUnit === 'months'
    ? value.executionTimeUnit
    : undefined
  if (validityValue == null && validityUnit == null && validity) {
    const parsed = parseValidityString(validity)
    if (parsed) {
      validityValue = parsed.value
      validityUnit = parsed.unit
    }
  }
  return {
    id,
    number,
    date: typeof value.date === 'string' ? value.date : new Date().toISOString(),
    clientId: typeof value.clientId === 'string' ? value.clientId : undefined,
    clientSnapshot: snapshot,
    jobName: typeof value.jobName === 'string' ? value.jobName : '',
    jobAddress: typeof value.jobAddress === 'string' ? value.jobAddress : '',
    sections,
    discount: Math.max(0, asNumber(value.discount, 0)),
    ivaRate: asNumber(value.ivaRate, 19),
    paymentTerms: typeof value.paymentTerms === 'string' ? value.paymentTerms : '',
    validity,
    validityValue,
    validityUnit,
    executionTimeValue,
    executionTimeUnit,
    notes: typeof value.notes === 'string' ? value.notes : '',
    status: isBudgetStatus(value.status) ? value.status : DEFAULT_BUDGET_STATUS,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString(),
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
    isDraft: asBoolean(value.isDraft),
    issuerSnapshot: parseIssuerSnapshot(value.issuerSnapshot),
    signatureMode: value.signatureMode === 'manual' || value.signatureMode === 'saved' ? value.signatureMode : 'none',
    paymentMode: typeof value.paymentMode === 'string' ? value.paymentMode : undefined,
    pricingMode: value.pricingMode === 'insurance-adjustment' ? 'insurance-adjustment' : 'standard',
    overheadRate: Math.max(0, asNumber(value.overheadRate, 25)),
    ufValue: Math.max(0, asNumber(value.ufValue, 0)),
    ufConversionDate: typeof value.ufConversionDate === 'string' ? value.ufConversionDate : undefined,
    deductibleUf: Math.max(0, asNumber(value.deductibleUf, 0)),
    workTableTitle: typeof value.workTableTitle === 'string' && value.workTableTitle.trim()
      ? value.workTableTitle
      : 'Trabajos a realizar',
  }
}

function readJSON<T>(key: string, fallback: T, parser: (value: unknown) => T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) {
      return fallback
    }
    return parser(JSON.parse(raw))
  } catch {
    return fallback
  }
}

export function loadState(): AppState {
  const company = parseCompany(readJSON(KEYS.company, {}, (v) => v))
  const clients = readJSON(KEYS.clients, [], (v) =>
    Array.isArray(v) ? v.map(parseClient).filter((c): c is Client => c !== null) : [],
  )
  const budgets = readJSON(KEYS.budgets, [], (v) =>
    Array.isArray(v) ? v.map(parseBudget).filter((b): b is Budget => b !== null) : [],
  )
  let nextBudgetNumber = readJSON(KEYS.nextBudgetNumber, 1, (v) =>
    typeof v === 'number' && v >= 1 ? Math.floor(v) : 1,
  )

  const highest = budgets.reduce((max, b) => Math.max(max, b.number), 0)
  if (nextBudgetNumber <= highest) {
    nextBudgetNumber = highest + 1
  }

  return { company, clients, budgets, nextBudgetNumber, catalog: loadCatalog() }
}

function loadCatalog(): CatalogItem[] {
  return readJSON(KEYS.catalog, [], (v) =>
    Array.isArray(v) ? v.map(parseCatalogItem).filter((c): c is CatalogItem => c !== null) : [],
  )
}

function parseCatalogItem(value: unknown): CatalogItem | null {
  if (!isRecord(value)) return null
  const id = typeof value.id === 'string' ? value.id : ''
  if (!id) return null
  const name = typeof value.name === 'string' ? value.name : ''
  if (!name) return null
  const category = typeof value.category === 'string' ? value.category : 'otro'
  return {
    id,
    name,
    description: asOptionalString(value.description),
    category: (category as CatalogItem['category']),
    unit: isUnit(value.unit) ? value.unit : 'unidad',
    unitPrice: asNumber(value.unitPrice, 0),
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString(),
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
  }
}

export function loadThemeColor(): string | null {
  try {
    const v = localStorage.getItem(KEYS.themeColor)
    if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) return v
  } catch { /* ignore */ }
  return null
}

export function saveThemeColor(color: string): void {
  writeJSON(KEYS.themeColor, color)
}

export function clearThemeColor(): void {
  try { localStorage.removeItem(KEYS.themeColor) } catch { /* ignore */ }
}

function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Cuota excedida: se ignora para la escritura (los datos quedan en memoria).
  }
}

export function saveState(state: AppState): void {
  writeJSON(KEYS.company, state.company)
  writeJSON(KEYS.clients, state.clients)
  writeJSON(KEYS.budgets, state.budgets)
  writeJSON(KEYS.nextBudgetNumber, state.nextBudgetNumber)
  writeJSON(KEYS.catalog, state.catalog)
}

export function allocateNextNumber(state: AppState): number {
  const number = state.nextBudgetNumber
  state.nextBudgetNumber = number + 1
  return number
}

export function isDataUrlImage(value: string): boolean {
  return /^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,/.test(value)
}

export function dataUrlByteSize(value: string): number {
  const base64 = value.replace(/^data:[^,]+,/, '')
  const padding = (base64.match(/(=+)$/) ?? [''])[0].length
  return Math.floor((base64.length * 3) / 4) - padding
}

export function isValidLogo(value: string): boolean {
  return isDataUrlImage(value) && dataUrlByteSize(value) <= MAX_LOGO_BYTES
}

// ---------- Legado (fuente de migración) ----------

export type LegacyState = {
  company: CompanyConfig
  clients: Client[]
  budgets: Budget[]
  nextBudgetNumber: number
  migrated?: boolean
}

export function hasLegacyData(): boolean {
  return (
    localStorage.getItem(KEYS.company) !== null ||
    localStorage.getItem(KEYS.clients) !== null ||
    localStorage.getItem(KEYS.budgets) !== null ||
    localStorage.getItem(KEYS.nextBudgetNumber) !== null
  )
}

/** Lee las claves legacy originales (no usa respaldo). */
export function loadLegacyState(): LegacyState {
  const state = loadState()
  return {
    company: state.company,
    clients: state.clients,
    budgets: state.budgets,
    nextBudgetNumber: state.nextBudgetNumber,
  }
}

/** Copia de respaldo de los datos legacy originales (no los borra). */
export function saveLegacyBackup(): void {
  try {
    const backup = {
      company: readJSON(KEYS.company, {}, (v) => v),
      clients: readJSON(KEYS.clients, [], (v) => v),
      budgets: readJSON(KEYS.budgets, [], (v) => v),
      nextBudgetNumber: readJSON(KEYS.nextBudgetNumber, 1, (v) => v),
      backupAt: new Date().toISOString(),
    }
    localStorage.setItem('ados.legacyBackup', JSON.stringify(backup))
  } catch {
    // noop
  }
}

/** Marca que la migración local terminó (para no volver a preguntar en este navegador). */
export function markLocalMigration(state: 'done' | 'dismissed'): void {
  try {
    localStorage.setItem('ados.migration', state)
  } catch {
    // noop
  }
}

export function localMigrationState(): 'done' | 'dismissed' | 'none' {
  const v = localStorage.getItem('ados.migration')
  return v === 'done' || v === 'dismissed' ? v : 'none'
}
