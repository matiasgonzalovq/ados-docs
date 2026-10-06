import type { ItemType, Unit, BudgetStatus } from './types.ts'

export const UNITS: readonly Unit[] = ['unidad', 'm2', 'm3', 'ml', 'hora', 'jornada', 'global']

export const UNIT_LABELS: Record<Unit, string> = {
  unidad: 'Unidad',
  m2: 'm²',
  m3: 'm³',
  ml: 'Metro lineal',
  hora: 'Hora',
  jornada: 'Jornada',
  global: 'Global',
}

export function isUnit(value: unknown): value is Unit {
  return typeof value === 'string' && (UNITS as readonly string[]).includes(value)
}

export const ITEM_TYPES: readonly ItemType[] = ['material', 'mano-de-obra', 'servicio', 'otro']

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  material: 'Material',
  'mano-de-obra': 'Mano de obra',
  servicio: 'Servicio',
  otro: 'Otro',
}

export function isItemType(value: unknown): value is ItemType {
  return typeof value === 'string' && (ITEM_TYPES as readonly string[]).includes(value)
}

export const BUDGET_STATUSES: readonly BudgetStatus[] = ['pendiente', 'se-realizara', 'no-realizada']

export const BUDGET_STATUS_LABELS: Record<BudgetStatus, string> = {
  pendiente: 'Pendiente',
  'se-realizara': 'Se realizará',
  'no-realizada': 'No realizada',
}

export function isBudgetStatus(value: unknown): value is BudgetStatus {
  return typeof value === 'string' && (BUDGET_STATUSES as readonly string[]).includes(value)
}

export const DEFAULT_BUDGET_STATUS: BudgetStatus = 'pendiente'
