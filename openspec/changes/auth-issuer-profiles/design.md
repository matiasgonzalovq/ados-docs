## Context

ADOS Docs (hoy ADOS Obras) es una PWA (Vite + TypeScript) con capas `domain / storage / pdf / ui`. Persistencia 100% en localStorage bajo claves `ados.company`, `ados.clients`, `ados.budgets`, `ados.nextBudgetNumber`; aplicación monousuario con un único emisor (`CompanyConfig`). El change anterior `create-budget-mvp` (secciones/ítems, estados, terminología "Cotización") está implementado, probado y sin archivar.

El operador ya creó en Firebase Console:
- Proyecto **ADOS Docs**.
- **Authentication** habilitado con correo electrónico + contraseña.
- **Cloud Firestore** en la región **Santiago**.
- Aplicación web registrada como **"ADOS Docs Web"**.

Este design describe cómo integrar Firebase en la app existente sin romper funcionalidad, sin eliminar datos locales y manteniendo la app operativa durante la migración. Ver proposal.md — Why.

## Goals / Non-Goals

**Goals**
- Integrar Firebase Auth (correo+contraseña) y Firestore multiusuario con ownership por `uid`.
- Perfiles emisores múltiples por usuario y `issuerSnapshot` inmutable por cotización.
- Diseñar Firestore extensible a otros documentos (contratos, OT, cobros) sin reestructurar.
- Migración segura e idempotente de los datos legacy del primer usuario, con respaldo.
- App operativa durante la migración; numeración por usuario sin colisiones ni renumeración.
- Configuración Firebase solo vía `VITE_FIREBASE_*` en `.env.local`; nada hardcodeado.

**Non-Goals**
- Google/Apple login, roles, equipos, permisos complejos, suscripciones/pagos/planes, IA.
- Implementar otros tipos de documento (contratos, OT, cobros) en este change — solo se deja la arquitectura preparada.
- Eliminar física de los datos legacy durante este change (se conserva respaldo).

## Decisions

### D1. SDK modular de Firebase
Se usa el SDK modular (v9+) con importaciones específicas (`firebase/app`, `firebase/auth`, `firebase/firestore`); no el legacy/compat. Inicialización única en `src/firebase/config.ts` leyendo `import.meta.env.VITE_FIREBASE_*`. Alternativa descartada: compat SDK (menor tree-shaking, se elimina progresivamente).

### D2. Configuración por variables de entorno
Se crea `.env.example` (sin valores) declarando `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` (y `VITE_FIREBASE_STORAGE_BUCKET` si aplica). El operador copia `.env.example` a `.env.local` y completa los valores reales. `.env.local` ya está cubierto por `*.local` en `.gitignore`. En la implementación: si faltan valores, la app no inicializa Firebase y muestra un error claro en español (no falla en mudas condiciones de red).

### D3. Persistencia principal Firestore, localStorage como respaldo migratorio
Firestore es la fuente de verdad durante la sesión. La capa `storage/store.ts` actual se mantiene para leer/escribir las claves legacy, usado únicamente para: (a) detectar datos a migrar, (b) escribir respaldo `ados.legacyBackup.*`, (c) funcionamiento en primera carga antes de login cuando no hay red (consulta de migración pendiente). No es la vía normal de operación.

### D4. Acceso requiere sesión
`main.ts` inicia `onAuthStateChanged`. Sin sesión → vista de autenticación. Con sesión → se carga el estado del usuario desde Firestore. Una sesión activa por navegador. Logout: `signOut` + limpieza de `App.state` en memoria; no elimina datos de Firestore ni caché.

### D5. Modelo de dominio

```ts
type UserProfile = {
  uid: string
  displayName?: string
  phone?: string
  createdAt: string
}

type IssuerProfile = {
  id: string
  ownerUid: string
  kind: 'empresa' | 'persona'
  name: string          // razón social o nombre
  rut?: string
  phone?: string
  email?: string
  address?: string
  logoDataUrl?: string  // opcional ~1 MB
  info?: string
  isDefault?: boolean
  createdAt: string
  updatedAt: string
}

type IssuerSnapshot = {   // dentro de Budget
  issuerId: string
  kind: 'empresa' | 'persona'
  name: string
  rut?: string
  phone?: string
  email?: string
  address?: string
  logoDataUrl?: string
  info?: string
}
```

`Budget` agrega `issuerSnapshot: IssuerSnapshot` (mismo patrón que `clientSnapshot`: congelado al emitir).

### D6. Estructura de Firestore (extensible)

```
users/{uid}
  profile                        UserProfile
  issuers/{issuerId}             IssuerProfile
  clients/{clientId}             Client
  quotes/{quoteId}               Cotización (design de future: otros tipos como documentos subcolección)
  meta/counter                   { nextNumber }  // numeración por usuario
```

