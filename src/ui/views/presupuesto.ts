import type { App } from '../app.ts'
import { STRINGS, PAYMENT_PRESETS, PAYMENT_CUSTOM_VALUE, SECTION_SUGGESTIONS } from '../strings.ts'
import type { Budget, BudgetItem, BudgetSection, ClientSnapshot, ItemType, CatalogItem } from '../../domain/types.ts'
import { UNITS, UNIT_LABELS, isItemType } from '../../domain/units.ts'
import { calcularTotales, calculateInsuranceTotals, formatCLP, textToCents } from '../../domain/money.ts'
import {
  validateBudget,
  validateItem,
  validateSectionName,
  sectionSubtotalCents,
  budgetSubtotalCents,
  budgetAdjustedSubtotalCents,
  snapshotFromIssuer,
  refreshIssuerSnapshot,
  formatValidityValue,
} from '../../domain/validators.ts'

function esc(value: string | undefined): string {
  return (value ?? '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/&/g, '&amp;')
}

function freshBudget(): Budget {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    number: 0,
    date: now,
    jobName: '',
    jobAddress: '',
    sections: [],
    discount: 0,
    ivaRate: 19,
    paymentTerms: '',
    validity: '',
    validityValue: 15,
    validityUnit: 'days',
    executionTimeValue: undefined,
    executionTimeUnit: undefined,
    notes: '',
    status: 'pendiente',
    signatureMode: 'none',
    pricingMode: 'standard',
    overheadRate: 25,
    workTableTitle: 'Trabajos a realizar',
    createdAt: now,
    updatedAt: now,
  }
}

// Acciones que no modifican la cotización: no deben marcar el editor como "sin guardar".
const NON_DIRTY_ACTIONS = new Set([
  'budget-back',
  'section-new',
  'section-edit',
  'section-cancel',
  'item-new',
  'item-edit',
  'item-cancel',
  'total-toggle',
])

function currentBudget(app: App): Budget {
  if (!app.editingBudget) {
    app.editingBudget = freshBudget()
  }
  if (app.editingBudget.paymentMode === undefined) {
    app.editingBudget.paymentMode = derivePaymentMode(app.editingBudget.paymentTerms)
  }
  return app.editingBudget
}

function snapshotOf(app: App, clientId: string): ClientSnapshot | undefined {
  const client = app.state.clients.find((c) => c.id === clientId)
  if (!client) {
    return undefined
  }
  return {
    name: client.name,
    rut: client.rut,
    phone: client.phone,
    address: client.address,
  }
}

function clientSelector(app: App, budget: Budget): string {
  const options = [
    `<option value="">${STRINGS.sinCliente}</option>`,
    ...app.state.clients.map(
      (c) =>
        `<option value="${c.id}"${c.id === budget.clientId ? ' selected' : ''}>${esc(c.name)}</option>`,
    ),
  ].join('')
  return `
    <label for="b-client">${STRINGS.budgetClient} *</label>
    <select id="b-client" name="client" data-action="b-client-select">
      ${options}
    </select>
  `
}

function issuerSelector(app: App, budget: Budget): string {
  const options = app.issuers.length
    ? app.issuers
        .map(
          (i) =>
            `<option value="${esc(i.id)}"${i.id === (budget.issuerSnapshot?.issuerId ?? app.activeIssuerId) ? ' selected' : ''}>${esc(i.name)}</option>`,
        )
        .join('')
    : `<option value="">${STRINGS.issuersEmpty}</option>`
  return `
    <label for="b-issuer">${STRINGS.usarEmisor}</label>
    <select id="b-issuer" name="issuerId" data-action="b-issuer-select">
      ${options}
    </select>
  `
}

function renderRefreshIssuer(app: App, budget: Budget): string {
  const isEdit = app.isExistingEdit || budget.number > 0
  if (!isEdit) return ''
  const snapIssuerId = budget.issuerSnapshot?.issuerId
  if (!snapIssuerId) return ''
  const issuerExists = app.issuers.some((i) => i.id === snapIssuerId)
  if (!issuerExists) {
    return `<p class="quiet">${STRINGS.refreshIssuerNoProfile}</p>`
  }
  return `<button type="button" class="btn btn-info btn-sm" data-action="budget-refresh-issuer">${STRINGS.refreshIssuer}</button>`
}

function derivePaymentMode(paymentTerms: string): string {
  if (paymentTerms === '') {
    return ''
  }
  return PAYMENT_PRESETS.includes(paymentTerms) ? paymentTerms : PAYMENT_CUSTOM_VALUE
}

function paymentMode(budget: Budget): string {
  return budget.paymentMode ?? derivePaymentMode(budget.paymentTerms)
}

function paymentSelector(budget: Budget): string {
  const mode = paymentMode(budget)
  const options = [
    `<option value="">${STRINGS.paymentOption}</option>`,
    ...PAYMENT_PRESETS.map(
      (p) => `<option value="${esc(p)}"${p === mode ? ' selected' : ''}>${esc(p)}</option>`,
    ),
    `<option value="${PAYMENT_CUSTOM_VALUE}"${mode === PAYMENT_CUSTOM_VALUE ? ' selected' : ''}>${STRINGS.paymentCustom}</option>`,
  ].join('')
  const custom =
    mode === PAYMENT_CUSTOM_VALUE
      ? `
      <label for="b-payment-custom">${STRINGS.budgetPaymentCustom}</label>
      <input id="b-payment-custom" name="paymentCustom" type="text" value="${esc(budget.paymentTerms)}" />`
      : ''
  return `
    <label for="b-payment-mode">${STRINGS.budgetPaymentTerms}</label>
    <select id="b-payment-mode" name="paymentMode" data-action="b-payment-mode-change">
      ${options}
    </select>
    ${custom}
  `
}

function isInsuranceAdjustment(budget: Budget): boolean {
  return budget.pricingMode === 'insurance-adjustment'
}

function orderButton(action: string, param: string, direction: 'up' | 'down', disabled: boolean, label: string): string {
  const arrow = direction === 'up' ? '↑' : '↓'
  return `<button type="button" class="btn btn-secondary btn-sm order-btn" data-action="${action}" data-param="${esc(param)}" aria-label="${esc(label)}" title="${esc(label)}"${disabled ? ' disabled' : ''}>${arrow}</button>`
}

function itemRow(sectionId: string, item: BudgetItem, itemIndex: number, itemCount: number): string {
  const monto = Math.round(item.quantity * item.unitPrice * 100)
  const param = `${sectionId}::${item.id}`
  return `
    <tr class="quote-item-row" data-id="${item.id}">
      <td class="quote-item-number"></td>
      <td class="quote-item-description"><strong>${esc(item.description) || '—'}</strong></td>
      <td>${UNIT_LABELS[item.unit] ?? item.unit}</td>
      <td class="numeric">${item.quantity}</td>
      <td class="numeric">${formatCLP(Math.round(item.unitPrice * 100))}</td>
      <td class="numeric">${formatCLP(monto)}</td>
      <td>${esc(item.observation) || '—'}</td>
      <td class="quote-row-actions">
        <span class="order-controls" aria-label="Ordenar partida">
          ${orderButton('item-up', param, 'up', itemIndex === 0, 'Subir partida')}
          ${orderButton('item-down', param, 'down', itemIndex === itemCount - 1, 'Bajar partida')}
        </span>
        <button type="button" class="btn btn-secondary btn-sm" data-action="item-edit" data-param="${esc(param)}">Editar</button>
        <button type="button" class="btn btn-danger btn-sm" data-action="item-del" data-param="${esc(param)}">${STRINGS.eliminar}</button>
      </td>
    </tr>
  `
}

