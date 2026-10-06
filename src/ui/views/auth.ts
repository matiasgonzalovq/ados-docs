import type { App } from '../app.ts'
import { STRINGS } from '../strings.ts'

function esc(v: string | undefined): string {
  return (v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function renderAuth(app: App): string {
  const isLogin = app.authMode === 'login'
  return `
    <section class="view">
      <h2>${isLogin ? STRINGS.authTitle : STRINGS.authRegisterTitle}</h2>
      <form class="form" data-auth-form>
        <label for="auth-email">${STRINGS.authEmail} *</label>
        <input id="auth-email" data-auth-email type="email" inputmode="email" autocomplete="email" />
        <label for="auth-password">${STRINGS.authPassword} *</label>
        <input id="auth-password" data-auth-password type="password" autocomplete="${isLogin ? 'current-password' : 'new-password'}" />
        <span class="form-msg" data-msg="auth"></span>
        ${app.authError ? `<span class="form-msg">${esc(app.authError)}</span>` : ''}
        <button type="submit" class="btn btn-primary btn-block" data-action="auth-submit" ${app.authBusy ? 'disabled' : ''}>
          ${isLogin ? STRINGS.authLogin : STRINGS.authRegister}
        </button>
      </form>
      <button type="button" class="btn btn-secondary btn-block" data-action="auth-toggle">
        ${isLogin ? STRINGS.authToRegister : STRINGS.authToLogin}
      </button>
    </section>
  `
}

export const authView = {
  renderAuth,
}
