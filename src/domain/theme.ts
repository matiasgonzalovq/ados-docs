export type ThemePreset = {
  id: string
  label: string
  color: string
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: 'green', label: 'Verde actual', color: '#14532d' },
  { id: 'blue', label: 'Azul', color: '#1e40af' },
  { id: 'blue-dark', label: 'Azul oscuro', color: '#1e3a5f' },
  { id: 'orange', label: 'Naranja', color: '#c2410c' },
  { id: 'red', label: 'Rojo', color: '#b91c1c' },
  { id: 'purple', label: 'Morado', color: '#6b21a8' },
  { id: 'gray-dark', label: 'Gris oscuro', color: '#374151' },
]

export const DEFAULT_THEME_COLOR = '#14532d'

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return null
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('')
}

function lighten(hex: string, amount: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  return rgbToHex(
    rgb.r + (255 - rgb.r) * amount,
    rgb.g + (255 - rgb.g) * amount,
    rgb.b + (255 - rgb.b) * amount,
  )
}

function darken(hex: string, amount: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  return rgbToHex(rgb.r * (1 - amount), rgb.g * (1 - amount), rgb.b * (1 - amount))
}

export function applyThemeColor(color: string): void {
  const root = document.documentElement
  const soft = lighten(color, 0.85)
  const dark = darken(color, 0.2)
  const focus = darken(color, 0.1)
  root.style.setProperty('--color-primary', color)
  root.style.setProperty('--color-primary-dark', dark)
  root.style.setProperty('--color-accent', lighten(color, 0.15))
  root.style.setProperty('--color-primary-soft', soft)
  root.style.setProperty('--color-focus', focus)
}

export function resetThemeColor(): void {
  const root = document.documentElement
  root.style.removeProperty('--color-primary')
  root.style.removeProperty('--color-primary-dark')
  root.style.removeProperty('--color-accent')
  root.style.removeProperty('--color-primary-soft')
  root.style.removeProperty('--color-focus')
}
