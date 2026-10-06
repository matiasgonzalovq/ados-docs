## Purpose

Permite a ADOS Obras registrar y persistir localmente los datos de su empresa (nombre, RUT, teléfono, correo, dirección y logo) que se muestran en cada presupuesto y en el PDF.

## ADDED Requirements

### Requirement: Guardar configuración de empresa
El sistema SHALL permitir guardar la configuración de la empresa con nombre, RUT, teléfono, correo, dirección y logo opcional. Los cambios SHALL quedar persistidos localmente.

#### Scenario: Guardar configuración completa
- **WHEN** el usuario ingresa nombre, RUT, teléfono, correo, dirección y un logo
- **THEN** el sistema guarda todos los campos y los mantiene disponibles al reabrir la app

#### Scenario: Guardar sin logo
- **WHEN** el usuario guarda la configuración sin cargar un logo
- **THEN** el sistema guarda la configuración igualmente y el presupuesto se genera sin logo

### Requirement: Editar configuración de empresa
El sistema SHALL permitir modificar la configuración guardada en cualquier momento y reflejar los cambios en los presupuestos nuevos.

#### Scenario: Actualizar datos de la empresa
- **WHEN** el usuario modifica el nombre o el RUT de la empresa y guarda
- **THEN** los presupuestos nuevos muestran los datos actualizados

### Requirement: Cargar logo
El sistema SHALL permitir seleccionar una imagen desde el dispositivo como logo y persistirla localmente para su uso en el PDF.

#### Scenario: Seleccionar logo válido
- **WHEN** el usuario selecciona una imagen de formato y tamaño aceptables
- **THEN** el sistema la muestra como logo y la persiste localmente

#### Scenario: Logo inválido
- **WHEN** el usuario selecciona un archivo que no es imagen o supera el tamaño máximo admitido
- **THEN** el sistema muestra un mensaje en español y no persiste el archivo

### Requirement: Validación de campos de empresa
El sistema SHALL requerir al menos el nombre de la empresa y validar que el correo tenga formato válido cuando sea ingresado.

#### Scenario: Faltan campos obligatorios
- **WHEN** el usuario intenta guardar sin nombre de empresa
- **THEN** el sistema muestra un mensaje en español indicando el campo faltante y no guarda

#### Scenario: Correo inválido
- **WHEN** el usuario ingresa un correo sin formato válido
- **THEN** el sistema muestra un mensaje en español y no guarda
