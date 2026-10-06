## Purpose

Define la estructura jerárquica del presupuesto: un presupuesto se organiza en **Secciones / Especialidades** (por ejemplo, Obra general, Electricidad, Gasfitería, Soldadura) y cada sección contiene **Ítems** (descripción, tipo, cantidad, unidad y precio unitario). Define el catálogo fijo de unidades y el catálogo de tipos de ítem que ADOS Obras usa al construir sus presupuestos.

## ADDED Requirements

### Requirement: Crear sección
El sistema SHALL permitir crear una sección con un nombre. El nombre SHALL ser obligatorio.

#### Scenario: Crear sección válida
- **WHEN** el usuario crea una sección con un nombre
- **THEN** la sección queda incluida en el presupuesto, vacía, y puede recibir ítems

#### Scenario: Sección sin nombre
- **WHEN** el usuario intenta guardar una sección sin nombre
- **THEN** el sistema muestra un mensaje en español y no crea la sección

#### Scenario: Crear múltiples secciones
- **WHEN** el usuario crea varias secciones
- **THEN** cada sección aparece separada dentro del mismo presupuesto y todas contribuyen al mismo total general

### Requirement: Editar sección
El sistema SHALL permitir modificar el nombre de una sección existente.

#### Scenario: Renombrar sección
- **WHEN** el usuario modifica el nombre de una sección
- **THEN** el nuevo nombre queda guardado y los ítems de la sección se conservan

### Requirement: Eliminar sección
El sistema SHALL permitir eliminar una sección del presupuesto con confirmación previa.

#### Scenario: Eliminar sección
- **WHEN** el usuario confirma la eliminación de una sección
- **THEN** la sección y sus ítems desaparecen del presupuesto y se recalculan los totales

#### Scenario: Cancelar eliminación
- **WHEN** el usuario cancela la confirmación de eliminación
- **THEN** la sección y su contenido permanecen intactos

### Requirement: Sugerencias de secciones
El sistema SHALL ofrecer sugerencias rápidas de nombre de sección (por ejemplo, Obra general, Electricidad, Gasfitería, Soldadura, Pintura, Carpintería, Techumbre, Terminaciones, Otro) sin impedir que el usuario escriba cualquier otro nombre.

#### Scenario: Usar sugerencia
- **WHEN** el usuario toca una sugerencia
- **THEN** el nombre sugerido se rellena en el campo y el usuario puede guardarlo o modificarlo

#### Scenario: Nombre personalizado
- **WHEN** el usuario escribe un nombre que no está en las sugerencias
- **THEN** el sistema acepta el nombre personalizado

### Requirement: Agregar ítem
El sistema SHALL permitir agregar un ítem dentro de una sección con descripción, tipo, cantidad, unidad y precio unitario. Cantidad y precio unitario SHALL ser mayores que cero.

#### Scenario: Agregar ítem válido
- **WHEN** el usuario agrega un ítem con descripción, tipo, cantidad, unidad y precio unitario mayores que cero
- **THEN** el ítem queda incluido en su sección y se recalculan el subtotal de la sección y el subtotal general

#### Scenario: Cantidad en cero o negativa
- **WHEN** el usuario ingresa una cantidad igual a cero o negativa
- **THEN** el sistema muestra un mensaje en español y no acepta el ítem

#### Scenario: Precio unitario en cero o negativo
- **WHEN** el usuario ingresa un precio unitario igual a cero o negativo
- **THEN** el sistema muestra un mensaje en español y no acepta el ítem

#### Scenario: Ítem sin descripción
- **WHEN** el usuario intenta guardar un ítem sin descripción
- **THEN** el sistema muestra un mensaje en español y no acepta el ítem

### Requirement: Tipo de ítem
El sistema SHALL ofrecer un selector de tipo de ítem con las opciones: Material, Mano de obra, Servicio y Otro.

#### Scenario: Seleccionar tipo de ítem
- **WHEN** el usuario elige el tipo de un ítem
- **THEN** el ítem queda clasificado con ese tipo y el tipo queda guardado con el presupuesto

#### Scenario: Tipo por defecto en ítems antiguos
- **WHEN** un ítem proveniente de una estructura antigua no tiene tipo
- **THEN** el sistema le asigna el tipo **Otro** al cargarlo, sin perder sus demás datos

### Requirement: Editar ítem
El sistema SHALL permitir modificar la descripción, tipo, cantidad, unidad o precio unitario de un ítem existente.

#### Scenario: Modificar precio unitario
- **WHEN** el usuario cambia el precio unitario de un ítem a un valor mayor que cero
- **THEN** se actualiza el monto del ítem, el subtotal de su sección y el subtotal general

### Requirement: Eliminar ítem
El sistema SHALL permitir eliminar un ítem de su sección y recalcular los totales.

#### Scenario: Eliminar último ítem de una sección
- **WHEN** el usuario elimina el último ítem de una sección
- **THEN** la sección queda sin ítems, contribuye con cero al total y se recalculan los totales

### Requirement: Catálogo de unidades
El sistema SHALL ofrecer las unidades: unidad, m², m³, metro lineal, hora, jornada y global, para seleccionar en cada ítem.

#### Scenario: Seleccionar unidad del catálogo
- **WHEN** el usuario elige la unidad de un ítem
- **THEN** el sistema muestra solo las unidades del catálogo definido

### Requirement: Cálculo del monto de ítem
El sistema SHALL calcular el monto de cada ítem como cantidad por precio unitario, sin errores de punto flotante.

#### Scenario: Monto de ítem correcto
- **WHEN** un ítem tiene cantidad y precio unitario con decimales
- **THEN** el monto del ítem se calcula con aritmética de enteros en centavos y se redondea correctamente

### Requirement: Subtotal de sección
El sistema SHALL calcular el subtotal de cada sección como la suma de los montos de sus ítems.

#### Scenario: Subtotal de sección correcto
- **WHEN** una sección tiene varios ítems
- **THEN** el subtotal de la sección es la suma exacta de los montos de sus ítems en CLP