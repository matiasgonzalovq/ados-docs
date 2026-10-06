import type { App } from '../app.ts'
import { STRINGS } from '../strings.ts'
import type { CatalogItem, CatalogCategory, Unit } from '../../domain/types.ts'
import { UNIT_LABELS } from '../../domain/units.ts'
import { formatCLP } from '../../domain/money.ts'
import { saveState } from '../../storage/store.ts'

function esc(v: string | undefined): string {
  return (v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const CATEGORIES: CatalogCategory[] = ['mano-de-obra', 'material', 'servicio', 'otro']
const CATEGORY_LABELS: Record<CatalogCategory, string> = {
  'mano-de-obra': STRINGS.catalogCatManoDeObra,
  'material': STRINGS.catalogCatMaterial,
  'servicio': STRINGS.catalogCatServicio,
  'otro': STRINGS.catalogCatOtro,
}

const UNITS_EXTENDED: Unit[] = ['unidad', 'm2', 'm3', 'ml', 'hora', 'jornada', 'global']

const CLP_DISPLAY = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 })

function formatPriceCLP(value: number): string {
  return '$' + CLP_DISPLAY.format(Math.max(0, Math.round(value)))
}

function parsePriceCLP(text: string): number {
  const cleaned = text.replace(/[$.\s]/g, '').replace(',', '.')
  const n = Number(cleaned)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.round(n)
}

function editingItem(app: App): CatalogItem | null {
  if (!app.editingCatalogItemId) return null
  return app.state.catalog.find((i) => i.id === app.editingCatalogItemId) ?? null
}

function catalogForm(item: CatalogItem | null): string {
  const isEdit = item !== null
  const catOptions = CATEGORIES.map(
    (c) => `<option value="${c}"${(item?.category ?? 'material') === c ? ' selected' : ''}>${CATEGORY_LABELS[c]}</option>`,
  ).join('')
  const unitOptions = UNITS_EXTENDED.map(
    (u) => `<option value="${u}"${(item?.unit ?? 'unidad') === u ? ' selected' : ''}>${UNIT_LABELS[u]}</option>`,
  ).join('')
  return `
    <div class="sheet-overlay">
      <div class="sheet" role="dialog" aria-modal="true">
        <form class="form" data-form="catalog-item">
          <h3>${isEdit ? STRINGS.catalogEdit : STRINGS.catalogNew}</h3>
          <label for="cat-name">${STRINGS.catalogName} *</label>
          <input id="cat-name" name="name" type="text" value="${esc(item?.name)}" required />
          <label for="cat-desc">${STRINGS.catalogDescription}</label>
          <input id="cat-desc" name="description" type="text" value="${esc(item?.description)}" />
          <label for="cat-cat">${STRINGS.catalogCategory}</label>
          <select id="cat-cat" name="category">${catOptions}</select>
          <div class="field-grid">
            <div>
              <label for="cat-unit">${STRINGS.catalogUnit}</label>
              <select id="cat-unit" name="unit">${unitOptions}</select>
            </div>
            <div>
              <label for="cat-price">${STRINGS.catalogPrice} *</label>
              <input id="cat-price" name="unitPrice" type="text" inputmode="numeric" value="${formatPriceCLP(item?.unitPrice ?? 0)}" />
            </div>
          </div>
          <div class="row-actions">
            <button type="submit" class="btn btn-primary">${isEdit ? STRINGS.catalogFormEdit : STRINGS.catalogFormNew}</button>
            <button type="button" class="btn btn-secondary" data-action="catalog-cancel">${STRINGS.cancel}</button>
          </div>
        </form>
      </div>
    </div>
  `
}

function matchesSearch(item: CatalogItem, search: string): boolean {
  if (!search) return true
  const s = search.toLowerCase()
  return item.name.toLowerCase().includes(s)
    || (item.description?.toLowerCase().includes(s) ?? false)
}

