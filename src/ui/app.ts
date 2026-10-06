import { STRINGS } from './strings.ts'
import type {
  Budget,
  BudgetStatus,
  IssuerProfile,
  IssuerSnapshot,
  UserProfile,
} from '../domain/types.ts'
import { snapshotFromIssuer } from '../domain/validators.ts'
import { BUDGET_STATUSES, BUDGET_STATUS_LABELS } from '../domain/units.ts'
import { firebaseConfigured } from '../firebase/config.ts'
import {
  onAuthState,
  registerWithEmail,
  loginWithEmail,
  logout,
  type AuthStatus,
} from '../firebase/auth.ts'
import {
  getUserProfile,
  saveUserProfile,
  listIssuers,
  saveIssuer,
  deleteIssuerDoc,
  setDefaultIssuer,
  removeIssuerSignature as removeIssuerSignatureStore,
  listClients,
  saveClient,
  listQuotes,
  saveQuote,
  allocateNextQuoteNumber,
  migrationFlag,
  setMigrationFlag,
  migrateLegacyToFirestore,
} from '../firebase/store.ts'
import {
  hasLegacyData,
  saveLegacyBackup,
  localMigrationState,
  markLocalMigration,
  type AppState,
  EMPTY_STATE,
  loadThemeColor,
  saveThemeColor,
  clearThemeColor,
} from '../storage/store.ts'
import { setDefaultActiveIssuer, getActiveIssuer } from './issuer.ts'
import { applyThemeColor, DEFAULT_THEME_COLOR } from '../domain/theme.ts'

export type View = 'inicio' | 'presupuesto' | 'clientes' | 'config' | 'catalogo' | 'auth'

export class App {
  state: AppState = structuredClone(EMPTY_STATE)
  view: View = 'auth'
  editingBudget: Budget | null = null
  editingRef: string | null = null
  editingClientId: string | null = null
  editingSectionId: string | null = null
  editingItemId: string | null = null
  editingItemSectionId: string | null = null
  editingIssuerId: string | null = null
  editingIssuerDraft: { logoDataUrl?: string; signatureDataUrl?: string } = {}
  editingIssuerData: IssuerProfile | null = null
  isExistingEdit = false
  toastTimer: number | null = null
  editingCatalogItemId: string | null = null
  catalogSearch: string = ''
  catalogFilterCategory: string = 'all'

  uid: string | null = null
  email: string | null = null
  profile: UserProfile | null = null
  issuers: IssuerProfile[] = []
  activeIssuerId: string | null = null
  authError: string | null = null
  authBusy = false
  migrationPending = false
  migrationAccepted: 'none' | 'done' | 'dismissed' = 'none'
  ready = false
  themeColor: string = DEFAULT_THEME_COLOR

  private root: HTMLElement

  constructor(root: HTMLElement) {
    this.root = root
  }

  start(): void {
    const saved = loadThemeColor()
    if (saved) {
      this.themeColor = saved
      applyThemeColor(saved)
    }
    if (!firebaseConfigured()) {
      this.authError = STRINGS.firebaseMissingConfig
      this.render()
      return
    }
    onAuthState((status) => {
      void this.handleAuth(status)
    })
  }

  private async handleAuth(status: AuthStatus): Promise<void> {
    if (status.state === 'loading') {
      this.authBusy = true
      this.render()
      return
    }
    this.authBusy = false
    if (status.state === 'guest') {
      this.uid = null
      this.email = null
      this.profile = null
      this.issuers = []
      this.state = structuredClone(EMPTY_STATE)
      this.view = 'auth'
      this.ready = false
      this.render()
      return
    }
    this.uid = status.user.uid
    this.email = status.user.email ?? null
    await this.loadUserData()
  }

