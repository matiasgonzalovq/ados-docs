## Purpose

Permite administrar el catálogo local de clientes de ADOS Obras (nombre, RUT opcional, teléfono y dirección) y asociarlos a los presupuestos.

## ADDED Requirements

### Requirement: Crear cliente
El sistema SHALL permitir crear un cliente con nombre obligatorio y RUT opcional, teléfono y dirección.

#### Scenario: Crear cliente con todos los datos
- **WHEN** el usuario ingresa nombre, RUT, teléfono y dirección de un cliente
- **THEN** el sistema lo guarda en el catálogo local

#### Scenario: Crear cliente solo con nombre
- **WHEN** el usuario crea un cliente dejando RUT, teléfono y dirección vacíos
- **THEN** el sistema lo guarda igualmente

#### Scenario: Cliente sin nombre
- **WHEN** el usuario intenta guardar un cliente sin nombre
- **THEN** el sistema muestra un mensaje en español y no guarda

### Requirement: Editar cliente
El sistema SHALL permitir modificar los datos de un cliente existente y reflejar los cambios en los presupuestos que lo utilicen.

#### Scenario: Actualizar datos de cliente
- **WHEN** el usuario modifica el teléfono de un cliente existente y guarda
- **THEN** el presupuesto que usa ese cliente muestra el nuevo teléfono

### Requirement: Eliminar cliente
El sistema SHALL permitir eliminar un cliente del catálogo.

#### Scenario: Eliminar cliente no usado
- **WHEN** el usuario confirma la eliminación de un cliente
- **THEN** el sistema lo elimina del catálogo

#### Scenario: Eliminar cliente usado por presupuestos
- **WHEN** el usuario elimina un cliente asociado a presupuestos guardados
- **THEN** los presupuestos conservan los datos del cliente tal como estaban al momento del guardado

### Requirement: Seleccionar cliente en un presupuesto
El sistema SHALL permitir elegir un cliente del catálogo al crear o editar un presupuesto.

#### Scenario: Seleccionar cliente existente
- **WHEN** el usuario elige un cliente de la lista al crear un presupuesto
- **THEN** el presupuesto queda asociado a ese cliente y muestra sus datos
