import type {
  Budget,
  BudgetItem,
  BudgetSection,
  BudgetStatus,
  Client,
  CompanyConfig,
  ExecutionTimeUnit,
  IssuerProfile,
  IssuerSnapshot,
  UserProfile,
  ValidityUnit,
} from './types.ts'
import { calcularTotales, calculateInsuranceTotals, moneyToCents } from './money.ts'
import { isItemType, isBudgetStatus, DEFAULT_BUDGET_STATUS } from './units.ts'

export type ValidationResult = {
  valid: boolean
  errors: string[]
}

export function validateItem(item: BudgetItem): ValidationResult {
  const errors: string[] = []
  if (!item.description.trim()) {
    errors.push('La descripción es obligatoria.')
  }
  if (!isItemType(item.type)) {
    errors.push('El tipo del ítem es inválido.')
  }
  if (!item.quantity || item.quantity <= 0) {
    errors.push('La cantidad debe ser mayor que cero.')
  }
  if (!item.unitPrice || item.unitPrice <= 0) {
    errors.push('El precio unitario debe ser mayor que cero.')
  }
  return { valid: errors.length === 0, errors }
}

export function validateSectionName(name: string): ValidationResult {
  const errors: string[] = []
  if (!name.trim()) {
    errors.push('El nombre de la sección es obligatorio.')
  }
  return { valid: errors.length === 0, errors }
}

export function validateDiscount(discountCents: number, subtotal: number): ValidationResult {
  const errors: string[] = []
  if (!Number.isFinite(discountCents) || discountCents < 0) {
    errors.push('El descuento debe ser un monto positivo.')
  } else if (discountCents > subtotal) {
    errors.push('El descuento no puede ser mayor que el subtotal.')
  }
  return { valid: errors.length === 0, errors }
}

export function itemsTotalCents(items: BudgetItem[]): number {
  return items.reduce((acc, item) => acc + moneyToCents(item.quantity, item.unitPrice), 0)
}

export function itemAdjustedTotalCents(item: BudgetItem): number {
  return moneyToCents(item.quantity, item.unitPrice)
}

export function sectionAdjustedSubtotalCents(section: BudgetSection): number {
  const itemsTotal = section.items.reduce((acc, item) => acc + itemAdjustedTotalCents(item), 0)
  return itemsTotal + Math.round((section.globalAmount ?? 0) * 100)
}

export function budgetAdjustedSubtotalCents(budget: Budget): number {
  return budget.sections.reduce((acc, section) => acc + sectionAdjustedSubtotalCents(section), 0)
}

export function sectionSubtotalCents(section: BudgetSection): number {
  const itemsTotal = itemsTotalCents(section.items)
  const global = Math.round((section.globalAmount ?? 0) * 100)
  return itemsTotal + global
}

export function budgetSubtotalCents(budget: Budget): number {
  return budget.sections.reduce((acc, section) => acc + sectionSubtotalCents(section), 0)
}

export function budgetGrandTotalCents(budget: Budget): number {
  if (budget.pricingMode === 'insurance-adjustment') {
    return calculateInsuranceTotals(
      budgetAdjustedSubtotalCents(budget),
      budget.overheadRate ?? 25,
      budget.ivaRate,
      budget.ufValue ?? 0,
      budget.deductibleUf ?? 0,
    ).adjustedTotal
  }
  return calcularTotales([budgetSubtotalCents(budget)], budget.discount, budget.ivaRate).total
}

export function budgetHasValidItems(budget: Budget): boolean {
  return budget.sections.some((section) => sectionHasContent(section))
}

export function budgetStatus(budget: Budget): BudgetStatus {
  return isBudgetStatus(budget.status) ? budget.status : DEFAULT_BUDGET_STATUS
}

export function budgetIsArchived(budget: Budget): boolean {
  return budgetStatus(budget) === 'no-realizada'
}

export function isArchivedStatus(status: BudgetStatus): boolean {
  return status === 'no-realizada'
}

export function sectionHasContent(section: BudgetSection): boolean {
  if (section.items.length > 0) return true
  if (section.globalAmount && section.globalAmount > 0) return true
  if (section.workDetails && section.workDetails.length > 0) return true
  return false
}