  private async loadUserData(): Promise<void> {
    this.profile = await getUserProfile(this.uid!)
    await Promise.all([this.loadIssuers(), this.loadClients(), this.loadQuotes()])
    this.profile = this.profile ?? {
      uid: this.uid!,
      displayName: undefined,
      phone: undefined,
      createdAt: new Date().toISOString(),
    }
    this.configureMigration()
    this.setDefaultIssuer()
    this.view = 'inicio'
    this.ready = true
    this.render()
  }

  private async loadIssuers(): Promise<void> {
    this.issuers = await listIssuers(this.uid!)
  }

  private async loadClients(): Promise<void> {
    this.state.clients = await listClients(this.uid!)
  }

  private async loadQuotes(): Promise<void> {
    this.state.budgets = await listQuotes(this.uid!)
  }

  private configureMigration(): void {
    this.migrationAccepted = 'none'
    const local = localMigrationState()
    void migrationFlag(this.uid!).then((remote) => {
      const hasLegacy = hasLegacyData()
      if (remote === 'done' || remote === 'dismissed') {
        this.migrationAccepted = remote
      } else if (local === 'done' || local === 'dismissed') {
        this.migrationAccepted = local
        void setMigrationFlag(local, this.uid!)
        void saveLegacyBackup()
      } else if (hasLegacy) {
        this.migrationPending = true
        this.render()
        return
      }
      this.render()
    })
  }

  private async setDefaultIssuer(): Promise<void> {
    if (this.issuers.length === 0) {
      return
    }
    this.activeIssuerId = getActiveIssuer()
    if (this.issuers.some((i) => i.id === this.activeIssuerId)) {
      return
    }
    const def = this.issuers.find((i) => i.isDefault) ?? this.issuers[0]
    setDefaultActiveIssuer(def.id)
    this.activeIssuerId = def.id
  }

  async acceptMigration(): Promise<void> {
    if (!this.uid) {
      return
    }
    const activeIssuer = this.issuers.find((i) => i.id === this.activeIssuerId) ?? this.issuers[0]
    const snapshot: IssuerSnapshot = activeIssuer
      ? snapshotFromIssuer(activeIssuer)
      : {
          issuerId: 'issuer-legacy',
          kind: 'empresa',
          name: this.state.company?.name || 'Mi empresa',
          rut: this.state.company?.rut,
          phone: this.state.company?.phone,
          email: this.state.company?.email,
          address: this.state.company?.address,
          logoDataUrl: this.state.company?.logoDataUrl,
        }
    await migrateLegacyToFirestore(snapshot, this.uid)
    const localPrev = localMigrationState()
    if (localPrev === 'none') {
      markLocalMigration('done')
    }
    await setMigrationFlag('done', this.uid)
    if (this.issuers.length === 0) {
      this.issuers = await listIssuers(this.uid)
    }
    this.migrationPending = false
    this.migrationAccepted = 'done'
    await this.reloadAfterMigration()
  }

  private async reloadAfterMigration(): Promise<void> {
    await Promise.all([this.loadIssuers(), this.loadClients(), this.loadQuotes()])
    const def = this.issuers.find((i) => i.isDefault) ?? this.issuers[0]
    if (def) {
      setDefaultActiveIssuer(def.id)
      this.activeIssuerId = def.id
    }
    this.render()
  }

  dismissMigration(): void {
    this.migrationPending = false
    this.migrationAccepted = 'dismissed'
    markLocalMigration('dismissed')
    void setMigrationFlag('dismissed', this.uid!)
    this.render()
  }

  async save(): Promise<void> {
    if (!this.uid) {
      return
    }
    await Promise.all([
      saveClientBatch(this.uid, this.state.clients),
      saveQuoteBatch(this.uid, this.state.budgets),
    ])
  }

  async register(email: string, password: string): Promise<boolean> {
    this.authError = null
    try {
      await registerWithEmail(email, password)
      return true
    } catch (err) {
      this.authError = authErrorMessage(err)
      this.render()
      return false
    }
  }

  async login(email: string, password: string): Promise<boolean> {
    this.authError = null
    try {
      await loginWithEmail(email, password)
      return true
    } catch (err) {
      this.authError = authErrorMessage(err)
      this.render()
      return false
    }
  }

