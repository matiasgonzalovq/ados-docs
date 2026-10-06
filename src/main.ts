import './style.css'

async function bootstrap() {
  const { mountApp } = await import('./ui/app.ts')
  mountApp(document.getElementById('app')!)
}

bootstrap()

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js').catch(() => {})
}