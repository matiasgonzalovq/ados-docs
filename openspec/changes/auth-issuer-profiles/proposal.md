## Why

ADOS Docs (hoy ADOS Obras) es una PWA monousuario con persistencia 100% local (localStorage) y un único emisor (`CompanyConfig`). El usuario de ADOS Docs necesita usar la misma cuenta desde varios dispositivos, con datos aislados por usuario y con la posibilidad de emitir documentos desde uno o más perfiles emisores (empresa o persona natural). Se parte de un proyecto Firebase ya creado ("ADOS Docs"), con Authentication habilitado (correo+contraseña), Firestore en la región de Santiago y una app web registrada ("ADOS Docs Web").

## What Changes

Se integra **Firebase Authentication + Cloud Firestore** como base multiusuario, sin romper la funcionalidad actual y sin eliminar los datos locales existentes.

- Registro, inicio y cierre de sesión con correo+contraseña vía Firebase Auth.
- Sección "Mi perfil" en Ajustes con los datos básicos de la cuenta.
- Perfiles emisores por usuario (empresa o persona natural) con nombre/razón social, RUT, teléfono, correo, dirección, logo opcional e información adicional; crear, editar, eliminar (con confirmación) y definir uno predeterminado.
- Cada cotización congela un `issuerSnapshot` inmutable al crearla; editarla/eliminarla posteriormente no altera cotizaciones históricas.
- Persistencia principal en Cloud Firestore con ownership por `uid` y reglas de seguridad que impiden leer/modificar datos de otro usuario.
- El diseño de Firestore permite incorporar después otros documentos (contratos, órdenes de trabajo, documentos de cobro) reutilizando la misma estructura de aislamiento por usuario.
- Migración segura de los datos legacy (configuración de empresa, clientes, cotizaciones, siguiente número) al primer perfil emisor del primer usuario conectado, manteniendo la app operativa y conservando respaldo hasta verificar.
- Numeración de cotizaciones por usuario, sin renumerar por eliminación y sin colisiones en datos migrados.
- Configuración de Firebase mediante variables de entorno (`VITE_FIREBASE_*`); **no** se hardcodean credenciales ni se inventa un `firebaseConfig` versionado.

Fuera del alcance actual: Google/Apple login, roles administrativos, equipos, permisos complejos, suscripciones, pagos, IA y otros tipos de documento (solo se prepara la arquitectura).

## Capabilities

### New Capabilities

- `authentication`: registro, inicio y cierre de sesión con correo+contraseña vía Firebase Authentication; una sesión activa por navegador; logout limpia estado en memoria sin borrar datos persistidos.
- `user-profile`: perfil básico de la cuenta ("Mi perfil" en Ajustes) con datos básicos del usuario autenticado.
- `issuer-profiles`: CRUD de perfiles emisores por usuario (empresa o persona natural), perfil predeterminado y selección del emisor al crear una cotización.
- `quote-issuer-snapshot`: snapshot inmutable del emisor en cada cotización; editar/eliminar posteriores del perfil no afecta documentos históricos.
- `firestore-storage`: Cloud Firestore como persistencia principal con ownership por `uid`, numeración por usuario, comportamiento offline razonable y estructura extensible a otros tipos de documento.
- `firestore-security`: reglas de seguridad de Firestore que restringen lectura/escritura a `users/{uid}/…` para el dueño autenticado.
- `data-migration`: migración idempotente de localStorage (empresa, clientes, cotizaciones, contador) al primer perfil emisor del primer usuario, con respaldo conservado y la app operativa durante el proceso.

### Modified Capabilities

- Ninguna con delta de spec pendiente: el change previo `create-budget-mvp` queda intacto y sin archivar. La migración a Firestore será el mecanismo principal sin alterar las especificaciones de ese change.

## Impact

- **Código**: se agregan `src/firebase/` (config, auth, repositorios de Firestore) y una capa de acceso a datos que pasa a ser asíncrona y scoped por usuario; `App.state`/`save()` pasan a soportar Firestore con escritura optimista y lectura de caché offline; localStorage conserva solo el rol de respaldo migratorio legacy.
- **Dependencias**: se agrega el SDK modular de Firebase (`firebase/app`, `firebase/auth`, `firebase/firestore`) en `package.json`.
- **Configuración**: se agrega `.env.example` con las claves `VITE_FIREBASE_*` **sin valores**; el operador crea `.env.local` (ignorado por git vía `*.local`, ya presente en `.gitignore`) con los valores de su proyecto Firebase. Ninguna credencial se versiona.
- **Datos**: la key `ados.nextBudgetNumber` pasa de global a por usuario (`users/{uid}/meta/counter`); las claves `ados.*` originales se conservan como respaldo hasta verificación manual.
- **Idioma y moneda**: es-CL / CLP; textos nuevos en español.