  async logout(): Promise<void> {
    this.state = structuredClone(EMPTY_STATE)
    this.profile = null
    this.issuers = []
    this.editingBudget = null
    this.view = 'auth'
    await logout()
    this.render()
  }

  async saveProfile(profile: UserProfile): Promise<void> {
    await saveUserProfile(profile, this.uid!)
    this.profile = profile
    this.toast(STRINGS.profileSaved)
  }

  async saveIssuerForm(issuer: IssuerProfile): Promise<void> {
    const uid = this.uid
    this.editingIssuerId = null
    this.editingIssuerDraft = {}
    this.editingIssuerData = null
    if (!uid) {
      this.toast(STRINGS.authRequiredField)
      this.render()
      return
    }
    try {
      await saveIssuer(issuer, uid)
      await this.loadIssuers()
      const def = this.issuers.find((i) => i.id === issuer.id) ?? this.issuers.find((i) => i.isDefault) ?? this.issuers[0]
      setDefaultActiveIssuer(def?.id ?? null)
      this.activeIssuerId = def?.id ?? null
      this.toast(STRINGS.issuerSaved)
    } catch (err) {
      this.toast(errorMessage(err))
    }
    this.render()
  }

  async removeIssuer(id: string): Promise<void> {
    const confirmed = await this.confirmDialog(STRINGS.issuerConfirmDelete)
    if (!confirmed) {
      return
    }
    const wasDefault = this.issuers.find((i) => i.id === id)?.isDefault
    await deleteIssuerDoc(id, this.uid!)
    await this.loadIssuers()
    if (wasDefault && this.issuers.length > 0) {
      const next = this.issuers[0]
      await setDefaultIssuer(next.id, this.uid!)
      await this.loadIssuers()
      setDefaultActiveIssuer(next.id)
      this.activeIssuerId = next.id
    } else if (this.activeIssuerId === id) {
      const def = this.issuers.find((i) => i.isDefault) ?? this.issuers[0]
      if (def) {
        setDefaultActiveIssuer(def.id)
        this.activeIssuerId = def.id
      }
    }
    this.toast(STRINGS.issuerDeleted)
    this.render()
  }

  async makeDefaultIssuer(id: string): Promise<void> {
    await setDefaultIssuer(id, this.uid!)
    await this.loadIssuers()
    setDefaultActiveIssuer(id)
    this.activeIssuerId = id
    this.render()
  }

  async removeIssuerSignature(issuerId: string): Promise<void> {
    if (!this.uid) return
    try {
      await removeIssuerSignatureStore(this.uid, issuerId)
      await this.loadIssuers()
    } catch (err) {
      this.toast(errorMessage(err))
    }
  }

  setThemeColor(color: string): void {
    this.themeColor = color
    applyThemeColor(color)
    saveThemeColor(color)
    this.render()
  }

  clearTheme(): void {
    this.themeColor = DEFAULT_THEME_COLOR
    clearThemeColor()
    applyThemeColor(DEFAULT_THEME_COLOR)
    this.render()
  }

  async selectIssuer(id: string): Promise<void> {
    setDefaultActiveIssuer(id)
    this.activeIssuerId = id
    this.render()
  }

  async allocateNumber(): Promise<number> {
    return allocateNextQuoteNumber(this.uid!)
  }

  go(view: View): void {
    this.view = view
    if (view !== 'presupuesto') {
      this.editingBudget = null
      this.editingRef = null
      this.editingClientId = null
      this.editingSectionId = null
      this.editingItemId = null
      this.editingItemSectionId = null
      this.editingIssuerId = null
      this.isExistingEdit = false
    }
    this.render()
  }

