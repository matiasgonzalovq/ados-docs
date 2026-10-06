# Tareas — auth-issuer-profiles

## 1. Dependencias y configuración de Firebase

- [x] 1.1 Agregar dependencias del SDK modular de Firebase en `package.json` (`firebase/app`, `firebase/auth`, `firebase/firestore`).
- [x] 1.2 Crear `.env.example` con las claves `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` (y `VITE_FIREBASE_STORAGE_BUCKET` si aplica) **sin valores**. Verificar que `.env.local` queda ignorado por git (`*.local` ya en `.gitignore`).
- [x] 1.3 DETENERSE y solicitar al operador los valores reales que debe completar en `.env.local` (apiKey, authDomain, projectId, appId, storageBucket) tomados de la app "ADOS Docs Web" en Firebase Console. No inventar ni commitear valores.
- [x] 1.4 Crear `src/firebase/config.ts` que inicializa Firebase Auth + Firestore leyendo `import.meta.env.VITE_FIREBASE_*`; si faltan valores, la app no inicia Firebase y muestra mensaje claro en español.

## 2. Autenticación

- [ ] 2.1 Implementar registro (correo+contraseña) vía `createUserWithEmailAndPassword` y creación de `users/{uid}/profile` por defecto.
- [x] 2.2 Implementar inicio de sesión vía `signInWithEmailAndPassword` con errores en español.
- [x] 2.3 Implementar cierre de sesión vía `signOut`, limpiando `App.state` en memoria sin borrar datos persistidos.
- [x] 2.4 Integrar `onAuthStateChanged` para la vista inicial (auth vs app) y el cambio de cuenta sin mezclar datos.
- [x] 2.5 Crear vista de autenticación (registro/login/logout) con textos en español y validaciones de formulario.
- [ ] 2.6 Pruebas unitarias del flujo de autenticación con estado de Firebase Auth mockeado.

## 3. Modelo de dominio y tipos

- [x] 3.1 Añadir a `src/domain/types.ts`: `UserProfile`, `IssuerProfile` (with `kind: 'empresa' | 'persona'`), `IssuerSnapshot`, y ampliar `Budget` con `issuerSnapshot`.
- [x] 3.2 Validadores de dominio para `IssuerProfile` (nombre obligatorio) y `UserProfile`.
- [x] 3.3 Pruebas unitarias de tipos/validadores nuevos en `src/domain/tests.ts` (sin dependencia de Firebase).

## 4. Perfil de usuario

- [x] 4.1 Sección "Mi perfil" en Ajustes: correo de solo lectura (desde Firebase Auth) y edición de nombre mostrado/teléfono opcional.
- [x] 4.2 Persistir cambios bajo `users/{uid}/profile`.

## 5. Perfiles emisores

- [x] 5.1 CRUD de `IssuerProfile` bajo `users/{uid}/issuers/` (crear, editar, eliminar con confirmación) con `kind` empresa/persona.
- [x] 5.2 Definir perfil predeterminado (máximo uno; reiniciar predeterminado al eliminar el actual).
- [x] 5.3 Selector de perfil emisor al crear/editar cotizaciones con preselección del predeterminado.
- [ ] 5.4 Pruebas unitarias y de regresión del CRUD, selección y predeterminado.

## 6. issuerSnapshot en cotizaciones

- [x] 6.1 Congelar `issuerSnapshot` al guardar una cotización nueva (datos del emisor elegido).
- [x] 6.2 Conservar `issuerSnapshot` al editar sin cambiar el emisor; reemplazar solo cuando el usuario cambia el perfil.
- [x] 6.3 Adaptar `src/pdf/pdf.ts` y el historial para usar `issuerSnapshot` como fuente del emisor (no `CompanyConfig` global).
- [x] 6.4 Pruebas de que editar/eliminar un perfil no modifica `issuerSnapshot` de cotizaciones históricas.

## 7. Persistencia Firestore y numeración por usuario

- [x] 7.1 Adaptar el acceso a datos (nueva capa `src/firebase/store.ts` o repositorios) para lectura/escritura asíncrona contra `users/{uid}/…` (profile, issuers, clients, quotes, meta).
- [x] 7.2 Implementar `meta/counter` por usuario (`runTransaction`) con `max(números)+1` y sin renumeración por eliminación.
- [x] 7.3 Ajustar `src/storage/store.ts` para que las claves legacy (`ados.*`) se usen solo como fuente migratoria y para respaldos `ados.legacyBackup.*`.
- [ ] 7.4 Habilitar caché offline de Firestore y estados de carga/error en español.
- [ ] 7.5 Pruebas de aislamiento entre usuarios (rutas y numeración independientes) y de lectura offline.

## 8. Seguridad de Firestore

- [x] 8.1 Añadir `firestore.rules` versionado con la regla wildcard `users/{uid}/{document=**}` (solo dueño).
- [x] 8.2 Pruebas de seguridad con emulador de Firestore: dueño permitido, otro usuario denegado, sin auth denegado.
- [ ] 8.3 Documentar los pasos del operador para publicar las reglas en Firebase Console.