function sectionCard(section: BudgetSection, sectionIndex: number, sectionCount: number): string {
  const grouped = new Map<string, BudgetItem[]>()
  for (const item of section.items) {
    const groupName = item.groupName?.trim() || 'General'
    grouped.set(groupName, [...(grouped.get(groupName) ?? []), item])
  }
  const columnCount = 8
  const groupEntries = Array.from(grouped.entries())
  const rows = groupEntries.map(([groupName, items], groupIndex) => `
    <tr class="quote-group-row"><td>${sectionIndex + 1}.${groupIndex + 1}</td><td colspan="${columnCount - 1}">
      <div class="quote-group-heading"><span>${esc(groupName)}</span><span class="order-controls" aria-label="Ordenar subpartida">
        ${orderButton('group-up', `${section.id}::${encodeURIComponent(groupName)}`, 'up', groupIndex === 0, 'Subir subpartida')}
        ${orderButton('group-down', `${section.id}::${encodeURIComponent(groupName)}`, 'down', groupIndex === groupEntries.length - 1, 'Bajar subpartida')}
      </span></div>
    </td></tr>
    ${items.map((item, itemIndex) => itemRow(section.id, item, itemIndex, items.length)).join('')}
  `).join('')
  const hasWorkDetails = section.workDetails && section.workDetails.length > 0
  const hasGlobal = section.globalAmount != null && section.globalAmount > 0
  const hasItems = section.items.length > 0

  let workDetailsHtml = ''
  if (hasWorkDetails) {
    const items = section.workDetails!.map((wd) => `<li>${esc(wd.description)}</li>`).join('')
    workDetailsHtml = `
      <div class="section-work-details">
        <strong>${STRINGS.sectionWorkDetails}</strong>
        <ul>${items}</ul>
      </div>
    `
  }

  let globalHtml = ''
  if (hasGlobal) {
    const label = section.globalLabel || STRINGS.sectionGlobalAmount
    globalHtml = `
      <div class="section-global-amount">
        <span>${esc(label)}</span>
        <strong>${formatCLP(Math.round(section.globalAmount! * 100))}</strong>
      </div>
    `
  }

  const itemsHtml = hasItems
    ? `<div class="quote-table-wrap"><table class="quote-items-table">
        <thead><tr><th>N.º</th><th>Partida</th><th>Un.</th><th>Cant.</th><th>P. unitario</th><th>P. total</th><th>Obs.</th><th><span class="sr-only">Acciones</span></th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`
    : `<p class="empty section-empty">${STRINGS.sectionEmptyItems}</p>`

  return `
    <div class="card section-card" data-id="${esc(section.id)}">
      <div class="section-header">
        <div class="section-title"><span class="section-number">${sectionIndex + 1}</span><strong>${esc(section.name)}</strong></div>
        <div class="card-actions">
          <span class="order-controls" aria-label="Ordenar sección">
            ${orderButton('section-up', section.id, 'up', sectionIndex === 0, 'Subir sección')}
            ${orderButton('section-down', section.id, 'down', sectionIndex === sectionCount - 1, 'Bajar sección')}
          </span>
          <button type="button" class="btn btn-secondary btn-sm" data-action="section-edit" data-param="${esc(section.id)}">${STRINGS.editSectionTitle}</button>
          <button type="button" class="btn btn-danger btn-sm" data-action="section-del" data-param="${esc(section.id)}">${STRINGS.eliminarSeccion}</button>
        </div>
      </div>
      ${workDetailsHtml}
      ${globalHtml}
      ${itemsHtml}
      <div class="section-footer">
        <button type="button" class="btn btn-secondary btn-block" data-action="item-new" data-param="${esc(section.id)}">${STRINGS.addItem}</button>
        <div class="section-subtotal"><span>${STRINGS.sectionSubtotal}</span><strong>${formatCLP(sectionSubtotalCents(section))}</strong></div>
      </div>
    </div>
  `
}

function sectionsEditor(app: App): string {
  const budget = currentBudget(app)
  const rows = budget.sections.length
    ? budget.sections.map((section, index) => sectionCard(section, index, budget.sections.length)).join('')
    : `<p class="empty">${STRINGS.sectionsEmpty}</p>`
  return `
    <div class="work-table-heading">
      <label for="b-work-table-title">Título del detalle</label>
      <input id="b-work-table-title" name="workTableTitle" type="text" value="${esc(budget.workTableTitle ?? 'Trabajos a realizar')}" />
    </div>
    <h3>${STRINGS.budgetSections}</h3>
    <div class="sections-list">${rows}</div>
    <button type="button" class="btn btn-secondary btn-block" data-action="section-new">${STRINGS.addSection}</button>
  `
}

function firmaSelector(app: App, budget: Budget): string {
  const issuer = app.issuers.find((i) => i.id === budget.issuerSnapshot?.issuerId) ?? app.issuers.find((i) => i.id === app.activeIssuerId)
  const hasSavedSignature = Boolean(issuer?.signatureDataUrl)
  const mode = budget.signatureMode ?? 'none'
  const opts = [
    `<option value="none"${mode === 'none' ? ' selected' : ''}>${STRINGS.firmaSinFirma}</option>`,
    `<option value="manual"${mode === 'manual' ? ' selected' : ''}>${STRINGS.firmaManual}</option>`,
    hasSavedSignature
      ? `<option value="saved"${mode === 'saved' ? ' selected' : ''}>${STRINGS.firmaGuardada}</option>`
      : '',
  ].join('')
  return `
    <label for="b-firma">${STRINGS.firmaLabel}</label>
    <select id="b-firma" name="signatureMode" data-action="b-firma-select">
      ${opts}
    </select>
  `
}