  goEditBudget(budget: Budget, refKey: string): void {
    this.editingBudget = structuredClone(budget)
    this.editingRef = refKey
    this.editingClientId = budget.clientId ?? null
    this.editingSectionId = null
    this.editingItemId = null
    this.editingItemSectionId = null
    this.editingIssuerId = null
    this.isExistingEdit = true
    this.view = 'presupuesto'
    this.render()
  }

  newBudget(): void {
    this.editingBudget = null
    this.editingRef = null
    this.editingClientId = null
    this.editingSectionId = null
    this.editingItemId = null
    this.editingItemSectionId = null
    this.editingIssuerId = null
    this.isExistingEdit = false
    this.view = 'presupuesto'
    this.render()
  }

  duplicate(reference: Budget): void {
    if (!this.activeIssuerId) {
      return
    }
    const issuer = this.issuers.find((i) => i.id === this.activeIssuerId)
    this.editingBudget = structuredClone(reference)
    this.editingBudget.id = crypto.randomUUID()
    this.editingBudget.number = 0
    this.editingBudget.date = new Date().toISOString()
    this.editingBudget.createdAt = new Date().toISOString()
    this.editingBudget.updatedAt = new Date().toISOString()
    this.editingBudget.isDraft = undefined
    this.editingBudget.status = 'pendiente'
    this.editingBudget.sections = this.editingBudget.sections.map((section) => ({
      ...section,
      id: crypto.randomUUID(),
      items: section.items.map((item) => ({ ...item, id: crypto.randomUUID() })),
    }))
    this.editingBudget.issuerSnapshot = issuer ? snapshotFromIssuer(issuer) : undefined
    this.editingRef = null
    this.editingClientId = this.editingBudget.clientId ?? null
    this.editingSectionId = null
    this.editingItemId = null
    this.editingItemSectionId = null
    this.isExistingEdit = false
    this.view = 'presupuesto'
    this.render()
  }

  toast(message: string): void {
    const existing = this.root.querySelector<HTMLElement>('.toast')
    if (existing) {
      existing.remove()
    }
    const toast = document.createElement('div')
    toast.className = 'toast'
    toast.textContent = message
    this.root.appendChild(toast)
    requestAnimationFrame(() => toast.classList.add('show'))
    if (this.toastTimer !== null) {
      window.clearTimeout(this.toastTimer)
    }
    this.toastTimer = window.setTimeout(() => {
      toast.classList.remove('show')
      window.setTimeout(() => toast.remove(), 300)
    }, 2500)
  }

