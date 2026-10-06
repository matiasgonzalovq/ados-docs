import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SECRET_PATTERNS = [
  { type: 'clave privada', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY/ },
  { type: 'API key de Google', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { type: 'clave de acceso AWS', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { type: 'token de GitHub', re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
  { type: 'token de Slack', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { type: 'JWT firmado', re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/ },
]

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})\b/g

const SAFE_EMAIL_SUFFIXES = ['.example', '.test', '.local', '.invalid', '.localhost', '.example.com']
const SAFE_EMAIL_DOMAINS = ['example.com', 'example.net', 'example.org', 'localhost']

export function isSafeEmail(email) {
  const at = email.lastIndexOf('@')
  if (at === -1) return true
  const domain = email.slice(at + 1).toLowerCase()
  if (SAFE_EMAIL_DOMAINS.includes(domain)) return true
  return SAFE_EMAIL_SUFFIXES.some((suffix) => domain.endsWith(suffix))
}

export function trackedFiles(root) {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'buffer' })
  return out
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
}

const MAX_BYTES = 2 * 1024 * 1024

function redact(value) {
  return value.slice(0, 6) + '…(' + value.length + ' chars)'
}

export function scanRepo(root) {
  const findings = []
  for (const file of trackedFiles(root)) {
    let buf
    try {
      const full = join(root, file)
      if (statSync(full).size > MAX_BYTES) continue
      buf = readFileSync(full)
    } catch {
      continue
    }
    if (buf.includes(0)) continue
    const lines = buf.toString('utf8').split('\n')
    lines.forEach((line, index) => {
      const n = index + 1
      for (const { type, re } of SECRET_PATTERNS) {
        const match = line.match(re)
        if (match) {
          findings.push({ kind: 'secret', file, line: n, type, detail: redact(match[0]) })
        }
      }
      if (/package-lock\.json$/.test(file)) return
      for (const email of line.match(EMAIL_RE) ?? []) {
        if (!isSafeEmail(email)) {
          findings.push({ kind: 'pii', file, line: n, type: 'correo personal', detail: redact(email) })
        }
      }
    })
  }
  return findings
}

function report(findings) {
  if (findings.length === 0) {
    console.log('scan: sin secretos ni PII en archivos trackeados')
    return 0
  }
  console.error('scan: ' + findings.length + ' hallazgo(s)')
  for (const f of findings) {
    console.error(`  [${f.kind}] ${f.type} en ${f.file}:${f.line} → ${f.detail}`)
  }
  return 1
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const root = fileURLToPath(new URL('..', import.meta.url))
  process.exit(report(scanRepo(root)))
}