export function renderCatalogo(app: App): string {
  const editing = editingItem(app)
  const search = app.catalogSearch ?? ''
  const filterCat = app.catalogFilterCategory ?? 'all'
  const items = app.state.catalog
    .filter((i) => filterCat === 'all' || i.category === filterCat)
    .filter((i) => matchesSearch(i, search))
    .sort((a, b) => a.name.localeCompare(b.name))

  const catFilters = [
    `<option value="all"${filterCat === 'all' ? ' selected' : ''}>${STRINGS.catalogCategoryAll}</option>`,
    ...CATEGORIES.map(
      (c) => `<option value="${c}"${filterCat === c ? ' selected' : ''}>${CATEGORY_LABELS[c]}</option>`,
    ),
  ].join('')

  const rows = items.length === 0
    ? `<p class="empty">${STRINGS.catalogEmpty}</p>`
    : items.map((i) => `
      <div class="card catalog-card">
        <div class="card-main">
          <strong>${esc(i.name)}</strong>
          <span class="quiet">${CATEGORY_LABELS[i.category]} · ${UNIT_LABELS[i.unit]} · ${formatCLP(Math.round(i.unitPrice * 100))}</span>
          ${i.description ? `<span class="quiet">${esc(i.description)}</span>` : ''}
        </div>
        <div class="card-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-action="catalog-edit" data-param="${esc(i.id)}">${STRINGS.catalogEdit}</button>
          <button type="button" class="btn btn-danger btn-sm" data-action="catalog-del" data-param="${esc(i.id)}">${STRINGS.catalogDelete}</button>
        </div>
      </div>`).join('')

  return `
    <section class="view">
      <h2>${STRINGS.catalogTitle}</h2>
      <div class="catalog-toolbar">
        <input type="search" id="cat-search" placeholder="${STRINGS.catalogSearch}" value="${esc(search)}" data-action="catalog-search" />
        <select id="cat-filter" data-action="catalog-filter">${catFilters}</select>
      </div>
      <button type="button" class="btn btn-primary btn-block" data-action="catalog-new">${STRINGS.catalogNew}</button>
      <div class="catalog-list">${rows}</div>
      ${app.editingCatalogItemId ? catalogForm(editing) : ''}
    </section>
  `
}

export const handlers: Record<string, (app: App, param?: string) => void> = {
  'catalog-new': (app) => {
    app.editingCatalogItemId = 'new'
    app.render()
  },
  'catalog-edit': (app, param) => {
    app.editingCatalogItemId = param ?? null
    app.render()
  },
  'catalog-cancel': (app) => {
    app.editingCatalogItemId = null
    app.render()
  },
  'catalog-del': (app, param) => {
    if (!param) return
    app.state.catalog = app.state.catalog.filter((i) => i.id !== param)
    saveState(app.state)
    app.toast(STRINGS.catalogDeleted)
    app.render()
  },
  'catalog-search': (app) => {
    const input = document.getElementById('cat-search') as HTMLInputElement | null
    app.catalogSearch = input?.value ?? ''
    app.render()
  },
  'catalog-filter': (app) => {
    const select = document.getElementById('cat-filter') as HTMLSelectElement | null
    app.catalogFilterCategory = select?.value ?? 'all'
    app.render()
  },
}

export function bind(form: HTMLFormElement, app: App): void {
  const priceInput = form.querySelector<HTMLInputElement>('#cat-price')
  if (priceInput) {
    priceInput.addEventListener('input', () => {
      const raw = priceInput.value.replace(/[$.\s]/g, '').replace(',', '')
      if (raw === '' || raw === '-') {
        priceInput.value = raw === '-' ? '-' : ''
        return
      }
      const num = Number(raw)
      if (!Number.isFinite(num)) return
      const pos = priceInput.selectionStart ?? priceInput.value.length
      const oldLen = priceInput.value.length
      priceInput.value = formatPriceCLP(Math.max(0, Math.round(num)))
      const diff = priceInput.value.length - oldLen
      priceInput.setSelectionRange(pos + diff, pos + diff)
    })
    priceInput.addEventListener('blur', () => {
      if (priceInput.value && priceInput.value !== '$') {
        const parsed = parsePriceCLP(priceInput.value)
        priceInput.value = parsed > 0 ? formatPriceCLP(parsed) : ''
      }
    })
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const data = new FormData(form)
    const name = String(data.get('name') ?? '').trim()
    if (!name) return
    const description = String(data.get('description') ?? '').trim() || undefined
    const category = (String(data.get('category') ?? 'otro') as CatalogCategory)
    const unit = (String(data.get('unit') ?? 'unidad') as Unit)
    const unitPrice = parsePriceCLP(String(data.get('unitPrice') ?? ''))
    const now = new Date().toISOString()
    const isNew = app.editingCatalogItemId === 'new'
    const item: CatalogItem = {
      id: isNew ? crypto.randomUUID() : (app.editingCatalogItemId ?? crypto.randomUUID()),
      name,
      description,
      category,
      unit,
      unitPrice,
      createdAt: isNew ? now : (app.state.catalog.find((i) => i.id === app.editingCatalogItemId)?.createdAt ?? now),
      updatedAt: now,
    }
    if (isNew) {
      app.state.catalog.push(item)
    } else {
      app.state.catalog = app.state.catalog.map((i) => i.id === item.id ? item : i)
    }
    saveState(app.state)
    app.editingCatalogItemId = null
    app.toast(STRINGS.catalogSaved)
    app.render()
  })
}
