import { defineConfig, type Plugin, type RolldownOutputBundle } from 'vite'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

function swPrecache(): Plugin {
  return {
    name: 'ados-sw-precache',
    apply: 'build',
    enforce: 'post',
    writeBundle(options, bundle: RolldownOutputBundle) {
      const outDir = options.dir
      if (!outDir) {
        return
      }
      const assetNames = Object.keys(bundle)
        .filter((name) => !name.endsWith('.map'))
        .sort()
      const precache = [
        '/',
        ...assetNames.map((name) => `/${name}`),
        '/manifest.webmanifest',
        '/favicon.svg',
        '/icons/icon-192.png',
        '/icons/icon-512.png',
        '/icons/icon-maskable-512.png',
      ]
      const templatePath = resolve(process.cwd(), 'public', 'sw.template.js')
      let sw = readFileSync(templatePath, 'utf8')
      sw = sw.replace('__PRECACHE_ASSETS__', JSON.stringify(precache, null, 4))
      writeFileSync(resolve(outDir, 'sw.js'), sw)
    },
  }
}

export default defineConfig({
  plugins: [swPrecache()],
})