Se usa `quotes/{quoteId}` como colección del documento cotización, dejando el espacio para futuros tipos bajo `users/{uid}/…` (p. ej. `contracts`, `work-orders`, `invoices`), todos protegidos por la misma regla wildcard `users/{uid}/{document=**}`. Se mantiene `budgets` como nombre interno del tipo en el domain (sin renombrar la entidad `Budget`).

### D7. Numeración por usuario
`users/{uid}/meta/counter.nextNumber` se lee con transacción (`runTransaction`) en cada creación, garantizando `max(números migrados)+1` y ausencia de colisiones entre cuentas; eliminar una cotización no retrocede el contador.

### D8. Seguridad (reglas de Firestore)
Se versiona `firebase/firestore.rules` (o raíz `firestore.rules`):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

Acceso solo del dueño autenticado; sin auth → denegado; entre usuarios → denegado. Pruebas de reglas vía emulador de Firestore.

### D9. Offline razonable
Se habilita la caché persistente de Firestore (`enableIndexedDbPersistence`) con detección de indisponibilidad (mensajes en español). Lectura desde caché sin red; escrituras encoladas y sincronizadas al reconectar. No se bloquea la UI (indicadores de carga/error).

### D10. Migración desde localStorage (app operativa)
Flujo en el primer login de un usuario con datos legacy:

1. `onAuthStateChanged` → usuario autenticado → se consulta Firestore.
2. Si el usuario es nuevo (sin `users/{uid}` datos) y existen claves `ados.*` sin respaldo aún, se muestra un diálogo "¿Importar los datos de este dispositivo?".
3. Aceptado: se migra `ados.company` → `users/{uid}/issuers/issuer-legacy` (empresa, `isDefault: true`); `ados.clients` → `users/{uid}/clients/{id}`; `ados.budgets` → `users/{uid}/quotes/{id}` (conservando número/estado; inyectando `issuerSnapshot` derivado del `CompanyConfig`); `ados.nextBudgetNumber` → `meta/counter` = `max(números migrados)+1`.
4. Se escribe bandera de migración (documento `users/{uid}/meta/migration` con `legacyImported: true`) y respaldo `ados.legacyBackup.*` con copia de los valores originales.
5. La app continúa operando (no se destruye localStorage); el respaldo se conserva hasta verificación manual (task de post-verificación documenta cómo quitarlo).

Si se rechaza: no se importa y no se vuelve a preguntar para esa cuenta (la bandera se registra igualmente como `dismissed`).

## Risks / Trade-offs

- [App depende de inicio de Firestore] → Si faltan `VITE_FIREBASE_*` la app muestra error claro y no inicia; no hardcodear.
- [Caché offline de Firestore bloqueada en algunos navegadores (3rd-party) ] → Detección y mensajes en español; fallback a lectura desde localStorage solo para consultar migración pendiente.
- [Migración puede fallar a mitad] → Transacciones por lote + bandera idempotente + respaldo `ados.legacyBackup.*`; la app no depende de que la migración esté completa.
- [Regresión de change anterior] → No se modifica `create-budget-mvp`; pruebas de regresión existentes + nuevas.
- [Contraseñas en claro] → Nunca; Firebase Auth gestiona hashing/sesiones; no se persisten credenciales en la app.

## Migration Plan

- No hay deploy de backend propio; el operador publica las reglas de Firestore (`firestore.rules`) y habilita Email/Password en Firebase Console (ya hecho).
- Migración de datos legacy descrita en D10, idempotente y con respaldo.
- Rollback: conservando localStorage y no destructivo; si la integración falla, la app puede volver temporalmente al modo localStorage legacy (decisión operativa, no estructural del change).

## Open Questions

- Renombrar "ADOS Obras" → "ADOS Docs" en la interfaz (manifest, strings, favicon) se deja como decisión separada o mini-task; no bloquea este change.
- Al editar una cotización ya numerada y cambiar de emisor explícitamente, ¿se congela un nuevo `issuerSnapshot`? (asumido: sí).
- Límite de documento Firestore (1 MiB): el logo (~1 MB dataURL) puede empujar el documento de perfil emisor cerca del límite; se confirma si usar Storage de Firebase en vez de dataURL (decisión posterior, no bloqueante para este change).

### D12. Logo como dataURL (decisión del MVP)
Se mantiene el logo como `logoDataUrl` (base64) dentro del documento del perfil emisor (`users/{uid}/issuers/{issuerId}`) para este MVP. No se usa Cloud Storage todavía. Limitación aproximada: cada documento Firestore admite hasta **1 MiB** de datos, por lo que un logo muy grande (cercano a 1 MB en base64) puede acercarse al límite del documento del perfil emisor. La migración de logo a Cloud Storage se deja como mejora posterior, no bloqueante para este change.