export function validateBudget(hasClient: boolean, sections: BudgetSection[]): ValidationResult {
  const errors: string[] = []
  if (!hasClient) {
    errors.push('Debes seleccionar un cliente.')
  }
  const hasContent = sections.some((section) => sectionHasContent(section))
  if (!hasContent) {
    errors.push('Agrega al menos un ítem, valor global o detalle de trabajos.')
  } else {
    for (const section of sections) {
      const invalid = section.items.find((item) => !validateItem(item).valid)
      if (invalid) {
        errors.push(`El ítem "${invalid.description || 'sin descripción'}" es inválido.`)
        break
      }
    }
  }
  return { valid: errors.length === 0, errors }
}

export function validateCompanyConfig(config: CompanyConfig): ValidationResult {
  const errors: string[] = []
  if (!config.name.trim()) {
    errors.push('El nombre de la empresa es obligatorio.')
  }
  if (config.email && config.email.trim()) {
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRe.test(config.email.trim())) {
      errors.push('El correo no es válido.')
    }
  }
  return { valid: errors.length === 0, errors }
}

export function validateClientName(name: string): ValidationResult {
  const errors: string[] = []
  if (!name.trim()) {
    errors.push('El nombre es obligatorio.')
  }
  return { valid: errors.length === 0, errors }
}

export function validateClient(client: Client): ValidationResult {
  return validateClientName(client.name)
}

export function snapshotFromIssuer(issuer: IssuerProfile): IssuerSnapshot {
  return {
    issuerId: issuer.id,
    kind: issuer.kind,
    name: issuer.name,
    rut: issuer.rut,
    phone: issuer.phone,
    email: issuer.email,
    address: issuer.address,
    logoDataUrl: issuer.logoDataUrl,
    logoUrl: issuer.logoUrl,
    info: issuer.info,
    giro: issuer.giro,
    signatureDataUrl: issuer.signatureDataUrl,
    signatureUrl: issuer.signatureUrl,
    signerName: issuer.signerName,
    signerRut: issuer.signerRut,
    signerRole: issuer.signerRole,
    themeColor: issuer.themeColor,
  }
}

/**
 * Actualiza el issuerSnapshot de una cotización con los datos actuales de un IssuerProfile.
 * NO modifica ningún otro campo de la cotización.
 * Si no hay issuerSnapshot previo, crea uno nuevo.
 */
export function refreshIssuerSnapshot(budget: Budget, issuer: IssuerProfile): Budget {
  return { ...budget, issuerSnapshot: snapshotFromIssuer(issuer) }
}

export function validateIssuer(issuer: IssuerProfile): ValidationResult {
  const errors: string[] = []
  if (!issuer.name.trim()) {
    errors.push('El nombre o razón social es obligatorio.')
  }
  if (issuer.kind !== 'empresa' && issuer.kind !== 'persona') {
    errors.push('El tipo del perfil es inválido.')
  }
  if (issuer.email && issuer.email.trim()) {
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRe.test(issuer.email.trim())) {
      errors.push('El correo no es válido.')
    }
  }
  return { valid: errors.length === 0, errors }
}

export function validateUserProfile(profile: UserProfile): ValidationResult {
  const errors: string[] = []
  if (profile.displayName && profile.displayName.trim() === '') {
    errors.push('El nombre mostrado no puede estar vacío.')
  }
  return { valid: errors.length === 0, errors }
}

export function formatValidityValue(value: number, unit: ValidityUnit): string {
  const label = unit === 'days'
    ? (value === 1 ? 'día' : 'días')
    : (value === 1 ? 'mes' : 'meses')
  return `${value} ${label}`
}

export function formatExecutionTime(value: number, unit: ExecutionTimeUnit): string {
  const label = unit === 'days'
    ? (value === 1 ? 'día' : 'días')
    : unit === 'weeks'
      ? (value === 1 ? 'semana' : 'semanas')
      : (value === 1 ? 'mes' : 'meses')
  return `${value} ${label}`
}

export function formatBudgetValidity(budget: Budget): string {
  if (budget.validityValue != null && budget.validityUnit) {
    return formatValidityValue(budget.validityValue, budget.validityUnit)
  }
  return budget.validity
}

const VALIDITY_RE = /^(\d+)\s+(d[ií]as?|mes(?:es)?)/i

export function parseValidityString(text: string): { value: number; unit: ValidityUnit } | null {
  const m = VALIDITY_RE.exec(text.trim())
  if (!m) return null
  const value = parseInt(m[1], 10)
  if (!Number.isFinite(value) || value <= 0) return null
  const raw = m[2].toLowerCase()
  if (raw.startsWith('mes')) return { value, unit: 'months' }
  return { value, unit: 'days' }
}
