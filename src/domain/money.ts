const CLP_FORMATTER = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

export function roundCents(value: number): number {
  return Math.round(value)
}

export function moneyToCents(quantity: number, unitPrice: number): number {
  return roundCents(quantity * unitPrice * 100)
}

export function monthsToIva(baseImponible: number, ivaRate: number): number {
  return roundCents((baseImponible * ivaRate) / 100)
}

export type Totals = {
  subtotal: number
  discount: number
  baseImponible: number
  iva: number
  total: number
}

export function calcularTotales(
  itemAmounts: number[],
  discount: number,
  ivaRate: number,
): Totals {
  const subtotal = roundCents(itemAmounts.reduce((acc, amount) => acc + amount, 0))
  const discountValid = roundCents(discount)
  const discounted = Math.max(0, discountValid)
  const appliedDiscount = Math.min(discounted, subtotal)
  const baseImponible = subtotal - appliedDiscount
  const iva = monthsToIva(baseImponible, ivaRate)
  const total = baseImponible + iva
  return { subtotal, discount: appliedDiscount, baseImponible, iva, total }
}

export function formatCLP(cents: number): string {
  return CLP_FORMATTER.format(Math.round(cents) / 100)
}

export type InsuranceTotals = {
  directCost: number
  overhead: number
  netCost: number
  iva: number
  adjustedTotal: number
  ufEquivalent: number | null
  deductible: number
  deductibleUf: number
  indemnizableLoss: number
}

export function calculateInsuranceTotals(
  directCost: number,
  overheadRate: number,
  ivaRate: number,
  ufValue: number,
  deductibleUf: number,
): InsuranceTotals {
  const safeDirectCost = Math.max(0, roundCents(directCost))
  const safeOverheadRate = Math.max(0, Number.isFinite(overheadRate) ? overheadRate : 0)
  const safeIvaRate = Math.max(0, Number.isFinite(ivaRate) ? ivaRate : 0)
  const safeUfValue = Math.max(0, Number.isFinite(ufValue) ? ufValue : 0)
  const safeDeductibleUf = Math.max(0, Number.isFinite(deductibleUf) ? deductibleUf : 0)
  const overhead = roundCents((safeDirectCost * safeOverheadRate) / 100)
  const netCost = safeDirectCost + overhead
  const iva = roundCents((netCost * safeIvaRate) / 100)
  const adjustedTotal = netCost + iva
  const ufEquivalent = safeUfValue > 0 ? adjustedTotal / (safeUfValue * 100) : null
  const deductible = roundCents(safeDeductibleUf * safeUfValue * 100)
  const indemnizableLoss = Math.max(0, adjustedTotal - deductible)
  return {
    directCost: safeDirectCost,
    overhead,
    netCost,
    iva,
    adjustedTotal,
    ufEquivalent,
    deductible,
    deductibleUf: safeDeductibleUf,
    indemnizableLoss,
  }
}

const DECIMAL_RE = /^[+-]?\d{1,12}([.,]\d{1,2})?$/

export function textToCents(text: string): number {
  const normalized = (text ?? '').trim().replace(/[$.\s]/g, '').replace(',', '.')
  if (!DECIMAL_RE.test(normalized)) {
    return NaN
  }
  const value = Number(normalized)
  if (!Number.isFinite(value)) {
    return NaN
  }
  return roundCents(value * 100)
}

export function centsToInput(cents: number): string {
  return String(Math.round(cents) / 100)
}
