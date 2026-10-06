import type { App } from '../app.ts'
import { STRINGS } from '../strings.ts'
import { validateClientName } from '../../domain/validators.ts'
import type { Client } from '../../domain/types.ts'
import { saveClient, deleteClientDoc } from '../../firebase/store.ts'
import { formatRutOnInput, normalizeRut, validateRut, formatRut } from '../../domain/rut.ts'

function esc(value: string | undefined): string {
  return (value ?? '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/&/g, '&amp;')
}

export function renderClientes(app: App): string {
  const editingClient = app.state.clients.find((c) => c.id === app.editingClientId)
  const isEditing = app.editingClientId !== null
  const isNew = app.editingClientId === 'new'
  const editing = isEditing
    ? renderEditForm(editingClient ?? ({ id: 'new', name: '' } as Client), isNew)
    : ''
  const list = app.state.clients.length > 0 ? renderList(app) : `<p class="empty">${STRINGS.clientesVacio}</p>`
  return `
    <section class="view">
      <h2>${STRINGS.clientesTitle}</h2>
      ${editing}
      ${isEditing ? '' : `<button type="button" class="btn btn-secondary" data-action="cliente-new">${STRINGS.nuevoCliente}</button>`}
      <div class="client-list">${list}</div>
    </section>
  `
}

function renderEditForm(client: Client, isNew: boolean): string {
  return `
    <div class="sheet-overlay">
      <div class="sheet" role="dialog" aria-modal="true">
        <form class="form" data-form="cliente">
          <h3>${isNew ? STRINGS.nuevoCliente : STRINGS.editarCliente}</h3>
          <label for="cl-name">${STRINGS.clienteName} *</label>
          <input id="cl-name" name="name" type="text" value="${esc(client.name)}" />
          <span class="form-msg" data-msg="name"></span>

          <label for="cl-rut">${STRINGS.clienteRut}</label>
          <input id="cl-rut" name="rut" type="text" value="${esc(client.rut)}" />
          <span class="form-msg" data-msg="rut"></span>

          <label for="cl-phone">${STRINGS.clientePhone}</label>
          <input id="cl-phone" name="phone" type="tel" value="${esc(client.phone)}" />

          <label for="cl-address">${STRINGS.clienteAddress}</label>
          <input id="cl-address" name="address" type="text" value="${esc(client.address)}" />

          <div class="row-actions">
            <button type="submit" class="btn btn-primary">${STRINGS.guardarCliente}</button>
            <button type="button" class="btn btn-secondary" data-action="cliente-cancel">${STRINGS.cancel}</button>
          </div>
        </form>
      </div>
    </div>
  `
}

function renderList(app: App): string {
  return app.state.clients
    .map(
      (client) => `
      <div class="card client-card">
        <div class="card-main">
          <strong>${esc(client.name)}</strong>
          ${client.rut ? `<span class="quiet">RUT: ${esc(formatRut(client.rut))}</span>` : ''}
          ${client.phone ? `<span class="quiet">${esc(client.phone)}</span>` : ''}
        </div>
        <div class="card-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-action="cliente-edit" data-param="${client.id}">${STRINGS.editarCliente}</button>
          <button type="button" class="btn btn-danger btn-sm" data-action="cliente-del" data-param="${client.id}">${STRINGS.eliminarCliente}</button>
        </div>
      </div>
    `,
    )
    .join('')
}

export const handlers: Record<string, (app: App, param?: string) => void> = {
  'cliente-new': (app) => {
    app.editingClientId = 'new'
    app.render()
  },
  'cliente-cancel': (app) => {
    app.editingClientId = null
    app.render()
  },
  'cliente-edit': (app, param) => {
    app.editingClientId = param ?? null
    app.render()
  },
  'cliente-del': async (app, param) => {
    const client = app.state.clients.find((c) => c.id === param)
    if (!client || !param) {
      return
    }
    const confirmed = await app.confirmDialog(
      `${STRINGS.confirmEliminarCliente}\n\n${esc(client.name)}`,
    )
    if (!confirmed) {
      return
    }
    await deleteClientDoc(param, app.uid!)
    app.state.clients = app.state.clients.filter((c) => c.id !== param)
    app.render()
  },
}

export function bind(clienteForm: HTMLFormElement, app: App): void {
  const rutInput = clienteForm.querySelector<HTMLInputElement>('#cl-rut')
  if (rutInput) {
    rutInput.addEventListener('input', () => {
      const pos = rutInput.selectionStart ?? rutInput.value.length
      const prev = rutInput.value
      rutInput.value = formatRutOnInput(rutInput.value)
      const diff = rutInput.value.length - prev.length
      rutInput.setSelectionRange(pos + diff, pos + diff)
    })
    rutInput.addEventListener('blur', () => {
      const msg = clienteForm.querySelector<HTMLElement>('[data-msg="rut"]')
      const raw = rutInput.value.trim()
      if (raw && !validateRut(raw)) {
        if (msg) msg.textContent = STRINGS.rutInvalid
        rutInput.classList.add('input-error')
      } else {
        if (msg) msg.textContent = ''
        rutInput.classList.remove('input-error')
        if (raw) rutInput.value = formatRutOnInput(raw)
      }
    })
  }
  clienteForm.addEventListener('submit', async (event) => {
    event.preventDefault()
    const data = new FormData(clienteForm)
    const name = String(data.get('name') ?? '').trim()
    const result = validateClientName(name)
    if (!result.valid) {
      const msg = clienteForm.querySelector<HTMLElement>('[data-msg="name"]')
      if (msg) {
        msg.textContent = result.errors[0] ?? ''
      }
      return
    }
    const flag = (field: string): string | undefined => {
      const value = String(data.get(field) ?? '').trim()
      return value === '' ? undefined : value
    }
    const rutRaw = flag('rut')
    const payload = {
      name,
      rut: rutRaw ? normalizeRut(rutRaw) : undefined,
      phone: flag('phone'),
      address: flag('address'),
    }
    if (!app.editingClientId || app.editingClientId === 'new') {
      const newClient: Client = { id: crypto.randomUUID(), ...payload }
      app.state.clients.push(newClient)
      app.editingClientId = null
      await saveClient(newClient, app.uid!)
    } else {
      const updated = { id: app.editingClientId, ...payload }
      app.state.clients = app.state.clients.map((c) =>
        c.id === app.editingClientId ? updated : c,
      )
      app.editingClientId = null
      await saveClient(updated, app.uid!)
    }
    app.toast(STRINGS.clienteSaved)
    app.render()
  })
}