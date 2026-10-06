## Purpose

Define **Cloud Firestore** como persistencia principal de ADOS Docs, con ownership por `uid`, numeración de cotizaciones por usuario y comportamiento offline razonable mediante la caché local de Firestore. El acceso a datos es asíncrono y seccionalizado por usuario. La estructura queda **extensible** a otros tipos de documento (contratos, órdenes de trabajo, documentos de cobro) bajo el mismo aislamiento por usuario.

## ADDED Requirements

### Requirement: Estructura de Firestore por usuario

El sistema SHALL almacenar los datos del usuario bajo la colección `users/{uid}` de Firestore, agrupados por tipo: `profile`, `issuers/{issuerId}`, `clients/{clientId}`, `quotes/{quoteId}` y `meta/counter` (y `meta/migration` para la bandera de migración).

#### Scenario: Escritura de datos
- **WHEN** el usuario guarda una cotización, un cliente, un perfil emisor o su perfil
- **THEN** el documento se almacena bajo la ruta `users/{uid}/…` correspondiente

#### Scenario: Lectura de datos
- **WHEN** la app carga la sesión de un usuario
- **THEN** lee exclusivamente los documentos bajo `users/{su-uid}/…`

#### Scenario: Estructura extensible a otros documentos
- **WHEN** en el futuro se incorporan otros tipos de documento (contratos, órdenes de trabajo, cobros)
- **THEN** se agregan como subcolecciones de `users/{uid}/…` (por ejemplo `contracts`, `work-orders`, `invoices`) sin reestructurar el aislamiento existente

### Requirement: Aislamiento entre usuarios

El sistema SHALL aislar totalmente los datos entre usuarios: ningún usuario lee ni escribe datos de otro.

#### Scenario: Dos usuarios distintos
- **WHEN** dos usuarios usan la app
- **THEN** cada uno ve y modifica solo sus propios perfiles, clientes y cotizaciones

#### Scenario: Cambio de cuenta
- **WHEN** el usuario cierra sesión e inicia con otra cuenta
- **THEN** la app solo presenta los datos de la cuenta activa

### Requirement: Numeración de cotizaciones por usuario

El sistema SHALL mantener la numeración de cotizaciones por usuario (contador en `users/{uid}/meta/counter`), sin colisiones entre usuarios y sin renumerar las existentes al eliminar.

#### Scenario: Nuevo número de cotización
- **WHEN** un usuario crea una cotización nueva
- **THEN** se le asigna el siguiente número del contador de ese usuario y el contador avanza

#### Scenario: Eliminación no renumera
- **WHEN** un usuario elimina una cotización
- **THEN** las cotizaciones restantes conservan sus números y el contador no retrocede

#### Scenario: Aislamiento de numeración
- **WHEN** dos usuarios crean cotizaciones
- **THEN** cada uno tiene su propia secuencia de números independiente

### Requirement: Comportamiento offline razonable

El sistema SHALL aprovechar la caché local de Firestore para permitir lectura de datos previamente cargados sin conexión, encolar escrituras y sincronizar al recuperar conexión.

#### Scenario: Lectura sin conexión
- **WHEN** el dispositivo está sin red pero los datos ya fueron cargados
- **THEN** la app muestra los datos desde la caché local (con indicación de estado offline si aplica)

#### Scenario: Escritura pendiente de conexión
- **WHEN** el usuario guarda cambios sin conexión
- **THEN** Firestore encola la escritura y la sincroniza cuando hay red, sin perder datos

### Requirement: App asíncrona no bloqueante

El sistema SHALL operar con operaciones de datos asíncronas (lectura/escritura contra Firestore) sin bloquear la interfaz, mostrando estados de carga/error en español.

#### Scenario: Carga con indicador
- **WHEN** la app carga la sesión y sus datos
- **THEN** se muestra un estado de carga y luego los datos, o un mensaje de error en español si la carga falla