function stickyTotal(budget: Budget): string {
  if (isInsuranceAdjustment(budget)) {
    const totals = calculateInsuranceTotals(
      budgetAdjustedSubtotalCents(budget),
      budget.overheadRate ?? 25,
      budget.ivaRate,
      budget.ufValue ?? 0,
      budget.deductibleUf ?? 0,
    )
    return `
      <div class="sticky-total insurance-total is-expanded" data-sticky-total>
        <button type="button" class="sticky-total-summary" data-action="total-toggle">
          <span class="sticky-total-label">Pérdida indemnizable</span>
          <span class="sticky-total-value" data-t="indemnizable">${formatCLP(totals.indemnizableLoss)}</span>
          <span class="sticky-total-chevron" data-total-chevron>▾</span>
        </button>
        <div class="sticky-total-detail">
          <div class="totals-row"><span>Costo directo</span><span data-t="insurance-direct">${formatCLP(totals.directCost)}</span></div>
          <div class="totals-row"><span>GG y utilidad (${budget.overheadRate ?? 25}%)</span><span data-t="insurance-overhead">${formatCLP(totals.overhead)}</span></div>
          <div class="totals-row"><span>Costo neto</span><span data-t="insurance-net">${formatCLP(totals.netCost)}</span></div>
          <div class="totals-row"><span>IVA (${budget.ivaRate}%)</span><span data-t="insurance-iva">${formatCLP(totals.iva)}</span></div>
          <div class="totals-row totals-total"><span>Total</span><span data-t="insurance-total">${formatCLP(totals.adjustedTotal)}</span></div>
          <div class="totals-row"><span>Equivalencia</span><span data-t="insurance-uf">${totals.ufEquivalent == null ? 'Ingresa valor UF' : `${totals.ufEquivalent.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UF`}</span></div>
          <div class="totals-row"><span>Deducible (${totals.deductibleUf.toLocaleString('es-CL')} UF)</span><span data-t="insurance-deductible">${formatCLP(totals.deductible)}</span></div>
        </div>
      </div>
    `
  }
  const totals = calcularTotales(
    budget.sections.map((s) => sectionSubtotalCents(s)),
    budget.discount,
    budget.ivaRate,
  )
  const hasDiscount = budget.discount > 0
  return `
    <div class="sticky-total" data-sticky-total>
      <button type="button" class="sticky-total-summary" data-action="total-toggle">
        <span class="sticky-total-label">${STRINGS.totalCotizacion}</span>
        <span class="sticky-total-value" data-t="total">${formatCLP(totals.total)}</span>
        <span class="sticky-total-chevron" data-total-chevron>▸</span>
      </button>
      <div class="sticky-total-detail">
        <div class="totals-row"><span>${STRINGS.subtotalLabel}</span><span data-t="subtotal">${formatCLP(totals.subtotal)}</span></div>
        <div class="totals-row" data-discount-row${hasDiscount ? '' : ' style="display:none"'}><span>${STRINGS.descuentoLabel}</span><span data-t="discount">${formatCLP(totals.discount)}</span></div>
        <div class="totals-row"><span>${STRINGS.baseImponibleLabel}</span><span data-t="base">${formatCLP(totals.baseImponible)}</span></div>
        <div class="totals-row"><span>${STRINGS.ivaLabel}</span><span data-t="iva">${formatCLP(totals.iva)}</span></div>
        <div class="totals-row totals-total"><span>${STRINGS.totalLabel}</span><span data-t="total">${formatCLP(totals.total)}</span></div>
      </div>
    </div>
  `
}

function sectionForm(editingSection: BudgetSection | null, isNew: boolean): string {
  const suggestions = isNew
    ? SECTION_SUGGESTIONS.map(
        (s) =>
          `<button type="button" class="chip" data-action="section-suggest" data-param="${esc(s)}">${esc(s)}</button>`,
      ).join('')
    : ''
  const workDetails = editingSection?.workDetails ?? []
  const workDetailRows = workDetails.map((wd, i) => `
    <div class="work-detail-row">
      <input type="text" name="workDetail_${i}" value="${esc(wd.description)}" placeholder="${STRINGS.sectionWorkPlaceholder}" />
      <button type="button" class="btn btn-danger btn-sm" data-action="work-detail-remove" data-param="${i}">✕</button>
    </div>
  `).join('')
  const globalAmount = editingSection?.globalAmount ?? ''
  const globalLabel = editingSection?.globalLabel ?? ''
  return `
    <div class="sheet-overlay">
      <div class="sheet" role="dialog" aria-modal="true">
        <form class="form section-form" data-section-form>
          <h3>${isNew ? STRINGS.newSectionTitle : STRINGS.editSectionTitle}</h3>
          <label for="sec-name">${STRINGS.sectionNameLabel} *</label>
          <input id="sec-name" name="sectionName" type="text" value="${esc(editingSection?.name ?? '')}" />
          <span class="form-msg" data-msg="sectionName"></span>
          ${isNew ? `<div class="chips">${suggestions}</div>` : ''}
          <fieldset class="section-fieldset">
            <legend>${STRINGS.sectionWorkDetails}</legend>
            <div id="work-details-list">${workDetailRows || '<p class="empty">Sin detalles aún.</p>'}</div>
            <button type="button" class="btn btn-secondary btn-sm" data-action="work-detail-add">+ ${STRINGS.sectionAddWork}</button>
          </fieldset>
          <fieldset class="section-fieldset">
            <legend>${STRINGS.sectionGlobalAmount}</legend>
            <label for="sec-global-label">${STRINGS.sectionGlobalLabel}</label>
            <input id="sec-global-label" name="globalLabel" type="text" value="${esc(globalLabel)}" placeholder="Ej: Mano de obra, Instalación..." />
            <label for="sec-global-amount">${STRINGS.sectionGlobalAmount}</label>
            <input id="sec-global-amount" name="globalAmount" type="number" inputmode="decimal" step="any" min="0" value="${globalAmount}" />
          </fieldset>
          <div class="row-actions">
            <button type="submit" class="btn btn-primary">${isNew ? STRINGS.crearSeccion : STRINGS.guardarSeccion}</button>
            <button type="button" class="btn btn-secondary" data-action="section-cancel">${STRINGS.cancel}</button>
          </div>
        </form>
      </div>
    </div>
  `
}

function itemForm(editing: BudgetItem | null): string {
  const item = editing ?? {
    id: 'new',
    description: '',
    type: 'material' as ItemType,
    quantity: 1,
    unit: 'unidad' as const,
    unitPrice: 0,
  }
  const unitOptions = UNITS.map(
    (u) => `<option value="${u}"${u === item.unit ? ' selected' : ''}>${UNIT_LABELS[u]}</option>`,
  ).join('')
  return `
    <div class="sheet-overlay">
      <div class="sheet" role="dialog" aria-modal="true">
        <form class="form item-form" data-item-form>
          <h3>${editing ? STRINGS.editItemTitle : STRINGS.nuevoItemTitle}</h3>
          <label for="it-desc">${STRINGS.itemDescription} *</label>
          <div class="autocomplete-wrap">
            <input id="it-desc" name="description" type="text" value="${esc(item.description)}" autocomplete="off" />
            <div class="autocomplete-list" id="it-catalog-suggestions"></div>
          </div>
          <span class="form-msg" data-msg="description"></span>
          <label for="it-group">Elemento o subpartida</label>
          <input id="it-group" name="groupName" type="text" value="${esc(item.groupName)}" list="item-group-suggestions" placeholder="Ej: Cielo, Muro, Piso" />
          <datalist id="item-group-suggestions"><option value="Cielo"></option><option value="Muro"></option><option value="Piso"></option><option value="Cubierta de techumbre"></option><option value="Obras anexas"></option></datalist>
          <div class="field-grid">
            <div>
              <label for="it-qty">${STRINGS.itemQuantity} *</label>
              <input id="it-qty" name="quantity" type="number" inputmode="decimal" step="any" min="0" value="${item.quantity}" />
            </div>
            <div>
              <label for="it-unit">${STRINGS.itemUnit}</label>
              <select id="it-unit" name="unit">${unitOptions}</select>
            </div>
            <div>
              <label for="it-price">${STRINGS.itemUnitPrice} *</label>
              <input id="it-price" name="unitPrice" type="number" inputmode="decimal" step="any" min="0" value="${item.unitPrice}" />
              <span class="form-msg" data-t="price-msg"></span>
            </div>
          </div>
          <label for="it-observation">Observación</label>
          <input id="it-observation" name="observation" type="text" value="${esc(item.observation)}" placeholder="Opcional" />
          <div class="row-actions">
            <button type="submit" class="btn btn-primary">${STRINGS.guardarItem}</button>
            <button type="button" class="btn btn-secondary" data-action="item-cancel">${STRINGS.cancelarItem}</button>
            <button type="button" class="btn btn-secondary btn-sm" data-action="item-save-catalog">${STRINGS.catalogSaveFromItem}</button>
          </div>
        </form>
      </div>
    </div>
  `
}

export function renderPresupuesto(app: App): string {
  if (document.querySelector('[name="jobname"]')) {
    syncBudgetFields(app)
  }
  const budget = currentBudget(app)
  const showSectionForm = app.editingSectionId !== null
  const editingSection = budget.sections.find((s) => s.id === app.editingSectionId) ?? null
  const showItemForm = app.editingItemId !== null
  const editingItem =
    showItemForm && app.editingItemSectionId !== null
      ? budget.sections.find((s) => s.id === app.editingItemSectionId)?.items.find(
          (i) => i.id === app.editingItemId,
        ) ?? null
      : null
  const header =
    app.isExistingEdit || budget.number > 0
      ? `Cotización N.º ${String(budget.number).padStart(4, '0')}`
      : STRINGS.budgetTitle
  return `
    <section class="view">
      <div class="view-header">
        <button type="button" class="btn btn-secondary btn-sm" data-action="budget-back">${STRINGS.goBack}</button>
        <h2>${header}</h2>
      </div>
      <form class="form" data-form="budget">
        ${clientSelector(app, budget)}
        <span class="form-msg" data-msg="client"></span>

        ${issuerSelector(app, budget)}
        <span class="form-msg" data-msg="issuer"></span>
        ${renderRefreshIssuer(app, budget)}

        <label for="b-jobname">${STRINGS.budgetJobName}</label>
        <input id="b-jobname" name="jobname" type="text" value="${esc(budget.jobName)}" />

        <label for="b-jobaddress">${STRINGS.budgetJobAddress}</label>
        <input id="b-jobaddress" name="jobaddress" type="text" value="${esc(budget.jobAddress)}" />

        <fieldset class="insurance-mode-panel">
          <legend>Tipo de cálculo</legend>
          <label for="b-pricing-mode">Formato de cotización</label>
          <select id="b-pricing-mode" name="pricingMode" data-action="pricing-mode-change">
            <option value="standard"${!isInsuranceAdjustment(budget) ? ' selected' : ''}>Cotización normal</option>
            <option value="insurance-adjustment"${isInsuranceAdjustment(budget) ? ' selected' : ''}>Ajuste de seguro</option>
          </select>
          <p class="field-help">El modo seguro agrega UF, deducible y pérdida indemnizable. No modifica cotizaciones anteriores.</p>
          ${isInsuranceAdjustment(budget) ? `
            <div class="insurance-settings">
              <div><label for="b-overhead">GG y utilidad (%)</label><input id="b-overhead" name="overheadRate" type="number" inputmode="decimal" step="0.01" min="0" value="${budget.overheadRate ?? 25}" /></div>
              <div><label for="b-uf-value">Valor UF ($)</label><input id="b-uf-value" name="ufValue" type="number" inputmode="decimal" step="0.01" min="0" value="${budget.ufValue || ''}" placeholder="Ej: 40876,41" /></div>
              <div><label for="b-uf-date">Fecha conversión</label><input id="b-uf-date" name="ufConversionDate" type="date" value="${esc(budget.ufConversionDate)}" /></div>
              <div><label for="b-deductible">Deducible (UF)</label><input id="b-deductible" name="deductibleUf" type="number" inputmode="decimal" step="0.01" min="0" value="${budget.deductibleUf ?? 0}" /></div>
            </div>` : ''}
        </fieldset>

        <div class="field-grid">
          <div>
            <label for="b-discount">${STRINGS.budgetDiscount}</label>
            <input id="b-discount" name="discount" type="text" inputmode="numeric" value="${esc(budget.discount ? String(budget.discount / 100) : '')}" />
          </div>
          <div>
            <label for="b-iva">${STRINGS.budgetIva}</label>
            <input id="b-iva" name="iva" type="number" inputmode="decimal" step="any" min="0" max="100" value="${budget.ivaRate}" />
          </div>
        </div>
        <span class="form-msg" data-msg="discount"></span>

        ${paymentSelector(budget)}

        <label for="b-validity-value">${STRINGS.budgetValidity}</label>
        <div class="validity-row">
          <input id="b-validity-value" name="validityValue" type="number" inputmode="numeric" min="1" max="999" value="${budget.validityValue ?? 15}" />
          <select id="b-validity-unit" name="validityUnit">
            <option value="days"${(budget.validityUnit ?? 'days') === 'days' ? ' selected' : ''}>días</option>
            <option value="months"${budget.validityUnit === 'months' ? ' selected' : ''}>meses</option>
          </select>
        </div>

        <label for="b-execution-time-value">${STRINGS.budgetExecutionTime}</label>
        <div class="validity-row">
          <input id="b-execution-time-value" name="executionTimeValue" type="number" inputmode="numeric" min="1" max="999" value="${budget.executionTimeValue ?? ''}" placeholder="Opcional" />
          <select id="b-execution-time-unit" name="executionTimeUnit">
            <option value="days"${(budget.executionTimeUnit ?? 'days') === 'days' ? ' selected' : ''}>días</option>
            <option value="weeks"${budget.executionTimeUnit === 'weeks' ? ' selected' : ''}>semanas</option>
            <option value="months"${budget.executionTimeUnit === 'months' ? ' selected' : ''}>meses</option>
          </select>
        </div>

        <label for="b-notes">${STRINGS.budgetNotes}</label>
        <textarea id="b-notes" name="notes" rows="3">${esc(budget.notes)}</textarea>

        ${sectionsEditor(app)}

        ${firmaSelector(app, budget)}
      </form>

      ${stickyTotal(budget)}

      ${showSectionForm ? sectionForm(editingSection, app.editingSectionId === 'new') : ''}
      ${showItemForm ? itemForm(editingItem) : ''}

      <div class="save-actions">
        <button type="button" class="btn btn-primary btn-block" data-action="budget-save">${STRINGS.guardarCotizacion}</button>
        <button type="button" class="btn btn-secondary btn-block" data-action="budget-draft">${STRINGS.guardarBorrador}</button>
      </div>
      <div class="budget-errors" data-errors role="alert"></div>
      <div class="sticky-spacer"></div>
    </section>
  `
}

function syncBudgetFields(app: App): void {
  const budget = currentBudget(app)
  const value = (name: string): string =>
    (document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)?.value ?? '').trim()

  budget.jobName = value('jobname')
  budget.jobAddress = value('jobaddress')
  budget.workTableTitle = value('workTableTitle') || 'Trabajos a realizar'
  budget.pricingMode = value('pricingMode') === 'insurance-adjustment' ? 'insurance-adjustment' : 'standard'
  if (document.querySelector('[name="overheadRate"]')) {
    const overheadRate = Number(value('overheadRate'))
    const ufValue = Number(value('ufValue').replace(',', '.'))
    const deductibleUf = Number(value('deductibleUf').replace(',', '.'))
    budget.overheadRate = Number.isFinite(overheadRate) && overheadRate >= 0 ? overheadRate : 25
    budget.ufValue = Number.isFinite(ufValue) && ufValue >= 0 ? ufValue : 0
    budget.ufConversionDate = value('ufConversionDate') || undefined
    budget.deductibleUf = Number.isFinite(deductibleUf) && deductibleUf >= 0 ? deductibleUf : 0
  }
  syncPayment(budget)
  const validityValueRaw = Number(value('validityValue'))
  budget.validityValue = Number.isFinite(validityValueRaw) && validityValueRaw > 0 ? validityValueRaw : 15
  budget.validityUnit = (value('validityUnit') === 'months' ? 'months' : 'days')
  budget.validity = formatValidityValue(budget.validityValue, budget.validityUnit)

  const execValueRaw = Number(value('executionTimeValue'))
  if (Number.isFinite(execValueRaw) && execValueRaw > 0) {
    budget.executionTimeValue = execValueRaw
    const rawUnit = value('executionTimeUnit')
    budget.executionTimeUnit = (rawUnit === 'weeks' ? 'weeks' : rawUnit === 'months' ? 'months' : 'days')
  } else {
    budget.executionTimeValue = undefined
    budget.executionTimeUnit = undefined
  }

  budget.notes = value('notes')

  const ivaRaw = Number(value('iva'))
  budget.ivaRate = ivaRaw >= 0 && Number.isFinite(ivaRaw) ? ivaRaw : 0

  const discountText = value('discount')
  if (discountText !== '') {
    const cents = textToCents(discountText)
    budget.discount = Number.isNaN(cents) ? budget.discount : cents
  } else {
    budget.discount = 0
  }

  const clientSelect = document.querySelector<HTMLSelectElement>('#b-client')
  if (clientSelect) {
    const clientId = clientSelect.value
    budget.clientId = clientId === '' ? undefined : clientId
    budget.clientSnapshot = clientId === '' ? undefined : snapshotOf(app, clientId)
  }

  const firmaSelect = document.querySelector<HTMLSelectElement>('[name="signatureMode"]')
  if (firmaSelect) {
    const v = firmaSelect.value
    budget.signatureMode = v === 'manual' || v === 'saved' ? v : 'none'
  }
}

