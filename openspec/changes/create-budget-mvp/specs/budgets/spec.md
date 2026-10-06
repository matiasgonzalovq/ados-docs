## Purpose

Define el ciclo de vida del presupuesto: creación con número correlativo y fecha, guardado, edición conservando el número, duplicación con número y fecha nuevos, historial y eliminación. El contenido del presupuesto se organiza en secciones que contienen ítems (ver budget-sections/spec.md).

## ADDED Requirements

### Requirement: Crear presupuesto
El sistema SHALL permitir crear un presupuesto con número correlativo, fecha, cliente, nombre y dirección de la obra, forma de pago, vigencia, observaciones, descuento opcional, IVA configurable y al menos una sección con ítems válidos.

#### Scenario: Crear presupuesto válido
- **WHEN** el usuario crea un presupuesto con cliente y al menos un ítem válido (dentro de una sección) y guarda
- **THEN** el sistema asigna un número correlativo y la fecha actual y lo guarda en el historial

#### Scenario: Número correlativo
- **WHEN** el usuario crea un presupuesto nuevo
- **THEN** el sistema le asigna el número correlativo siguiente al último presupuesto guardado

#### Scenario: No guardar sin cliente
- **WHEN** el usuario intenta guardar un presupuesto sin cliente
- **THEN** el sistema muestra un mensaje en español y no guarda

#### Scenario: No guardar sin ítems válidos
- **WHEN** el usuario intenta guardar un presupuesto sin ítems o con ítems inválidos
- **THEN** el sistema muestra un mensaje en español y no guarda

#### Scenario: Sección vacía
- **WHEN** el presupuesto contiene una sección sin ítems y otras secciones con ítems válidos
- **THEN** el presupuesto se puede guardar y la sección vacía contribuye con cero al total

### Requirement: Guardar presupuesto en borrador
El sistema SHALL permitir guardar un presupuesto incompleto como borrador para continuar después.

#### Scenario: Guardar como borrador
- **WHEN** el usuario guarda un presupuesto sin cliente o sin ítems válidos
- **THEN** el sistema lo guarda marcado como borrador y aparece en el historial

### Requirement: Editar presupuesto
El sistema SHALL permitir editar un presupuesto guardado conservando su número correlativo.

#### Scenario: Editar conserva el número
- **WHEN** el usuario edita un presupuesto guardado y lo vuelve a guardar
- **THEN** el presupuesto conserva el número correlativo original

### Requirement: Duplicar presupuesto
El sistema SHALL permitir duplicar un presupuesto existente asignando un número correlativo y una fecha nuevos.

#### Scenario: Duplicar conserva contenido
- **WHEN** el usuario duplica un presupuesto
- **THEN** el nuevo presupuesto copia cliente, obra, secciones con sus ítems, descuento, IVA y observaciones del original

#### Scenario: Duplicar genera número y fecha nuevos
- **WHEN** el usuario duplica un presupuesto
- **THEN** el sistema asigna al duplicado un número correlativo nuevo y la fecha actual

### Requirement: Historial de cotizaciones
El sistema SHALL mostrar la lista de cotizaciones guardadas con su número, fecha, cliente, total y estado, ordenadas de más reciente a más antiguo, separando las activas de las archivadas (ver status/spec.md).

#### Scenario: Ver historial
- **WHEN** el usuario abre la sección Inicio
- **THEN** el sistema muestra todas las cotizaciones guardadas ordenadas del más reciente al más antiguo, con su estado y separadas en activas y archivadas

### Requirement: Eliminar presupuesto
El sistema SHALL permitir eliminar un presupuesto del historial.

#### Scenario: Eliminar presupuesto
- **WHEN** el usuario confirma la eliminación de un presupuesto
- **THEN** el sistema lo elimina del historial

#### Scenario: Eliminar con confirmación
- **WHEN** el usuario intenta eliminar un presupuesto
- **THEN** el sistema solicita confirmación antes de eliminarlo

### Requirement: Forma de pago, vigencia y observaciones
El sistema SHALL permitir registrar la vigencia de la oferta y observaciones por texto libre, y la forma de pago mediante un selector de opciones rápidas con la posibilidad de ingresar una forma personalizada.

#### Scenario: Forma de pago predefinida
- **WHEN** el usuario elige una opción de pago del selector (por ejemplo, 100% al finalizar, 50% al inicio / 50% al finalizar, 40% / 30% / 30%, 30% anticipo / 70% al finalizar, Por avance de obra)
- **THEN** esa forma de pago queda guardada en el presupuesto y se muestra en el PDF

#### Scenario: Forma de pago personalizada
- **WHEN** el usuario elige "Personalizado" en el selector
- **THEN** aparece un campo editable para escribir la forma de pago y se guarda el texto ingresado

#### Scenario: Registrar vigencia y observaciones
- **WHEN** el usuario ingresa vigencia y observaciones
- **THEN** esos datos quedan guardados y se muestran en el presupuesto y en el PDF