  confirmDialog(message: string): Promise<boolean> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div')
      overlay.className = 'overlay'
      overlay.innerHTML = `
        <div class="dialog" role="dialog" aria-modal="true">
          <p>${escapeHtml(message)}</p>
          <div class="dialog-actions">
            <button type="button" data-act="cancel" class="btn btn-secondary">${STRINGS.cancel}</button>
            <button type="button" data-act="ok" class="btn btn-primary">${STRINGS.confirm}</button>
          </div>
        </div>
      `
      const close = (result: boolean) => {
        overlay.remove()
        resolve(result)
      }
      overlay.querySelector('[data-act="ok"]')!.addEventListener('click', () => close(true))
      overlay.querySelector('[data-act="cancel"]')!.addEventListener('click', () => close(false))
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
          close(false)
        }
      })
      this.root.appendChild(overlay)
    })
  }

  pickStatus(current: BudgetStatus): Promise<BudgetStatus | null> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div')
      overlay.className = 'overlay'
      overlay.innerHTML = `
        <div class="dialog" role="dialog" aria-modal="true">
          <p>${STRINGS.cambiarEstadoTitle}</p>
          <div class="dialog-actions dialog-actions-column">
            ${BUDGET_STATUSES.map(
              (status) => `
                <button type="button" data-act="${status}" class="btn btn-secondary${status === current ? ' is-current' : ''}">
                  ${BUDGET_STATUS_LABELS[status]}
                </button>`,
            ).join('')}
            <button type="button" data-act="cancel" class="btn btn-secondary">${STRINGS.cancel}</button>
          </div>
        </div>
      `
      const close = (result: BudgetStatus | null) => {
        overlay.remove()
        resolve(result)
      }
      overlay.querySelectorAll('[data-act]').forEach((node) => {
        node.addEventListener('click', () => {
          const act = (node as HTMLElement).dataset.act ?? 'cancel'
          close(act === 'cancel' ? null : (act as BudgetStatus))
        })
      })
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
          close(null)
        }
      })
      this.root.appendChild(overlay)
    })
  }

  render(): void {
    if (this.view === 'auth') {
      this.root.innerHTML = `<header class="app-header"><h1>${STRINGS.appName}</h1></header><main class="app-main" id="view">${renderAuth(this)}</main>`
      this.bindAuth()
      return
    }
    const nav = this.view === 'presupuesto' ? '' : navInicio(this)
    let content: string
    let handlers: Record<string, (app: App, param?: string) => void>
    switch (this.view) {
      case 'presupuesto':
        content = renderPresupuesto(this)
        handlers = budgetHandlers
        break
      case 'clientes':
        content = renderClientes(this)
        handlers = clientesHandlers
        break
      case 'config':
        content = renderConfig(this)
        handlers = configHandlers
        break
      case 'catalogo':
        content = renderCatalogo(this)
        handlers = catalogoHandlers
        break
      default:
        content = renderInicio(this)
        handlers = inicioHandlers
        break
    }
    const profileLine = this.profile?.displayName ?? this.email ?? this.uid
    this.root.innerHTML = `
      <header class="app-header">
        <h1>${STRINGS.appName}</h1>
        <span class="subtitle">${STRINGS.subtitle}</span>
        <span class="header-user">${escapeHtml(profileLine ?? '')}</span>
      </header>
      ${this.migrationPending && this.view === 'inicio' ? migrationBanner() : ''}
      <main class="app-main" id="view">${content}</main>
      <footer class="app-credit">${STRINGS.creditElaboradaPor}</footer>
      ${nav}
    `
    this.root.querySelectorAll('[data-action]').forEach((node) => {
      const action = (node as HTMLElement).dataset.action ?? ''
      const param = (node as HTMLElement).dataset.param
      const handler = () => dispatch(this, action, param, handlers)
      if ((node as HTMLElement).tagName === 'SELECT' || (node as HTMLInputElement).type === 'file' || (node as HTMLInputElement).type === 'color') {
        node.addEventListener('change', handler)
      } else if ((node as HTMLElement).tagName === 'INPUT' && (node as HTMLInputElement).type === 'search') {
        node.addEventListener('input', handler)
      } else {
        node.addEventListener('click', handler)
      }
    })
    const form = this.root.querySelector<HTMLFormElement>('[data-form]')
    if (form) {
      if (this.view === 'config') {
        bindConfig(form, this)
      } else if (this.view === 'clientes') {
        bindClientes(form, this)
      } else if (this.view === 'presupuesto') {
        bindPresupuesto(form, this)
      } else if (this.view === 'catalogo') {
        bindCatalogo(form, this)
      }
    }
  }

  private bindAuth(): void {
    this.root.querySelector('[data-action="auth-toggle"]')?.addEventListener('click', () => {
      this.authMode = this.authMode === 'login' ? 'register' : 'login'
      this.render()
    })
    const form = this.root.querySelector<HTMLFormElement>('[data-auth-form]')
    form?.addEventListener('submit', (e) => {
      e.preventDefault()
      void this.submitAuth()
    })
  }

  authMode: 'login' | 'register' = 'login'

  private async submitAuth(): Promise<void> {
    const email = (this.root.querySelector<HTMLInputElement>('[data-auth-email]')?.value ?? '').trim()
    const password = this.root.querySelector<HTMLInputElement>('[data-auth-password]')?.value ?? ''
    if (!email || !password) {
      this.authError = STRINGS.authRequiredField
      this.render()
      return
    }
    if (this.authMode === 'login') {
      await this.login(email, password)
    } else {
      await this.register(email, password)
    }
  }
}

