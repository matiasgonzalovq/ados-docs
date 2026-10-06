export const PRODUCTION_PROJECT_IDS = Object.freeze(['ados-docs'])

export const PRODUCTION_HOSTS = Object.freeze([
  'ados-docs.firebaseapp.com',
  'ados-docs.web.app',
  'ados-docs.firebasestorage.app',
])

export function isProductionProjectId(id) {
  if (typeof id !== 'string') return false
  const v = id.trim().toLowerCase()
  if (v === '') return false
  return PRODUCTION_PROJECT_IDS.includes(v)
}

export function isProductionHost(host) {
  if (typeof host !== 'string') return false
  const v = host.trim().toLowerCase()
  if (v === '') return false
  return PRODUCTION_HOSTS.some((p) => v === p || v.endsWith('.' + p))
}

export function assertNotProductionProject(id, context) {
  if (isProductionProjectId(id)) {
    throw new Error(
      `[env-guard] ${context}: projectId="${id}" corresponde al proyecto de PRODUCCIÓN. ` +
        'Operación cancelada en modo fail-closed. Usa los emuladores locales o un proyecto de prueba propio.',
    )
  }
  return id
}

export function assertDemoProjectId(id, context) {
  assertNotProductionProject(id, context)
  if (typeof id !== 'string' || !id.startsWith('demo-')) {
    throw new Error(
      `[env-guard] ${context}: projectId="${id}" debe empezar por "demo-". ` +
        'El prefijo demo- es exclusivo de los emuladores y no existe en ningún proyecto real.',
    )
  }
  return id
}

export function assertNotProductionHost(host, context) {
  if (isProductionHost(host)) {
    throw new Error(
      `[env-guard] ${context}: authDomain="${host}" corresponde al proyecto de PRODUCCIÓN. ` +
        'Operación cancelada en modo fail-closed.',
    )
  }
  return host
}

export function assertSafeEnv(env, context) {
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith('VITE_FIREBASE_')) continue
    if (typeof value !== 'string' || value === '') continue
    if (isProductionProjectId(value)) {
      throw new Error(
        `[env-guard] ${context}: la variable ${key} apunta al proyecto de PRODUCCIÓN. Operación cancelada.`,
      )
    }
    if (isProductionHost(value)) {
      throw new Error(
        `[env-guard] ${context}: la variable ${key} apunta al dominio de PRODUCCIÓN. Operación cancelada.`,
      )
    }
  }
  return env
}