function syncPayment(budget: Budget): void {
  const modeSelect = document.querySelector<HTMLSelectElement>('[name="paymentMode"]')
  if (!modeSelect) {
    return
  }
  const mode = modeSelect.value
  budget.paymentMode = mode
  if (mode === '') {
    budget.paymentTerms = ''
  } else if (mode === PAYMENT_CUSTOM_VALUE) {
    budget.paymentTerms = (
      document.querySelector<HTMLInputElement>('[name="paymentCustom"]')?.value ?? ''
    ).trim()
  } else {
    budget.paymentTerms = mode
  }
}

function readBudgetFields(app: App): Budget {
  const budget = currentBudget(app)
  syncBudgetFields(app)
  budget.updatedAt = new Date().toISOString()
  return budget
}

function updateTotals(app: App): void {
  const budget = currentBudget(app)
  if (isInsuranceAdjustment(budget)) {
    const readNumber = (name: string, fallback: number): number => {
      const raw = document.querySelector<HTMLInputElement>(`[name="${name}"]`)?.value.replace(',', '.') ?? ''
      const parsed = Number(raw)
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
    }
    const ivaRate = readNumber('iva', budget.ivaRate)
    const overheadRate = readNumber('overheadRate', budget.overheadRate ?? 25)
    const ufValue = readNumber('ufValue', budget.ufValue ?? 0)
    const deductibleUf = readNumber('deductibleUf', budget.deductibleUf ?? 0)
    const totals = calculateInsuranceTotals(
      budgetAdjustedSubtotalCents(budget), overheadRate, ivaRate, ufValue, deductibleUf,
    )
    const set = (key: string, value: string) => {
      document.querySelectorAll<HTMLElement>(`[data-t="${key}"]`).forEach((node) => { node.textContent = value })
    }
    set('insurance-direct', formatCLP(totals.directCost))
    set('insurance-overhead', formatCLP(totals.overhead))
    set('insurance-net', formatCLP(totals.netCost))
    set('insurance-iva', formatCLP(totals.iva))
    set('insurance-total', formatCLP(totals.adjustedTotal))
    set('insurance-uf', totals.ufEquivalent == null ? 'Ingresa valor UF' : `${totals.ufEquivalent.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UF`)
    set('insurance-deductible', formatCLP(totals.deductible))
    set('indemnizable', formatCLP(totals.indemnizableLoss))
    return
  }
  const subtotal = budgetSubtotalCents(budget)
  const discountText = (
    document.querySelector<HTMLInputElement>('[name="discount"]')?.value ?? ''
  ).trim()
  const discountCents = discountText === '' ? 0 : textToCents(discountText)
  const ivaRaw = Number(document.querySelector<HTMLInputElement>('[name="iva"]')?.value ?? '19')
  const ivaRate = ivaRaw >= 0 && Number.isFinite(ivaRaw) ? ivaRaw : 0
  const effectiveDiscount = Number.isNaN(discountCents) ? budget.discount : discountCents
  const totals = calcularTotales([subtotal], effectiveDiscount, ivaRate)
  const set = (key: string, value: string) => {
    const node = document.querySelector<HTMLElement>(`[data-t="${key}"]`)
    if (node) {
      node.textContent = value
    }
  }
  set('subtotal', formatCLP(totals.subtotal))
  set('discount', formatCLP(totals.discount))
  set('base', formatCLP(totals.baseImponible))
  set('iva', formatCLP(totals.iva))
  set('total', formatCLP(totals.total))
  const discountRow = document.querySelector<HTMLElement>('[data-discount-row]')
  if (discountRow) {
    discountRow.style.display = effectiveDiscount > 0 ? '' : 'none'
  }
}

