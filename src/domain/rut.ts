const DV_RE = /^(\d{1,8})-([0-9kK])$/
const BODY_RE = /^(\d{1,8})$/
const NODASH_K_RE = /^(\d{7,8})K$/
const NODASH_9_RE = /^(\d{8})(\d)$/

function cleanSpaces(value: string): string {
  return value.replace(/[\s.\u00a0]/g, '').toUpperCase()
}

function computeDv(body: string): string {
  let sum = 0
  let mul = 2
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i], 10) * mul
    mul = mul === 7 ? 2 : mul + 1
  }
  const rem = 11 - (sum % 11)
  if (rem === 11) return '0'
  if (rem === 10) return 'K'
  return String(rem)
}

function parseRutParts(value: string): { body: string; dv: string | null } {
  const cleaned = cleanSpaces(value)
  const dm = DV_RE.exec(cleaned)
  if (dm) return { body: dm[1], dv: dm[2].toUpperCase() }
  const km = NODASH_K_RE.exec(cleaned)
  if (km) return { body: km[1], dv: 'K' }
  const n9 = NODASH_9_RE.exec(cleaned)
  if (n9) return { body: n9[1], dv: n9[2] }
  const bm = BODY_RE.exec(cleaned)
  if (bm) return { body: bm[1], dv: null }
  return { body: cleaned.replace(/[^0-9]/g, ''), dv: null }
}

export function normalizeRut(value: string): string {
  const { body, dv } = parseRutParts(value)
  if (!body) return ''
  const computed = dv ?? computeDv(body)
  return `${body}-${computed}`
}

export function formatRut(value: string): string {
  const { body, dv } = parseRutParts(value)
  if (!body) return value
  const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  if (dv) return `${formatted}-${dv}`
  return formatted
}

export function formatRutOnInput(value: string): string {
  const cleaned = cleanSpaces(value)
  const { body, dv } = parseRutParts(cleaned)
  if (!body) return ''
  const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const hasDash = cleaned.includes('-')
  if (dv) return `${formatted}-${dv}`
  if (hasDash) return `${formatted}-`
  return formatted
}

export function validateRut(value: string): boolean {
  const { body, dv } = parseRutParts(value)
  if (!dv || body.length < 7 || body.length > 8) return false
  return computeDv(body) === dv
}

export function rutDisplay(rut: string | undefined): string {
  if (!rut) return ''
  return formatRut(rut)
}
