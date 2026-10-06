import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export function whichSync(bin) {
  try {
    const r = spawnSync('which', [bin], { encoding: 'utf8' })
    if (r.status === 0 && r.stdout && r.stdout.trim()) {
      return r.stdout.trim()
    }
  } catch {}
  return null
}

export function resolveFirebaseBin(root) {
  const local = join(root, 'node_modules', '.bin', 'firebase')
  if (existsSync(local)) return local
  return whichSync('firebase')
}

export function requireJava() {
  const java = whichSync('java')
  if (!java) {
    return 'No se encontró Java (lo necesita el emulador de Firestore). Instala un JDK 17+ o añádelo al PATH.'
  }
  const probe = spawnSync(java, ['-version'], { encoding: 'utf8' })
  if (probe.status !== 0) {
    return 'Java está en el PATH pero no responde a `java -version`.'
  }
  return null
}

export function firebaseEmulatorsExec({ root, bin, project, only, config, command, env }) {
  const args = ['emulators:exec', '--config', config, '--project', project, '--only', only, command]
  return new Promise((resolve) => {
    const child = spawn(bin, args, { cwd: root, env, stdio: 'inherit' })
    child.on('error', (err) => resolve({ code: 127, error: err }))
    child.on('exit', (code) => resolve({ code: code ?? 1 }))
  })
}
