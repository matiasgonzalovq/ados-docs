import type { App } from '../app.ts'
import { STRINGS } from '../strings.ts'
import type { IssuerKind, IssuerProfile } from '../../domain/types.ts'
import { validateIssuer } from '../../domain/validators.ts'
import { optimizeIssuerImage } from '../../domain/imageOptimize.ts'
import { createSampleQuote } from '../../domain/sampleQuote.ts'
import { generarPresupuestoPdf, nombreArchivoCotizacionDetallado, nombreArchivoCotizacionResumido } from '../../pdf/pdf.ts'
import { THEME_PRESETS } from '../../domain/theme.ts'
import { formatRutOnInput, normalizeRut, validateRut, formatRut } from '../../domain/rut.ts'

function esc(v: string | undefined): string {
  return (v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function draftIssuer(app: App): IssuerProfile {
  if (!app.editingIssuerData) {
    const editing = app.issuers.find((i) => i.id === app.editingIssuerId)
    const now = new Date().toISOString()
    app.editingIssuerData = editing
      ? { ...editing }
      : {
          id: app.editingIssuerId === 'new' ? 'new' : crypto.randomUUID(),
          ownerUid: app.uid ?? '',
          kind: 'empresa',
          name: '',
          createdAt: now,
          updatedAt: now,
        }
  }
  return app.editingIssuerData
}

/** Invariante: vuelca el formulario DOM al draft antes de cualquier re-render interno. */
function syncIssuerDraft(app: App): void {
  const form = document.querySelector<HTMLFormElement>('[data-issuer-form]')
  if (!form) {
    return
  }
  const draft = draftIssuer(app)
  const val = (name: string): string | undefined => {
    const v = String(form.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[name="${name}"]`)?.value ?? '').trim()
    return v === '' ? undefined : v
  }
  draft.kind = (form.querySelector<HTMLSelectElement>('[name="kind"]')?.value === 'persona' ? 'persona' : 'empresa') as IssuerKind
  draft.name = val('name') ?? draft.name ?? ''
  draft.rut = val('rut')
  draft.phone = val('phone')
  draft.email = val('email')
  draft.address = val('address')
  draft.info = val('info')
  draft.giro = val('giro')
  draft.signerName = val('signerName')
  draft.signerRut = val('signerRut')
  draft.signerRole = val('signerRole')
  draft.ownerUid = app.uid ?? draft.ownerUid
  draft.logoDataUrl = app.editingIssuerDraft?.logoDataUrl ?? draft.logoDataUrl
  draft.signatureDataUrl = app.editingIssuerDraft?.signatureDataUrl ?? draft.signatureDataUrl
}

function issuerLogoPreview(app: App, issuer: IssuerProfile): string | undefined {
  return app.editingIssuerDraft?.logoDataUrl ?? issuer.logoDataUrl ?? issuer.logoUrl
}

function issuerSignaturePreview(app: App, issuer: IssuerProfile): string | undefined {
  return app.editingIssuerDraft?.signatureDataUrl ?? issuer.signatureDataUrl ?? issuer.signatureUrl
}

export function renderConfig(app: App): string {
  if (app.editingIssuerId) {
    syncIssuerDraft(app)
  }
  return `
    <section class="view">
      <h2>${STRINGS.profileTitle}</h2>
      ${renderProfileForm(app)}
      <h2>${STRINGS.issuersTitle}</h2>
      ${app.editingIssuerId ? renderIssuerForm(app) : ''}
      ${app.editingIssuerId ? '' : `<button type="button" class="btn btn-secondary" data-action="issuer-new">${STRINGS.issuerNew}</button>`}
      <div class="issuer-list">${renderIssuerList(app)}</div>
      <h2>${STRINGS.themeSectionTitle}</h2>
      ${renderThemeSection(app)}
      <button type="button" class="btn btn-secondary btn-block" data-action="logout">${STRINGS.authLogout}</button>
    </section>
  `
}

function renderProfileForm(app: App): string {
  const p = app.profile
  return `
    <form class="form" data-form="profile">
      <label>${STRINGS.authEmail}</label>
      <input type="email" value="${esc(app.email ?? '')}" readonly disabled />
      <label for="pf-name">${STRINGS.profileName}</label>
      <input id="pf-name" name="displayName" type="text" value="${esc(p?.displayName)}" />
      <label for="pf-phone">${STRINGS.profilePhone}</label>
      <input id="pf-phone" name="phone" type="tel" value="${esc(p?.phone)}" />
      <button type="submit" class="btn btn-primary btn-block">${STRINGS.configSave}</button>
    </form>
  `
}

function renderIssuerForm(app: App): string {
  const issuer = draftIssuer(app)
  const logo = issuerLogoPreview(app, issuer)
  const signature = issuerSignaturePreview(app, issuer)
  const logoPreview = logo
    ? `<div class="logo-preview"><img src="${esc(logo)}" alt="Logo" /></div>`
    : ''
  const signaturePreview = signature
    ? `<div class="signature-preview"><img src="${esc(signature)}" alt="Firma" /><button type="button" class="btn btn-secondary btn-sm" data-action="issuer-signature-remove">${STRINGS.issuerSignatureRemove}</button></div>`
    : ''
  const isNew = app.editingIssuerId === 'new'
  const giro =
    issuer.kind === 'empresa'
      ? `
      <label for="iss-giro">${STRINGS.issuerGiro}</label>
      <input id="iss-giro" name="giro" type="text" value="${esc(issuer.giro)}" />`
      : ''
  return `
    <div class="sheet-overlay">
      <div class="sheet" role="dialog" aria-modal="true">
        <form class="form issuer-form" data-issuer-form>
          <h3>${isNew ? STRINGS.issuerNewTitle : STRINGS.issuerEditTitle}</h3>
          <label>${STRINGS.issuerKind} *</label>
          <select name="kind">
            <option value="empresa"${issuer.kind === 'empresa' ? ' selected' : ''}>${STRINGS.issuerKindEmpresa}</option>
            <option value="persona"${issuer.kind === 'persona' ? ' selected' : ''}>${STRINGS.issuerKindPersona}</option>
          </select>
          ${giro}
          <label for="iss-name">${STRINGS.issuerName} *</label>
          <input id="iss-name" name="name" type="text" value="${esc(issuer.name)}" />
          <span class="form-msg" data-msg="issuer-name"></span>
          <label for="iss-rut">${STRINGS.issuerRut}</label>
          <input id="iss-rut" name="rut" type="text" value="${esc(issuer.rut)}" />
          <span class="form-msg" data-msg="issuer-rut"></span>
          <label for="iss-phone">${STRINGS.issuerPhone}</label>
          <input id="iss-phone" name="phone" type="tel" value="${esc(issuer.phone)}" />
          <label for="iss-email">${STRINGS.issuerEmail}</label>
          <input id="iss-email" name="email" type="email" value="${esc(issuer.email)}" />
          <label for="iss-address">${STRINGS.issuerAddress}</label>
          <input id="iss-address" name="address" type="text" value="${esc(issuer.address)}" />
          <label for="iss-info">${STRINGS.issuerInfo}</label>
          <textarea id="iss-info" name="info" rows="3">${esc(issuer.info)}</textarea>
          <div class="field-logo">
            <label>${STRINGS.issuerLogo}</label>
            ${logoPreview}
            <label class="btn btn-secondary btn-file">${STRINGS.cambiarLogo}<input type="file" id="iss-logo" accept="image/png,image/jpeg,image/webp" data-action="issuer-logo" hidden /></label>
          </div>
          <div class="field-logo">
            <label>${STRINGS.issuerSignature}</label>
            ${signaturePreview}
            <label class="btn btn-secondary btn-file">${STRINGS.issuerSignaturePick}<input type="file" id="iss-signature" accept="image/png,image/jpeg,image/webp" data-action="issuer-signature" hidden /></label>
            <p class="hint">${STRINGS.issuerSignatureHint}</p>
          </div>
          <label for="iss-signer-name">${STRINGS.signerName}</label>
          <input id="iss-signer-name" name="signerName" type="text" value="${esc(issuer.signerName)}" placeholder="Juan Pérez" />
          <label for="iss-signer-rut">${STRINGS.signerRut}</label>
          <input id="iss-signer-rut" name="signerRut" type="text" value="${esc(issuer.signerRut)}" placeholder="12.345.678-9" />
          <span class="form-msg" data-msg="issuer-signer-rut"></span>
          <label for="iss-signer-role">${STRINGS.signerRole}</label>
          <input id="iss-signer-role" name="signerRole" type="text" value="${esc(issuer.signerRole)}" placeholder="Representante legal" />
          <div class="row-actions">
            <button type="submit" class="btn btn-primary">${STRINGS.issuerSave}</button>
            <button type="button" class="btn btn-secondary" data-action="issuer-cancel">${STRINGS.cancel}</button>
          </div>
        </form>
      </div>
    </div>
  `
}

function renderIssuerList(app: App): string {
  if (app.issuers.length === 0) {
    return `<p class="empty">${STRINGS.issuersEmpty}</p>`
  }
  return app.issuers
    .map(
      (i) => `
      <div class="card issuer-card">
        <div class="card-main">
          <strong>${esc(i.name)}</strong>
          ${i.isDefault ? `<span class="badge badge-draft">${STRINGS.issuerDefault}</span>` : ''}
          <span class="quiet">${i.kind === 'empresa' ? STRINGS.issuerKindEmpresa : STRINGS.issuerKindPersona}${i.giro ? ` · ${esc(i.giro)}` : ''}${i.rut ? ` · RUT: ${esc(formatRut(i.rut))}` : ''}</span>
        </div>
        <div class="card-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-action="issuer-edit" data-param="${esc(i.id)}">${STRINGS.issuerEditTitle}</button>
          <button type="button" class="btn btn-info btn-sm" data-action="issuer-preview" data-param="${esc(i.id)}">${STRINGS.issuerPreviewPdf}</button>
          <button type="button" class="btn btn-secondary btn-sm" data-action="issuer-default" data-param="${esc(i.id)}" ${i.isDefault ? 'disabled' : ''}>${STRINGS.issuerSetDefault}</button>
          <button type="button" class="btn btn-danger btn-sm" data-action="issuer-del" data-param="${esc(i.id)}">${STRINGS.eliminar}</button>
        </div>
      </div>`,
    )
    .join('')
}

function renderThemeSection(app: App): string {
  const current = app.themeColor
  const isCustom = !THEME_PRESETS.some((p) => p.color === current)
  const swatches = THEME_PRESETS.map((p) => {
    const active = p.color === current ? ' theme-swatch-active' : ''
    return `<button type="button" class="theme-swatch${active}" data-action="theme-pick" data-param="${p.color}" title="${esc(p.label)}" style="background:${p.color}"></button>`
  }).join('')
  return `
    <div class="theme-section">
      <label>${STRINGS.themeColorLabel}</label>
      <div class="theme-palette">
        ${swatches}
        <label class="theme-swatch theme-swatch-custom${isCustom ? ' theme-swatch-active' : ''}" title="Personalizado">
          <input type="color" value="${esc(current)}" data-action="theme-custom" hidden />
          <span>+</span>
        </label>
      </div>
    </div>
  `
}

export const handlers: Record<string, (app: App, param?: string) => void> = {
  'issuer-new': (app) => {
    app.editingIssuerDraft = {}
    app.editingIssuerId = 'new'
    app.editingIssuerData = null
    app.render()
  },
  'issuer-edit': (app, param) => {
    app.editingIssuerDraft = {}
    app.editingIssuerId = param ?? null
    app.editingIssuerData = null
    app.render()
  },
  'issuer-cancel': (app) => {
    app.editingIssuerDraft = {}
    app.editingIssuerId = null
    app.editingIssuerData = null
    app.render()
  },
  'issuer-default': (app, param) => {
    if (param) {
      void app.makeDefaultIssuer(param)
    }
  },
  'issuer-del': (app, param) => {
    if (param) {
      void app.removeIssuer(param)
    }
  },
  'issuer-logo': (app) => {
    const input = document.getElementById('iss-logo') as HTMLInputElement | null
    const file = input?.files?.[0]
    if (!file) {
      return
    }
    optimizeIssuerImage(file, 'logo')
      .then((result) => {
        syncIssuerDraft(app)
        const draft = draftIssuer(app)
        draft.logoDataUrl = result.dataUrl
        app.editingIssuerDraft = { ...app.editingIssuerDraft, logoDataUrl: result.dataUrl }
        app.render()
      })
      .catch((err: unknown) => {
        app.toast((err as Error).message || STRINGS.configLogoInvalid)
      })
  },
  'issuer-signature': (app) => {
    const input = document.getElementById('iss-signature') as HTMLInputElement | null
    const file = input?.files?.[0]
    if (!file) {
      return
    }
    optimizeIssuerImage(file, 'signature')
      .then((result) => {
        syncIssuerDraft(app)
        const draft = draftIssuer(app)
        draft.signatureDataUrl = result.dataUrl
        app.editingIssuerDraft = { ...app.editingIssuerDraft, signatureDataUrl: result.dataUrl }
        app.render()
      })
      .catch((err: unknown) => {
        app.toast((err as Error).message || STRINGS.configLogoInvalid)
      })
  },
  'issuer-signature-remove': (app) => {
    syncIssuerDraft(app)
    const draft = draftIssuer(app)
    draft.signatureDataUrl = undefined
    draft.signatureUrl = undefined
    app.editingIssuerDraft = { ...app.editingIssuerDraft, signatureDataUrl: undefined }
    if (app.uid && draft.id !== 'new') {
      void app.removeIssuerSignature(draft.id)
    }
    app.render()
  },
  'issuer-preview': (app, param) => {
    const issuer = app.issuers.find((i) => i.id === param)
    if (!issuer) return
    const overlay = document.createElement('div')
    overlay.className = 'overlay'
    overlay.innerHTML = `
      <div class="dialog" role="dialog" aria-modal="true">
        <p style="margin:0 0 16px;font-weight:600">${STRINGS.issuerPreviewTitle}</p>
        <div class="dialog-actions-column">
          <button type="button" data-act="detallado" class="btn btn-secondary">${STRINGS.issuerPreviewDetallado}</button>
          <button type="button" data-act="resumido" class="btn btn-secondary">${STRINGS.issuerPreviewResumido}</button>
          <button type="button" data-act="cancel" class="btn btn-secondary">${STRINGS.cancel}</button>
        </div>
      </div>`
    document.body.appendChild(overlay)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove()
    })
    overlay.querySelectorAll('[data-act]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const act = (btn as HTMLElement).dataset.act
        if (act === 'cancel') { overlay.remove(); return }
        const budget = createSampleQuote(issuer)
        const doc = generarPresupuestoPdf(budget, app.state.company, act === 'resumido' ? 'resumido' : 'detallado')
        doc.save(act === 'resumido' ? nombreArchivoCotizacionResumido(budget) : nombreArchivoCotizacionDetallado(budget))
        overlay.remove()
      })
    })
  },
  'theme-pick': (app, param) => {
    if (param) app.setThemeColor(param)
  },
  'theme-custom': (app) => {
    const input = document.querySelector<HTMLInputElement>('[data-action="theme-custom"]')
    if (input?.value) app.setThemeColor(input.value)
  },
}

export function bind(configForm: HTMLFormElement, app: App): void {
  const doc = configForm.ownerDocument
  const profileForm = doc.querySelector<HTMLFormElement>('[data-form="profile"]')
  profileForm?.addEventListener('submit', (e) => {
    e.preventDefault()
    const f = e.currentTarget as HTMLFormElement
    const data = new FormData(f)
    const displayName = String(data.get('displayName') ?? '').trim() || undefined
    const phone = String(data.get('phone') ?? '').trim() || undefined
    const base = app.profile ?? { uid: app.uid ?? '', createdAt: new Date().toISOString() }
    void app.saveProfile({ ...base, displayName, phone })
  })
  const issuerForm = doc.querySelector<HTMLFormElement>('[data-issuer-form]')
  const issuerRutInput = issuerForm?.querySelector<HTMLInputElement>('#iss-rut')
  if (issuerRutInput) {
    issuerRutInput.addEventListener('input', () => {
      const pos = issuerRutInput.selectionStart ?? issuerRutInput.value.length
      const prev = issuerRutInput.value
      issuerRutInput.value = formatRutOnInput(issuerRutInput.value)
      const diff = issuerRutInput.value.length - prev.length
      issuerRutInput.setSelectionRange(pos + diff, pos + diff)
    })
    issuerRutInput.addEventListener('blur', () => {
      const msg = issuerForm!.querySelector<HTMLElement>('[data-msg="issuer-rut"]')
      const raw = issuerRutInput.value.trim()
      if (raw && !validateRut(raw)) {
        if (msg) msg.textContent = STRINGS.rutInvalid
        issuerRutInput.classList.add('input-error')
      } else {
        if (msg) msg.textContent = ''
        issuerRutInput.classList.remove('input-error')
        if (raw) issuerRutInput.value = formatRutOnInput(raw)
      }
    })
  }
  const signerRutInput = issuerForm?.querySelector<HTMLInputElement>('#iss-signer-rut')
  if (signerRutInput) {
    signerRutInput.addEventListener('input', () => {
      const pos = signerRutInput.selectionStart ?? signerRutInput.value.length
      const prev = signerRutInput.value
      signerRutInput.value = formatRutOnInput(signerRutInput.value)
      const diff = signerRutInput.value.length - prev.length
      signerRutInput.setSelectionRange(pos + diff, pos + diff)
    })
    signerRutInput.addEventListener('blur', () => {
      const msg = issuerForm!.querySelector<HTMLElement>('[data-msg="issuer-signer-rut"]')
      const raw = signerRutInput.value.trim()
      if (raw && !validateRut(raw)) {
        if (msg) msg.textContent = STRINGS.rutInvalid
        signerRutInput.classList.add('input-error')
      } else {
        if (msg) msg.textContent = ''
        signerRutInput.classList.remove('input-error')
        if (raw) signerRutInput.value = formatRutOnInput(raw)
      }
    })
  }
  issuerForm?.addEventListener('submit', (e) => {
    e.preventDefault()
    const f = e.currentTarget as HTMLFormElement
    const data = new FormData(f)
    const name = String(data.get('name') ?? '').trim()
    const flag = (k: string): string | undefined => {
      const v = String(data.get(k) ?? '').trim()
      return v === '' ? undefined : v
    }
    const kind = data.get('kind') === 'persona' ? 'persona' : 'empresa'
    syncIssuerDraft(app)
    const base = draftIssuer(app)
    const now = new Date().toISOString()
    const rutRaw = flag('rut')
    const draft: IssuerProfile = {
      id: base.id === 'new' || base.id === '' ? crypto.randomUUID() : base.id,
      ownerUid: app.uid ?? base.ownerUid,
      kind,
      name,
      rut: rutRaw ? normalizeRut(rutRaw) : undefined,
      phone: flag('phone'),
      email: flag('email'),
      address: flag('address'),
      logoDataUrl: app.editingIssuerDraft?.logoDataUrl,
      logoUrl: app.editingIssuerDraft?.logoDataUrl ? undefined : base.logoUrl,
      info: flag('info'),
      giro: flag('giro'),
      signatureDataUrl: app.editingIssuerDraft?.signatureDataUrl,
      signatureUrl: app.editingIssuerDraft?.signatureDataUrl ? undefined : base.signatureUrl,
      signerName: flag('signerName'),
      signerRut: flag('signerRut') ? normalizeRut(flag('signerRut') as string) : undefined,
      signerRole: flag('signerRole'),
      createdAt: base.id === 'new' || base.id === '' ? now : base.createdAt,
      updatedAt: now,
    }
    const result = validateIssuer(draft)
    if (!result.valid) {
      const msg = f.querySelector<HTMLElement>('[data-msg="issuer-name"]')
      if (msg) {
        msg.textContent = result.errors[0] ?? ''
      }
      return
    }
    app.editingIssuerDraft = {}
    void app.saveIssuerForm(draft)
  })
}