function splitItemParam(param?: string): [string | undefined, string | undefined] {
  if (!param) {
    return [undefined, undefined]
  }
  const idx = param.indexOf('::')
  if (idx === -1) {
    return [param, undefined]
  }
  return [param.slice(0, idx), param.slice(idx + 2)]
}

function moveEntry<T>(entries: T[], from: number, to: number): T[] {
  if (from < 0 || to < 0 || from >= entries.length || to >= entries.length || from === to) {
    return entries
  }
  const reordered = [...entries]
  const [entry] = reordered.splice(from, 1)
  reordered.splice(to, 0, entry)
  return reordered
}

function reorderSection(app: App, sectionId: string | undefined, offset: -1 | 1): void {
  if (!sectionId) return
  syncBudgetFields(app)
  const budget = currentBudget(app)
  const index = budget.sections.findIndex((section) => section.id === sectionId)
  budget.sections = moveEntry(budget.sections, index, index + offset)
  app.render()
}

function reorderGroup(app: App, param: string | undefined, offset: -1 | 1): void {
  const [sectionId, encodedGroup] = splitItemParam(param)
  if (!sectionId || encodedGroup == null) return
  syncBudgetFields(app)
  const budget = currentBudget(app)
  const section = budget.sections.find((entry) => entry.id === sectionId)
  if (!section) return
  const groupName = decodeURIComponent(encodedGroup)
  const grouped = new Map<string, BudgetItem[]>()
  for (const item of section.items) {
    const name = item.groupName?.trim() || 'General'
    grouped.set(name, [...(grouped.get(name) ?? []), item])
  }
  const entries = Array.from(grouped.entries())
  const index = entries.findIndex(([name]) => name === groupName)
  section.items = moveEntry(entries, index, index + offset).flatMap(([, items]) => items)
  app.render()
}

