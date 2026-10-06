import type { App } from '../app.ts'
import { STRINGS } from '../strings.ts'
import type { Budget } from '../../domain/types.ts'
import { BUDGET_STATUS_LABELS } from '../../domain/units.ts'
import { formatCLP } from '../../domain/money.ts'
import { budgetGrandTotalCents, budgetStatus, budgetIsArchived } from '../../domain/validators.ts'
import {
  puedeGenerarPdf,
  generarPresupuestoPdf,
  nombreArchivoCotizacionDetallado,
  nombreArchivoCotizacionResumido,
} from '../../pdf/pdf.ts'
import { deleteQuoteDoc, saveQuote } from '../../firebase/store.ts'

function esc(value: string | undefined): string {
  return (value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return iso
  }
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${date.getFullYear()}`
}

function budgetTotal(budget: Budget): string {
  return formatCLP(budgetGrandTotalCents(budget))
}

export function renderInicio(app: App): string {
  const sorted = [...app.state.budgets].sort((a, b) =>
    b.date.localeCompare(a.date) || b.number - a.number,
  )
  const activas = sorted.filter((budget) => !budgetIsArchived(budget))
  const archivadas = sorted.filter((budget) => budgetIsArchived(budget))
  const activeList = activas.length
    ? activas.map((budget) => renderBudgetCard(budget)).join('')
    : `<p class="empty">${STRINGS.historialVacio}</p>`
  const archivedList = archivadas.length
    ? archivadas.map((budget) => renderBudgetCard(budget)).join('')
    : `<p class="empty">${STRINGS.archivadasVacio}</p>`
  return `
    <section class="view">
      <button type="button" class="btn btn-primary btn-block btn-hero" data-action="budget-new">${STRINGS.nuevoCotizacion}</button>
      <h2>${STRINGS.inicioTitle}</h2>
      <h3>${STRINGS.cotizacionesActivas}</h3>
      <div class="budget-list">${activeList}</div>
      <h3>${STRINGS.cotizacionesArchivadas}</h3>
      <div class="budget-list">${archivedList}</div>
    </section>
  `
}

function renderBudgetCard(budget: Budget): string {
  const clientName = budget.clientSnapshot?.name ?? STRINGS.emptyLabel
  const draftTag = budget.isDraft ? `<span class="badge badge-draft">${STRINGS.borrador}</span>` : ''
  const statusBadge = `<span class="badge badge-status badge-status-${budgetStatus(budget)}">${BUDGET_STATUS_LABELS[budgetStatus(budget)]}</span>`
  return `
    <div class="card budget-card">
      <div class="card-main">
        <div class="budget-top">
          <strong>Cotización N.º ${String(budget.number).padStart(4, '0')}</strong>
          ${draftTag}
        </div>
        <div class="budget-status-line">
          ${statusBadge}
        </div>
        <span class="quiet">${formatDate(budget.date)} · ${esc(clientName)}</span>
        <span class="budget-total">${budgetTotal(budget)}</span>
      </div>
      <div class="card-actions">
        <button type="button" class="btn btn-secondary btn-sm" data-action="budget-open" data-param="${budget.id}">${STRINGS.abrirEditar}</button>
        <button type="button" class="btn btn-secondary btn-sm" data-action="budget-status" data-param="${budget.id}">${STRINGS.cambiarEstado}</button>
        <button type="button" class="btn btn-secondary btn-sm" data-action="budget-dup" data-param="${budget.id}">${STRINGS.duplicar}</button>
        <button type="button" class="btn btn-secondary btn-sm" data-action="budget-share" data-param="${budget.id}">${STRINGS.compartir}</button>
        <button type="button" class="btn btn-secondary btn-sm" data-action="budget-download" data-param="${budget.id}">${STRINGS.descargarDetallado}</button>
        <button type="button" class="btn btn-secondary btn-sm" data-action="budget-download-resumen" data-param="${budget.id}">${STRINGS.descargarResumido}</button>
        <button type="button" class="btn btn-danger btn-sm" data-action="budget-del" data-param="${budget.id}">${STRINGS.eliminar}</button>
      </div>
    </div>
  `
}

function findBudget(app: App, param?: string): Budget | undefined {
  return app.state.budgets.find((b) => b.id === param)
}

async function shareBudget(app: App, budget: Budget): Promise<void> {
  const check = puedeGenerarPdf(budget)
  if (!check.ok) {
    app.toast(STRINGS.pdfBlocked.replace('{reason}', check.reason ?? ''))
    return
  }
  const doc = generarPresupuestoPdf(budget, app.state.company)
  const blob = doc.output('blob')
  const file = new File([blob], nombreArchivoCotizacionDetallado(budget), { type: 'application/pdf' })
  const title = STRINGS.shareText.replace('{num}', String(budget.number).padStart(4, '0'))
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
  if (navigator.share) {
    try {
      if (nav.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title, text: title })
      } else {
        await navigator.share({ title, text: title })
      }
      return
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        return
      }
      app.toast(`${STRINGS.shareFailed} ${STRINGS.shareErrTitle}`)
      await downloadPdf(app, budget)
      return
    }
  }
  await downloadPdf(app, budget)
}

async function downloadPdf(app: App, budget: Budget, modo: 'detallado' | 'resumido' = 'detallado'): Promise<void> {
  const check = puedeGenerarPdf(budget)
  if (!check.ok) {
    app.toast(STRINGS.pdfBlocked.replace('{reason}', check.reason ?? ''))
    return
  }
  const doc = generarPresupuestoPdf(budget, app.state.company, modo)
  doc.save(modo === 'resumido' ? nombreArchivoCotizacionResumido(budget) : nombreArchivoCotizacionDetallado(budget))
}

export const handlers: Record<string, (app: App, param?: string) => void> = {
  'budget-new': (app) => {
    app.newBudget()
  },
  'budget-open': (app, param) => {
    const budget = findBudget(app, param)
    if (budget && param) {
      app.goEditBudget(budget, param)
    }
  },
  'budget-status': async (app, param) => {
    const budget = findBudget(app, param)
    if (!budget || !param) {
      return
    }
    const next = await app.pickStatus(budgetStatus(budget))
    if (!next || next === budgetStatus(budget)) {
      return
    }
    const index = app.state.budgets.findIndex((b) => b.id === param)
    if (index === -1) {
      return
    }
    const updated = { ...app.state.budgets[index], status: next, updatedAt: new Date().toISOString() }
    app.state.budgets[index] = updated
    await saveQuote(updated, app.uid!)
    app.toast(STRINGS.estadoCambiado)
    app.render()
  },
  'budget-dup': (app, param) => {
    const budget = findBudget(app, param)
    if (budget) {
      app.duplicate(budget)
      app.toast(STRINGS.duplicated)
    }
  },
  'budget-share': async (app, param) => {
    const budget = findBudget(app, param)
    if (budget) {
      await shareBudget(app, budget)
    }
  },
  'budget-download': async (app, param) => {
    const budget = findBudget(app, param)
    if (budget) {
      await downloadPdf(app, budget, 'detallado')
    }
  },
  'budget-download-resumen': async (app, param) => {
    const budget = findBudget(app, param)
    if (budget) {
      await downloadPdf(app, budget, 'resumido')
    }
  },
  'budget-del': async (app, param) => {
    if (!param) {
      return
    }
    const confirmed = await app.confirmDialog(STRINGS.confirmEliminarCotizacion)
    if (!confirmed) {
      return
    }
    await deleteQuoteDoc(param, app.uid!)
    app.state.budgets = app.state.budgets.filter((b) => b.id !== param)
    app.toast(STRINGS.eliminado)
    app.render()
  },
}

export function bind(): void {
  // Sin formularios en la vista de inicio.
}
