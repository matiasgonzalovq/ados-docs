# Changelog

Cambios notables de ADOS Docs. El formato sigue
[Keep a Changelog](https://keepachangelog.com/es/1.1.0/).

## [Sin publicar]

Preparación del repositorio para su publicación como proyecto de código
abierto. El historial anterior corresponde al desarrollo privado del producto
como *ADOS Obras* y no llevaba changelog.

### Added

- Licencia **AGPL-3.0-only** (`LICENSE`) y avisos de dependencias en
  `THIRD_PARTY_NOTICES.md`.
- Documentación pública: `README.md` ampliado (características, requisitos,
  pruebas, aislamiento con producción, Firebase BYO, roadmap), `CONTRIBUTING.md`,
  `SECURITY.md`, `CODE_OF_CONDUCT.md` y este changelog.
- Gates de calidad reproducibles: `verify`, `verify:all`, `typecheck`, `lint`,
  `scan`, `test:safety`, `test:rules` (emulador de Firestore) y
  `test:regression` (UI con emuladores), más workflow de CI sin credenciales.
- Guardia de entorno (`scripts/env-guard.mjs`): denylist de proyectos/host de
  producción y exigencia de `demo-*` sobre `localhost` en toda prueba que
  escriba datos.
- Plantilla `.env.example` y conexión opcional a emuladores mediante variables
  `VITE_FIREBASE_*_EMULATOR_HOST`.
- Lanzador propio de la CLI de Firebase (`firebase-tools` como devDependency
  fijada), sin requerir instalación global.

### Changed

- Nombre de producto unificado a **ADOS Docs** en interfaz, manifest, nombre de
  paquete y cachés; el nombre histórico *ADOS Obras* se conserva en los
  documentos de especificación de las primeras fases.
- Fixtures anonimizadas con datos de ejemplo (`Constructora Demo`, `Usuario
  Demo`, correos `@example.com` / `@example.test`).
- `.firebaserc` dejó de versionarse: el repositorio ya no apunta a ningún
  proyecto Firebase predefinido.
- Especificación `pdf-export` alineada con el comportamiento real: el PDF
  muestra «Exportado por ADOS DOCS» y no incluye crédito personal en el pie.
- `public/favicon.svg` reemplazado por una variante propia derivada de
  `public/icons/icon.svg` (ver `THIRD_PARTY_NOTICES.md`); el favicon anterior
  tenía procedencia no documentada. Descriptor público del proyecto unificado
  como *Open-source document workspace* (README y `package.json`).
- Historial de la rama de publicación reconstruido como un único commit raíz
  (higiene prepublicación); el historial completo se conserva en una referencia
  local de respaldo.

### Security

- `.env*` y `.firebaserc` ignorados, con gates de `test:safety` que fallan si se
  trackean; CI sin `secrets.` y sin referencias a producción.
- Escaneo automático de secretos y correos reales en archivos trackeados
  (`npm run scan`).
- `dompurify` 3.4.13 → 3.4.16 y `source-map-js` 1.2.1 → 1.2.2 vía
  `npm audit fix` (sin cambios mayores); la suite completa volvió a quedar en
  verde.
- **Conocido**: `npm audit` reporta 16 avisos (12 altos, 4 moderados) en la
  cadena de `firebase` y `firebase-tools` (entre ellos `@grpc/grpc-js`); afectan
  a dependencias de transporte/CLI que no forman parte del bundle del navegador y
  se aceptan como riesgo documentado mientras no haya corrección sin salto
  mayor. Ver el detalle de licencias en `THIRD_PARTY_NOTICES.md`.

## Notas

- Primera publicación open source planificada como **`0.1.0`**: el repositorio
  todavía no tiene etiquetas ni release de GitHub.
- El proyecto aún no tiene releases etiquetadas; la rama principal es la única
  versión soportada (ver `SECURITY.md`).
