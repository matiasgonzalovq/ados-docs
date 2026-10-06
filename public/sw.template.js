const CACHE_NAME = 'ados-docs-v4'
const PRECACHE_ASSETS = __PRECACHE_ASSETS__

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return
  }
  const requestUrl = new URL(event.request.url)
  if (requestUrl.origin !== self.location.origin) {
    return
  }
  if (event.request.mode === 'navigate') {
    event.respondWith(handleNavigation(event.request))
    return
  }
  event.respondWith(handleAsset(event.request))
})

async function handleNavigation(request) {
  try {
    const response = await fetch(request)
    if (response.ok || response.type === 'opaque') {
      const copy = response.clone()
      caches
        .open(CACHE_NAME)
        .then((cache) => cache.put('/index.html', copy))
      return response
    }
    throw new Error('respuesta de navegación inválida')
  } catch {
    const cached = (await caches.match('/index.html')) ?? (await caches.match(request))
    if (cached) {
      return cached
    }
    // Última opción: navegar a un error sin romper la app.
    return Response.error()
  }
}

async function handleAsset(request) {
  const cached = await caches.match(request)
  if (cached) {
    return cached
  }
  try {
    const response = await fetch(request)
    const copy = response.clone()
    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
    return response
  } catch {
    return (await caches.match('/index.html')) ?? Response.error()
  }
}
