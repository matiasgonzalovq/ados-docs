# Avisos de software de terceros

Este repositorio no es *software* autónomo: al construir la aplicación se
empaquetan dependencias de terceros, y las herramientas de desarrollo también se
instalan al hacer `npm ci`. Cada dependencia conserva su licencia y su copyright
originales; nada de lo que sigue se re-licencia bajo AGPL-3.0-only.

Resumen del árbol instalado (666 paquetes, verificado con `npm ls --all`):

- Licencias permisivas: MIT, Apache-2.0, ISC, BSD-2/3-Clause, 0BSD, BlueOak-1.0.0,
  CC0-1.0, Python-2.0, dominio público.
- Weak copyleft: MPL-2.0 solo en `lightningcss` (herramienta de build, no se
  distribuye en la app) y en `dompurify`, que ofrece elección
  `(MPL-2.0 OR Apache-2.0)` y se usa bajo **Apache-2.0**.
- **Sin** dependencias GPL, LGPL, AGPL, SSPL ni licencias no comerciales.

## Dependencias ejecutadas en la aplicación (incluidas en el bundle)

| Paquete | Versión resuelta | Licencia | Copyright / autor |
| --- | --- | --- | --- |
| `firebase` (y `@firebase/*`) | 11.10.0 | Apache-2.0 | Google LLC / Firebase |
| `jspdf` | 4.2.1 | MIT | Copyright (c) 2010-2025 James Hall, https://github.com/MrRio/jsPDF |
| `jspdf-autotable` | 5.0.8 | MIT | Copyright (c) 2014 Simon Bengtsson |
| `dompurify` | 3.4.16 | Apache-2.0 (elección de `(MPL-2.0 OR Apache-2.0)`) | Dr.-Ing. Mario Heiderich, Cure53 |
| `canvg` | 3.0.11 | MIT | Copyright (c) 2010 - present Gabe Lerner |
| `html2canvas` | 1.4.1 | MIT | Copyright (c) 2012 Niklas von Hertzen |
| `rgbcolor` (vía `canvg`) | 1.0.1 | MIT (elección de `MIT OR SEE LICENSE IN FEEL-FREE.md`) | Copyright (c) 2016 Stoyan Stefanov |
| `pako` (vía `jspdf` → `fast-png`) | 2.2.0 | MIT AND Zlib | Daiki Ueno |
| `@firebase/firestore` | 4.8.0 | Apache-2.0 | Google LLC / Firebase |

Los textos completos de cada licencia están en `node_modules/<paquete>/LICENSE`.

## Dependencias de desarrollo (no se distribuyen en la app)

| Paquete | Versión | Licencia |
| --- | --- | --- |
| `typescript` | ~6.0.2 | Apache-2.0 |
| `vite` | ^8.2.0 | MIT |
| `eslint`, `@eslint/js`, `typescript-eslint`, `globals` | 10.x / 8.x / 16.x | MIT |
| `firebase-tools` | 15.32.1 (fijada) | MIT |
| `@firebase/rules-unit-testing` | ^4.0.1 | Apache-2.0 |

Nota de limpieza: `valid-url@1.0.9` (cadena `firebase-tools → superstatic`)
**no declara licencia** en su `package.json`. Es una dependencia exclusivamente
de desarrollo, no se incluye en el bundle ni se redistribuye con la aplicación;
se documenta aquí como salvedad conocida y candidata a sustitución.

## Herramientas de especificación versionadas

| Contenido | Licencia | Autor |
| --- | --- | --- |
| `.opencode/commands/*.md` y `.opencode/skills/*/SKILL.md` | MIT (declarado en el front-matter de cada archivo) | `openspec` (generado con openspec CLI 1.7.0) |
| Texto de `openspec/` (proposals, design, specs) | AGPL-3.0-only (este repositorio) | proyecto ADOS Docs |

## Fuentes tipográficas, iconos e imágenes

- **Tipografías**: no se cargan fuentes externas. La aplicación usa la pila del
  sistema (`system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`).
- **Iconos e imágenes** (`public/icons/*`): recursos propios del proyecto
  (`icon.svg` y sus exportaciones PNG); no provienen de librerías de iconos de
  terceros.
- **Favicon** (`public/favicon.svg`): variante propia generada desde
  `public/icons/icon.svg` (mismo trazado, `viewBox` 512). Sustituye al favicon
  anterior de procedencia no documentada (exportación con efecto de desenfoque,
  no atribuible) durante la higiene prepublicación F6.5.
- No hay recursos remotos en `index.html` ni en el CSS: ningún `<link>`,
  `<script>` o `@import` apunta a CDNs.
