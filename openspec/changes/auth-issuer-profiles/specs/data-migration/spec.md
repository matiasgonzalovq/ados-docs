## Purpose

Define la **migración segura** de los datos legacy de localStorage (`CompanyConfig`, clientes, cotizaciones, siguiente número) hacia el nuevo modelo multiusuario en Firestore, al primer inicio de sesión de un usuario. La migración no pierde datos, es idempotente y conserva respaldo hasta que se verifica el éxito. La configuración actual del usuario (por ejemplo, "Constructora Demo SpA") se convierte en el primer perfil emisor del usuario.

## ADDED Requirements

### Requirement: Migración del CompanyConfig al primer perfil emisor

El sistema SHALL convertir los datos del `CompanyConfig` actual (`ados.company`) en el primer `IssuerProfile` del usuario, marcado como predeterminado.

#### Scenario: Usuario con empresa configurada
- **WHEN** un usuario inicia sesión por primera vez y existen datos legacy de empresa
- **THEN** se crea `users/{uid}/issuers/issuer-legacy` con `name`, `rut`, `phone`, `email`, `address` y `logoDataUrl` copiados de `ados.company`, marcado `isDefault: true`

#### Scenario: Empresa vacía o sin datos
- **WHEN** no hay CompanyConfig configurado
- **THEN** no se crea un perfil emisor automático; el usuario crea sus perfiles normalmente

### Requirement: Migración de clientes

El sistema SHALL copiar los clientes existentes (`ados.clients`) bajo `users/{uid}/clients/` conservando su id.

#### Scenario: Clientes legacy
- **WHEN** se migran clientes
- **THEN** cada cliente conserva su id y campos, y queda bajo `users/{uid}/clients/{clientId}`

### Requirement: Migración de cotizaciones

El sistema SHALL copiar las cotizaciones existentes (`ados.budgets`) bajo `users/{uid}/quotes/`, conservando su id y número, e inyectándoles un `issuerSnapshot` derivado del `CompanyConfig` legacy cuando no lo tengan.

#### Scenario: Totas las cotizaciones conservadas
- **WHEN** se migran cotizaciones
- **THEN** cada una conserva id, número, contenido y estado, y se persiste bajo `users/{uid}/quotes/{budgetId}`

#### Scenario: snapshot del emisor legacy
- **WHEN** una cotización migrada no tiene `issuerSnapshot`
- **THEN** se le asigna un snapshot derivado de los datos de `ados.company` (como si el emisor fuese "Constructora Demo SpA")

### Requirement: Numeración migrada sin colisiones

El sistema SHALL conservar la numeración existente al migrar: el contador del usuario arranca en `max(número de cotización migrada) + 1` (o el valor legacy si es mayor), sin colisiones y sin renumerar.

#### Scenario: Contador tras la migración
- **WHEN** migra un usuario con cotizaciones numeradas (por ejemplo, hasta N)
- **THEN** su `meta/counter` queda en `N + 1`, y la siguiente cotización nueva usa N+1

#### Scenario: Sin renumeración
- **WHEN** se elimina una cotización después de migrar
- **THEN** las demás conservan sus números y no se rellenan huecos

### Requirement: Respaldo y verificación

El sistema SHALL conservar un respaldo de los datos legacy y no borrar las claves originales `ados.*` hasta que la migración haya sido verificada con éxito.

#### Scenario: Respaldo conservado
- **WHEN** se completa la migración
- **THEN** los datos originales se conservan (p. ej. bajo claves `ados.legacyBackup.*` o el formato original intacto) y se marca la migración como realizada

#### Scenario: Reintento idempotente
- **WHEN** la migración se interrumpe y se reanuda
- **THEN** se completa sin duplicar documentos ni datos (bandera de migración ya escrita no dispara de nuevo la importación)

#### Scenario: Verificación manual
- **WHEN** el operador confirma que la migración fue correcta
- **THEN** el respaldo legacy puede eliminarse (acción manual, fuera del flujo normal)

### Requirement: Consentimiento del usuario

El sistema SHALL solicitar confirmación al usuario antes de importar datos legacy (p. ej. diálogo "¿Importar los datos existentes de este dispositivo?").

#### Scenario: Acepta la importación
- **WHEN** el usuario confirma la importación
- **THEN** los datos legacy se migran a su cuenta

#### Scenario: Rechaza la importación
- **WHEN** el usuario rechaza la importación
- **THEN** la app continúa sin datos legacy y no vuelve a preguntar en esa cuenta (sin perder el respaldo local)