function reorderItem(app: App, param: string | undefined, offset: -1 | 1): void {
  const [sectionId, itemId] = splitItemParam(param)
  if (!sectionId || !itemId) return
  syncBudgetFields(app)
  const budget = currentBudget(app)
  const section = budget.sections.find((entry) => entry.id === sectionId)
  const item = section?.items.find((entry) => entry.id === itemId)
  if (!section || !item) return
  const groupName = item.groupName?.trim() || 'General'
  const groupItems = section.items.filter((entry) => (entry.groupName?.trim() || 'General') === groupName)
  const groupIndex = groupItems.findIndex((entry) => entry.id === itemId)
  const target = groupItems[groupIndex + offset]
  if (!target) return
  const from = section.items.findIndex((entry) => entry.id === itemId)
  const to = section.items.findIndex((entry) => entry.id === target.id)
  section.items = moveEntry(section.items, from, to)
  app.render()
}

function applyCatalogItem(catItem: CatalogItem, doc: Document): void {
  const desc = doc.getElementById('it-desc') as HTMLInputElement | null
  const qty = doc.getElementById('it-qty') as HTMLInputElement | null
  const unit = doc.getElementById('it-unit') as HTMLSelectElement | null
  const price = doc.getElementById('it-price') as HTMLInputElement | null
  const type = doc.getElementById('it-type') as HTMLSelectElement | null
  if (desc) desc.value = catItem.name
  if (qty) qty.value = '1'
  if (unit) unit.value = catItem.unit
  if (price) price.value = String(catItem.unitPrice)
  const typeMap: Record<string, string> = {
    'material': 'material',
    'mano-de-obra': 'mano-de-obra',
    'servicio': 'servicio',
    'otro': 'otro',
  }
  if (type) type.value = typeMap[catItem.category] ?? 'otro'
}

export function bind(budgetForm: HTMLFormElement, app: App): void {
  const container = budgetForm.ownerDocument.getElementById('view') ?? budgetForm
  const markDirty = (): void => {
    app.dirty = true
  }
  container.addEventListener('input', markDirty)
  container.addEventListener('change', markDirty)
  container.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-action]')
    const action = target?.dataset.action
    if (action && !NON_DIRTY_ACTIONS.has(action)) {
      markDirty()
    }
  })

  budgetForm.addEventListener('input', (event) => {
    const target = event.target as HTMLElement
    if (target.matches('[name="discount"], [name="iva"], [name="overheadRate"], [name="ufValue"], [name="deductibleUf"]')) {
      updateTotals(app)
    }
  })

  const doc = budgetForm.ownerDocument
  const itemFormEl = doc.querySelector<HTMLFormElement>('[data-item-form]')
  itemFormEl?.addEventListener('submit', (event) => {
    event.preventDefault()
    handlers['item-save'](app)
  })

  // Autocomplete for catalog items
  const descInput = doc.getElementById('it-desc') as HTMLInputElement | null
  const suggestionsEl = doc.getElementById('it-catalog-suggestions') as HTMLDivElement | null
  if (descInput && suggestionsEl) {
    let activeIdx = -1
    const showSuggestions = (search: string) => {
      if (!search || search.length < 2) {
        suggestionsEl.innerHTML = ''
        suggestionsEl.style.display = 'none'
        return
      }
      const s = search.toLowerCase()
      const matches = app.state.catalog
        .filter((i) => i.name.toLowerCase().includes(s) || i.description?.toLowerCase().includes(s))
        .slice(0, 8)
      if (matches.length === 0) {
        suggestionsEl.innerHTML = ''
        suggestionsEl.style.display = 'none'
        return
      }
      activeIdx = -1
      suggestionsEl.innerHTML = matches.map((i, idx) => `
        <div class="autocomplete-item" data-catalog-idx="${idx}" data-catalog-id="${esc(i.id)}">
          <span class="ac-name">${esc(i.name)}</span>
          <span class="ac-meta">${esc(UNIT_LABELS[i.unit])} · ${formatCLP(Math.round(i.unitPrice * 100))}</span>
        </div>
      `).join('')
      suggestionsEl.style.display = 'block'
      suggestionsEl.querySelectorAll('.autocomplete-item').forEach((el) => {
        el.addEventListener('mousedown', (e) => {
          e.preventDefault()
          const id = (el as HTMLElement).dataset.catalogId
          const catItem = app.state.catalog.find((i) => i.id === id)
          if (catItem) applyCatalogItem(catItem, doc)
        })
      })
    }
    descInput.addEventListener('input', () => showSuggestions(descInput.value))
    descInput.addEventListener('focus', () => showSuggestions(descInput.value))
    descInput.addEventListener('blur', () => {
      setTimeout(() => { suggestionsEl.style.display = 'none' }, 150)
    })
    descInput.addEventListener('keydown', (e) => {
      const items = suggestionsEl.querySelectorAll('.autocomplete-item')
      if (!items.length) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        activeIdx = Math.min(activeIdx + 1, items.length - 1)
        items.forEach((el, i) => el.classList.toggle('ac-active', i === activeIdx))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        activeIdx = Math.max(activeIdx - 1, 0)
        items.forEach((el, i) => el.classList.toggle('ac-active', i === activeIdx))
      } else if (e.key === 'Enter' && activeIdx >= 0) {
        e.preventDefault()
        const id = (items[activeIdx] as HTMLElement).dataset.catalogId
        const catItem = app.state.catalog.find((i) => i.id === id)
        if (catItem) applyCatalogItem(catItem, doc)
      } else if (e.key === 'Escape') {
        suggestionsEl.style.display = 'none'
      }
    })
  }

  const sectionForm = doc.querySelector<HTMLFormElement>('[data-section-form]')
  sectionForm?.addEventListener('submit', (event) => {
    event.preventDefault()
    handlers['section-save'](app)
  })
}