## 9. Migración de datos legacy

- [x] 9.1 Detección de datos legacy (`ados.*`) y ausencia de bandera de migración en la cuenta; no preguntar dos veces.
- [x] 9.2 Diálogo de consentimiento "¿Importar datos de este dispositivo?".
- [x] 9.3 Migrar `ados.company` → `issuers/issuer-legacy` (empresa, `isDefault: true`).
- [x] 9.4 Migrar `ados.clients` → `users/{uid}/clients/{id}` y `ados.budgets` → `users/{uid}/quotes/{id}` conservando ids, números y estados; inyectar `issuerSnapshot` derivado del `CompanyConfig`.
- [x] 9.5 Migrar contador: `meta/counter = max(números)+1` (o legacy si es mayor), sin colisiones.
- [x] 9.6 Escribir bandera de migración (`meta/migration`) y respaldo `ados.legacyBackup.*`; la app continúa operando; el respaldo se conserva hasta verificación manual.
- [ ] 9.7 Pruebas de migración (idempotencia, conservación de números, snapshot legacy, reintento sin duplicar, rechazo del usuario).

## 10. Integración con la app (Inicio, Config, PDF)

- [x] 10.1 Requerir sesión en arranque: sin sesión se muestra autenticación; con sesión se cargan datos del `uid` activo.
- [x] 10.2 Ajustes: sección "Mi perfil" + gestión de perfiles emisores.
- [x] 10.3 Editor de cotización: selector de emisor y `issuerSnapshot` (PDF + historial usan snapshot).
- [ ] 10.4 Quitar del flujo normal el uso de `CompanyConfig` global como emisor (queda solo como fuente migratoria).

## 11. Pruebas finales y verificación

- [ ] 11.1 Actualizar `src/domain/tests.ts` con: validadores de issuer/snapshot, numeración por usuario, migración idempotente.
- [ ] 11.2 Ampliar `src/ui/regression.test.mjs` con flujos: registro/login/logout, gestión de perfiles, selección de emisor, snapshot no cambia tras editar perfil, aislamiento entre usuarios, migración desde localStorage.
- [x] 11.3 Ejecutar `npm test`, `npm run test:regression` y `npm run build` (sin errores).
- [x] 11.4 Revisar el diff y confirmar que no se introducen regresiones frente a `create-budget-mvp` (no se archiva ni se modifica su funcionalidad).
- [x] 11.5 Marcar tareas completadas y dejar el change sin archivar.

## Pendientes de aprobación / datos necesarios (bloqueante de implementación)

- Valores Firebase de la app "ADOS Docs Web" (API key, Auth domain, Project ID, App ID, y storage bucket si aplica) para `.env.local`.
- Confirmación del mecanismo de prueba de reglas (emulador de Firestore).
- Decisión de visualizar el logo como dataURL vs Storage de Firebase (se mantiene dataURL mientras quepa en el límite de documento).

## Verificación de estado (F6.5 — higiene prepublicación)

Revisión evidencia-contra-pendiente: 37/47 tareas verificadas `[x]`; 10 siguen abiertas.

| # | Tarea | Por qué sigue abierta |
| --- | --- | --- |
| 2.1 | Registro + `users/{uid}/profile` por defecto | El registro existe; el perfil por defecto solo se construye en memoria (`app.ts` `loadUserData`) y se persiste al guardar (`saveProfile`), no al registrarse. |
| 2.6 | Pruebas unitarias de Auth mockeado | No existen; la autenticación solo se prueba E2E en la regresión. |
| 5.4 | Pruebas de CRUD/selección/predeterminado | Regresión cubre crear/editar/persistencia; faltan selección, predeterminado y eliminación. |
| 7.4 | Caché offline + estados de carga/error | Sin `enableIndexedDbPersistence`/`persistentLocalCache` ni estados de carga/error en la capa de datos. |
| 7.5 | Aislamiento y lectura offline en pruebas | El aislamiento de rutas está cubierto por `test:rules`; faltan numeración independiente y lectura offline. |
| 8.3 | Pasos en Firebase Console | La publicación de reglas está documentada por CLI en `README.md`; faltan los pasos de Consola. |
| 9.7 | Pruebas de migración | Sin cobertura de idempotencia/reintento/rechazo; la regresión no inyecta datos legacy. |
| 10.4 | Sacar `CompanyConfig` del flujo normal | `src/pdf/pdf.ts` aún recibe `CompanyConfig` como *fallback* de tema (`themeRgb`) cuando el snapshot no trae color. |
| 11.1 | `src/domain/tests.ts` ampliado | Faltan numeración por usuario y migración idempotente (no son dominio puro). |
| 11.2 | Regresión ampliada | Faltan aislamiento entre usuarios y migración desde `localStorage`. |
