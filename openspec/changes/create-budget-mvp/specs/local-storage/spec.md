## Purpose

Define la persistencia local de la configuración de empresa, el catálogo de clientes y los presupuestos, manteniendo separados el dominio de la aplicación y la capa de almacenamiento.

## ADDED Requirements

### Requirement: Persistencia local de datos
El sistema SHALL persistir localmente la configuración de la empresa, los clientes y los presupuestos para que estén disponibles al reabrir la aplicación.

#### Scenario: Datos conservados al reabrir la app
- **WHEN** el usuario cierra la aplicación y la vuelve a abrir
- **THEN** la configuración, los clientes y los presupuestos guardados siguen disponibles

### Requirement: Sin conexión a internet
El sistema SHALL funcionar completamente sin conexión a internet, ya que todos los datos se almacenan localmente.

#### Scenario: Uso sin conexión
- **WHEN** el usuario usa la aplicación sin conexión
- **THEN** puede crear, editar, guardar y generar el PDF de presupuestos sin errores

### Requirement: Separación de dominio y almacenamiento
El sistema SHALL mantener separadas la lógica de dominio (entidades, cálculos, validaciones de negocio) y la capa de acceso al almacenamiento.

#### Scenario: Cambio de capa de almacenamiento
- **WHEN** se reemplaza el mecanismo local de almacenamiento por otro equivalente
- **THEN** la lógica de dominio no cambia

### Requirement: Aislamiento de datos
El sistema SHALL gestionar los datos de forma que la lógica de dominio no dependa del formato interno del almacenamiento.

#### Scenario: Lectura de datos guardados
- **WHEN** el sistema recupera un presupuesto guardado
- **THEN** la información se devuelve como una entidad de dominio válida, sin exponer el formato interno de almacenamiento

### Requirement: Compatibilidad con presupuestos antiguos
El sistema SHALL leer presupuestos guardados con la estructura anterior (partidas a nivel de presupuesto, sin secciones ni tipo de ítem) sin perder datos, migrándolos sobre la marcha a la estructura nueva.

#### Scenario: Presupuesto antiguo con partidas
- **WHEN** el sistema carga un presupuesto guardado que tiene partidas y no tiene secciones
- **THEN** migra todas las partidas a una sección automática de nombre "Obra general", les asigna el tipo "Otro" y conserva los totales y demás datos del presupuesto

#### Scenario: Recarga de un presupuesto migrado
- **WHEN** el usuario guarda de nuevo un presupuesto que fue migrado
- **THEN** el presupuesto queda persistido ya con la estructura de secciones

#### Scenario: Migración de estado
- **WHEN** el sistema carga una cotización guardada sin campo de estado (estructura anterior)
- **THEN** la cotización queda en estado "Pendiente" y aparece en las Cotizaciones activas, sin perder el resto de sus datos