export const handlers: Record<string, (app: App, param?: string) => void> = {
  'budget-back': async (app) => {
    if (app.dirty) {
      const confirmed = await app.confirmDialog(STRINGS.confirmDiscardUnsaved)
      if (!confirmed) {
        return
      }
      app.dirty = false
    }
    app.go('inicio')
  },
  'b-issuer-select': (app) => {
    const select = document.querySelector<HTMLSelectElement>('[name="issuerId"]')
    if (!select) {
      return
    }
    const issuer = app.issuers.find((i) => i.id === select.value)
    if (issuer) {
      void app.selectIssuer(issuer.id)
    }
    const budget = currentBudget(app)
    const before = budget.issuerSnapshot
    if (issuer && (!before || before.issuerId !== issuer.id)) {
      budget.issuerSnapshot = snapshotFromIssuer(issuer)
    }
  },
  'b-client-select': (app) => {
    const select = document.querySelector<HTMLSelectElement>('#b-client')
    if (!select) {
      return
    }
    const budget = currentBudget(app)
    const clientId = select.value
    budget.clientId = clientId === '' ? undefined : clientId
    budget.clientSnapshot = clientId === '' ? undefined : snapshotOf(app, clientId)
    const msg = document.querySelector<HTMLElement>('[data-msg="client"]')
    if (msg) {
      msg.textContent = ''
    }
  },
  'b-payment-mode-change': (app) => {
    app.render()
  },
  'pricing-mode-change': (app) => {
    syncBudgetFields(app)
    app.render()
  },
  'b-firma-select': (app) => {
    const select = document.querySelector<HTMLSelectElement>('[name="signatureMode"]')
    if (!select) {
      return
    }
    const budget = currentBudget(app)
    budget.signatureMode = (select.value === 'manual' || select.value === 'saved' ? select.value : 'none') as Budget['signatureMode']
  },
  'total-toggle': () => {
    const el = document.querySelector<HTMLElement>('[data-sticky-total]')
    if (!el) {
      return
    }
    const expanded = el.classList.toggle('is-expanded')
    const chevron = el.querySelector<HTMLElement>('[data-total-chevron]')
    if (chevron) {
      chevron.textContent = expanded ? '▾' : '▸'
    }
  },
  'budget-save': async (app) => {
    await persistBudget(app, false)
  },
  'budget-draft': async (app) => {
    await persistBudget(app, true)
  },
  'section-new': (app) => {
    app.editingSectionId = 'new'
    app.render()
  },
  'section-up': (app, param) => reorderSection(app, param, -1),
  'section-down': (app, param) => reorderSection(app, param, 1),
  'group-up': (app, param) => reorderGroup(app, param, -1),
  'group-down': (app, param) => reorderGroup(app, param, 1),
  'item-up': (app, param) => reorderItem(app, param, -1),
  'item-down': (app, param) => reorderItem(app, param, 1),
  'section-edit': (app, param) => {
    app.editingSectionId = param ?? null
    app.render()
  },
  'section-cancel': (app) => {
    app.editingSectionId = null
    app.render()
  },
  'section-suggest': (_app, param) => {
    const input = document.querySelector<HTMLInputElement>('[name="sectionName"]')
    if (input && param) {
      input.value = param
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
  },
  'section-save': (app) => {
    const budget = currentBudget(app)
    const form = document.querySelector<HTMLFormElement>('[data-section-form]')
    const name = (form?.querySelector<HTMLInputElement>('[name="sectionName"]')?.value ?? '').trim()
    const validation = validateSectionName(name)
    const msg = form?.querySelector<HTMLElement>('[data-msg="sectionName"]')
    if (!validation.valid) {
      if (msg) {
        msg.textContent = validation.errors[0] ?? ''
      }
      return
    }
    if (msg) {
      msg.textContent = ''
    }
    // Collect work details
    const workDetails: Array<{ id: string; description: string }> = []
    if (form) {
      const wdInputs = form.querySelectorAll<HTMLInputElement>('[name^="workDetail_"]')
      wdInputs.forEach((input) => {
        const desc = input.value.trim()
        if (desc) {
          workDetails.push({ id: crypto.randomUUID(), description: desc })
        }
      })
    }
    // Collect global amount
    const globalLabel = (form?.querySelector<HTMLInputElement>('[name="globalLabel"]')?.value ?? '').trim() || undefined
    const globalAmountRaw = form?.querySelector<HTMLInputElement>('[name="globalAmount"]')?.value ?? ''
    const globalAmount = globalAmountRaw !== '' ? Number(globalAmountRaw) || 0 : undefined

    if (app.editingSectionId === 'new') {
      budget.sections.push({
        id: crypto.randomUUID(),
        name,
        items: [],
        workDetails: workDetails.length > 0 ? workDetails : undefined,
        globalAmount,
        globalLabel,
      })
    } else if (app.editingSectionId) {
      budget.sections = budget.sections.map((s) =>
        s.id === app.editingSectionId
          ? {
              ...s,
              name,
              workDetails: workDetails.length > 0 ? workDetails : undefined,
              globalAmount,
              globalLabel,
            }
          : s,
      )
    }
    app.editingSectionId = null
    app.render()
  },
  'work-detail-add': (_app) => {
    const form = document.querySelector<HTMLFormElement>('[data-section-form]')
    if (!form) return
    const list = form.querySelector<HTMLElement>('#work-details-list')
    if (!list) return
    // Remove empty state message
    const empty = list.querySelector('.empty')
    if (empty) empty.remove()
    const count = list.querySelectorAll('.work-detail-row').length
    const row = document.createElement('div')
    row.className = 'work-detail-row'
    row.innerHTML = `
      <input type="text" name="workDetail_${count}" placeholder="${STRINGS.sectionWorkPlaceholder}" />
      <button type="button" class="btn btn-danger btn-sm" data-action="work-detail-remove" data-param="${count}">✕</button>
    `
    list.appendChild(row)
    row.querySelector('input')?.focus()
  },
  'work-detail-remove': (_app, param) => {
    const form = document.querySelector<HTMLFormElement>('[data-section-form]')
    if (!form || param == null) return
    const list = form.querySelector<HTMLElement>('#work-details-list')
    if (!list) return
    const rows = list.querySelectorAll('.work-detail-row')
    const idx = Number(param)
    if (idx >= 0 && idx < rows.length) {
      rows[idx].remove()
    }
    // Re-index remaining rows
    const remaining = list.querySelectorAll('.work-detail-row')
    remaining.forEach((row, i) => {
      const input = row.querySelector<HTMLInputElement>('input')
      if (input) input.name = `workDetail_${i}`
      const btn = row.querySelector<HTMLButtonElement>('[data-action="work-detail-remove"]')
      if (btn) btn.dataset.param = String(i)
    })
    if (remaining.length === 0) {
      list.innerHTML = `<p class="empty">Sin detalles aún.</p>`
    }
  },
  'section-del': async (app, param) => {
    const budget = currentBudget(app)
    const section = budget.sections.find((s) => s.id === param)
    if (!section) {
      return
    }
    const confirmed = await app.confirmDialog(STRINGS.confirmEliminarSeccion)
    if (!confirmed) {
      return
    }
    budget.sections = budget.sections.filter((s) => s.id !== param)
    if (app.editingSectionId === param) {
      app.editingSectionId = null
    }
    if (app.editingItemSectionId === param) {
      app.editingItemId = null
      app.editingItemSectionId = null
    }
    app.render()
  },
  'item-new': (app, param) => {
    app.editingItemSectionId = param && param !== '' ? param : null
    app.editingItemId = 'new'
    app.render()
  },
  'item-edit': (app, param) => {
    const [sectionId, itemId] = splitItemParam(param)
    app.editingItemSectionId = sectionId ?? null
    app.editingItemId = itemId ?? null
    app.render()
  },
  'item-del': (app, param) => {
    const [sectionId, itemId] = splitItemParam(param)
    const budget = currentBudget(app)
    budget.sections = budget.sections.map((s) =>
      s.id === sectionId ? { ...s, items: s.items.filter((i) => i.id !== itemId) } : s,
    )
    app.render()
  },
  'item-save': (app) => {
    const budget = currentBudget(app)
    const form = document.querySelector<HTMLFormElement>('[data-item-form]')
    if (!form) {
      return
    }
    const data = new FormData(form)
    const description = String(data.get('description') ?? '').trim()
    const quantity = Number(data.get('quantity'))
    const unit = String(data.get('unit') ?? 'unidad') as BudgetItem['unit']
    const typeRaw = String(data.get('type') ?? 'otro')
    const type: ItemType = isItemType(typeRaw) ? typeRaw : 'otro'
    const unitPrice = Number(data.get('unitPrice'))
    const observation = String(data.get('observation') ?? '').trim() || undefined
    const groupName = String(data.get('groupName') ?? '').trim() || undefined

    const sectionId = app.editingItemSectionId
    const isNew = app.editingItemId === 'new' || app.editingItemId === null
    const row: BudgetItem = {
      id: isNew ? crypto.randomUUID() : (app.editingItemId ?? crypto.randomUUID()),
      description,
      type,
      quantity,
      unit,
      unitPrice,
      observation,
      groupName,
    }
    const validation = validateItem(row)
    if (!validation.valid) {
      const descMsg = form.querySelector<HTMLElement>('[data-msg="description"]')
      if (descMsg) {
        descMsg.textContent = validation.errors.find((e) => e.includes('descripción')) ?? ''
      }
      const priceMsg = form.querySelector<HTMLElement>('[data-t="price-msg"]')
      if (priceMsg) {
        priceMsg.textContent = validation.errors.find((e) => e.includes('precio')) ?? ''
      }
      return
    }
    if (!sectionId) {
      return
    }
    budget.sections = budget.sections.map((s) => {
      if (s.id !== sectionId) {
        return s
      }
      if (isNew) {
        return { ...s, items: [...s.items, row] }
      }
      return { ...s, items: s.items.map((i) => (i.id === app.editingItemId ? row : i)) }
    })
    app.editingItemId = null
    app.editingItemSectionId = null
    app.render()
  },
  'item-cancel': (app) => {
    app.editingItemId = null
    app.editingItemSectionId = null
    app.render()
  },
  'item-save-catalog': (app) => {
    const form = document.querySelector<HTMLFormElement>('[data-item-form]')
    if (!form) return
    const data = new FormData(form)
    const description = String(data.get('description') ?? '').trim()
    const unit = String(data.get('unit') ?? 'unidad') as BudgetItem['unit']
    const unitPrice = Number(data.get('unitPrice')) || 0
    const typeRaw = String(data.get('type') ?? 'otro')
    const type: ItemType = isItemType(typeRaw) ? typeRaw : 'otro'
    if (!description) {
      app.toast(STRINGS.itemDescription)
      return
    }
    const catCategory = type === 'mano-de-obra' ? 'mano-de-obra' : type === 'material' ? 'material' : type === 'servicio' ? 'servicio' : 'otro'
    const now = new Date().toISOString()
    const item: CatalogItem = {
      id: crypto.randomUUID(),
      name: description,
      category: catCategory,
      unit,
      unitPrice,
      createdAt: now,
      updatedAt: now,
    }
    app.state.catalog.push(item)
    saveState(app.state)
    app.toast(STRINGS.catalogSaved)
  },
  'budget-refresh-issuer': (app) => {
    const budget = currentBudget(app)
    const snapIssuerId = budget.issuerSnapshot?.issuerId
    if (!snapIssuerId) return
    const issuer = app.issuers.find((i) => i.id === snapIssuerId)
    if (!issuer) {
      app.toast(STRINGS.refreshIssuerNoProfile)
      return
    }
    app.editingBudget = refreshIssuerSnapshot(budget, issuer)
    app.toast(STRINGS.refreshIssuerDone)
    app.render()
  },
}

async function persistBudget(app: App, asDraft: boolean): Promise<void> {
  const budget = readBudgetFields(app)
  app.editingBudget = budget
  const clientOk = Boolean(budget.clientSnapshot)
  const errorsNode = document.querySelector<HTMLElement>('[data-errors]')

  if (!asDraft) {
    const validation = validateBudget(clientOk, budget.sections)
    if (!validation.valid) {
      if (errorsNode) {
        errorsNode.textContent = validation.errors.join(' · ')
      }
      return
    }
  }
  if (errorsNode) {
    errorsNode.textContent = ''
  }

  const now = new Date().toISOString()
  budget.isDraft = asDraft ? true : Boolean(budget.isDraft)
  budget.updatedAt = now

  // Asegurar issuerSnapshot con el emisor activo
  if (!budget.issuerSnapshot) {
    const issuer = app.issuers.find((i) => i.id === app.activeIssuerId)
    if (issuer) {
      budget.issuerSnapshot = snapshotFromIssuer(issuer)
    }
  }
  const toStore = (value: Budget): Budget => {
    const clean = structuredClone(value)
    delete (clean as Record<string, unknown>).paymentMode
    return clean
  }
  const clean = toStore(budget)

  if (budget.number === 0) {
    budget.number = await app.allocateNumber()
    budget.date = now
    budget.createdAt = now
    clean.number = budget.number
    clean.date = now
    clean.createdAt = now
    await saveQuote(clean, app.uid!)
    const existing = app.state.budgets.findIndex((b) => b.id === clean.id)
    if (existing !== -1) {
      app.state.budgets[existing] = clean
    } else {
      app.state.budgets.push(clean)
    }
    app.dirty = false
    app.toast(asDraft ? STRINGS.budgetDraftSaved : STRINGS.budgetSaved)
    app.go('inicio')
    return
  }

  const index = app.state.budgets.findIndex((b) => b.id === clean.id)
  if (index !== -1) {
    app.state.budgets[index] = clean
  } else {
    app.state.budgets.push(clean)
  }
  await saveQuote(clean, app.uid!)
  app.dirty = false
  app.toast(asDraft ? STRINGS.budgetDraftSaved : STRINGS.budgetSaved)
  app.go('inicio')
}

import { saveQuote } from '../../firebase/store.ts'
import { saveState } from '../../storage/store.ts'