import { renderAuth } from './views/auth.ts'

function errorMessage(err: unknown): string {
  const msg = (err as Error)?.message ?? ''
  return msg ? `${STRINGS.authError} ${msg}` : STRINGS.authError
}

function authErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? ''
  switch (code) {
    case 'auth/email-already-in-use':
      return STRINGS.authEmailInUse
    case 'auth/wrong-password':
      return STRINGS.authWrongPassword
    case 'auth/user-not-found':
      return STRINGS.authUserNotFound
    case 'auth/invalid-email':
      return STRINGS.authInvalidEmail
    case 'auth/weak-password':
      return STRINGS.authWeakPassword
    default:
      return `${STRINGS.authError} ${(err as Error)?.message ?? ''}`
  }
}

async function saveClientBatch(uid: string, clients: Client[]): Promise<void> {
  await Promise.all(clients.map((c) => saveClient(c, uid)))
}

async function saveQuoteBatch(uid: string, budgets: Budget[]): Promise<void> {
  await Promise.all(budgets.map((b) => saveQuote(b, uid)))
}

import type { Client } from '../domain/types.ts'

function globalHandler(app: App, action: string, param?: string, handlers?: Record<string, (app: App, param?: string) => void>): void {
  switch (action) {
    case 'go-inicio':
    case 'go-catalogo':
    case 'go-clientes':
    case 'go-config':
      app.go(action.replace('go-', '') as View)
      return
    case 'logout':
      void app.logout()
      return
    case 'migration-accept':
      void app.acceptMigration()
      return
    case 'migration-dismiss':
      app.dismissMigration()
      return
    default:
      handlers?.[action]?.(app, param)
  }
}

function dispatch(
  app: App,
  action: string,
  param: string | undefined,
  handlers: Record<string, (app: App, param?: string) => void>,
): void {
  globalHandler(app, action, param, handlers)
}

function navInicio(app: App): string {
  const active = (view: View) => (app.view === view ? ' active' : '')
  return `
    <nav class="bottom-nav">
      <button type="button" data-action="go-inicio" class="nav-item${active('inicio')}">
        <span class="nav-icon">📄</span>${STRINGS.navInicio}
      </button>
      <button type="button" data-action="go-catalogo" class="nav-item${active('catalogo')}">
        <span class="nav-icon">📦</span>${STRINGS.navCatalogo}
      </button>
      <button type="button" data-action="go-clientes" class="nav-item${active('clientes')}">
        <span class="nav-icon">👥</span>${STRINGS.navClientes}
      </button>
      <button type="button" data-action="go-config" class="nav-item${active('config')}">
        <span class="nav-icon">⚙️</span>${STRINGS.navAjustes}
      </button>
    </nav>
  `
}

function migrationBanner(): string {
  return `
    <div class="migration-banner">
      <p>Se encontraron datos locales (${STRINGS.appName}). ¿Deseas importarlos a tu cuenta?</p>
      <div class="row-actions">
        <button type="button" class="btn btn-primary btn-sm" data-action="migration-accept">Importar</button>
        <button type="button" class="btn btn-secondary btn-sm" data-action="migration-dismiss">No por ahora</button>
      </div>
    </div>
  `
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

import { renderInicio, handlers as inicioHandlers } from './views/inicio.ts'
import { renderPresupuesto, handlers as budgetHandlers, bind as bindPresupuesto } from './views/presupuesto.ts'
import { renderClientes, handlers as clientesHandlers, bind as bindClientes } from './views/clientes.ts'
import { renderConfig, handlers as configHandlers, bind as bindConfig } from './views/config.ts'
import { renderCatalogo, handlers as catalogoHandlers, bind as bindCatalogo } from './views/catalogo.ts'

export function mountApp(root: HTMLElement): App {
  const app = new App(root)
  app.start()
  return app
}
