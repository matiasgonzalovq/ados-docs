# Contribuir a ADOS Docs

Gracias por tu interés en el proyecto. ADOS Docs se mantiene con revisión
manual: si sigues esta guía, tu cambio se revisará mucho más rápido.

## Antes de empezar

1. Lee [`PRODUCT.md`](PRODUCT.md) para entender qué es y qué no es el producto.
2. Lee la sección *Puesta en marcha* del [`README.md`](README.md).
3. Revisa [`openspec/`](openspec): si tu cambio altera comportamiento observable,
   propón primero un cambio OpenSpec en `openspec/changes/<nombre>/`
   (proposal, design, specs delta, tasks) en lugar de mandar solo código.
4. Aplica el [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

## Entorno local

```bash
npm install
cp .env.example .env.local   # solo si vas a probar con tu propio proyecto Firebase
npm run dev
```

Para las pruebas que arrancan emuladores necesitas JDK 17+.
`firebase-tools` se instala con `npm ci`; no hace falta instalarlo globalmente.

## Calidad obligatoria

El mínimo para cualquier PR es:

```bash
npm run verify
```

(typecheck + lint + pruebas de dominio + gates de seguridad + build).

Cuando toques otras áreas, suma:

| Si cambias... | Ejecuta además |
| --- | --- |
| `firestore.rules` | `npm run test:rules` |
| UI, vistas o flujos | `npm run test:regression` |
| todo lo anterior | `npm run verify:all` |

`npm run verify:all` necesita JDK y levanta los emuladores locales.

## Reglas duras

- **Nunca** apuntes a un proyecto real: las pruebas solo aceptan `projectId`
  `demo-*` sobre `127.0.0.1`/`localhost` y fallan (fail closed) si detectan un
  proyecto de producción.
- No versionar `.firebaserc`, `.env.local` ni credenciales. Toda la
  configuración pasa por variables `VITE_FIREBASE_*` documentadas en
  `.env.example`.
- No introducir datos personales reales (clientes, RUT, correos) en fixtures o
  snapshots: usa datos de ejemplo (`@example.com`, `Constructora Demo`, etc.).
- Nuevas dependencias solo con justificación: licencia compatible (permissiva o
  weak copyleft), mantenimiento activo, impacto en `npm audit` y en el tamaño
  del bundle. Prohibido `npm audit fix --force`.
- Sin credenciales, tokens ni `secrets.` en los workflows de CI.

## Estilo

- Commit messages en inglés con prefijo convencional: `feat:`, `fix:`,
  `refactor:`, `docs:`, `chore:`, `ci:`, `test:`.
- Textos de interfaz en español, en `src/ui/strings.ts`.
- TypeScript estricto: sin `any` innecesario; `npm run typecheck` debe pasar.
- ESLint sin suppressions nuevas; si una regla molesta, discútela en el PR.
- Lógica de negocio en `src/domain` (pura, testeable con `npm test`); acceso a
  red solo en `src/firebase`.
- Las pruebas de dominio viven en `src/domain/tests.ts` y corren sin red.

## PRs

- Describe *qué* cambió y *por qué*; enlaza el cambio OpenSpec si existe.
- Incluye la salida de `npm run verify` (y de las suites que hayas corrido).
- Un PR por idea; evita refactor mezclado con feature.
- Los cambios en `openspec/` deben mantener `tasks.md` sincronizado con el
  estado real de la implementación.

## Herramientas opcionales para agentes

`.opencode/` contiene comandos y skills de OpenSpec para agentes compatibles
(publicados bajo licencia MIT de sus autores). Son opcionales: puedes
contribuir sin ningún agente, usando la CLI `openspec` directamente.

## Licencia de las contribuciones

Al enviar una contribución confirmas que puedes licenciarla bajo
**AGPL-3.0-only**, la misma licencia del proyecto. No envíes código que no
puedas distribuir con esa licencia (por ejemplo, código con licencias
incompatibles o copyleft fuerte sin autorización).
