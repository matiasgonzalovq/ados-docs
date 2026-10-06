## Purpose

Genera dos representaciones en PDF del presupuesto en español, con el logo y datos de la empresa, cliente y obra: un **PDF detallado** (cada sección con sus ítems y subtotal) y un **PDF resumido** (solo nombre de sección y subtotal). Usa jsPDF y jspdf-autotable.

## ADDED Requirements

### Requirement: Generar PDF solo con datos válidos
El sistema SHALL generar cualquiera de los dos PDF únicamente cuando el presupuesto tiene cliente y al menos un ítem válido.

#### Scenario: Intento de PDF sin cliente
- **WHEN** el usuario intenta generar el PDF de un presupuesto sin cliente
- **THEN** el sistema muestra un mensaje en español y no genera el PDF

#### Scenario: Intento de PDF sin ítems válidos
- **WHEN** el usuario intenta generar el PDF de un presupuesto sin ítems o con ítems inválidos
- **THEN** el sistema muestra un mensaje en español y no genera el PDF

#### Scenario: PDF con datos válidos
- **WHEN** el presupuesto tiene cliente y ítems válidos
- **THEN** el sistema genera el PDF sin errores

### Requirement: PDF detallado
El sistema SHALL generar un PDF detallado que incluya: datos y logo de la empresa, número y fecha del presupuesto, datos del cliente, nombre y dirección de la obra, cada sección con el nombre de la sección y los ítems de cada sección (descripción, tipo, cantidad, unidad, precio unitario y monto), el subtotal de cada sección, el subtotal general, descuento, base imponible, IVA, total, forma de pago, vigencia y observaciones.

#### Scenario: PDF detallado completo
- **WHEN** se genera el PDF detallado de un presupuesto completo con varias secciones
- **THEN** el PDF muestra cada sección con sus ítems, el subtotal por sección y el desglose completo de totales en formato es-CL

### Requirement: PDF resumido
El sistema SHALL generar un PDF resumido que incluya: datos generales (empresa, cliente y obra), el nombre de cada sección con su subtotal, el total general, forma de pago, vigencia y observaciones. El PDF resumido NO SHALL listar los ítems individuales.

#### Scenario: PDF resumido sin ítems
- **WHEN** se genera el PDF resumido de un presupuesto
- **THEN** el PDF muestra solo el nombre de cada sección con su subtotal y el total general, sin listar ítems

### Requirement: Tabla de ítems en el PDF detallado
El sistema SHALL renderizar las tablas de ítems del PDF detallado con las columnas de descripción, tipo, cantidad, unidad, precio unitario y monto, mediante jspdf-autotable.

#### Scenario: Tabla correcta
- **WHEN** el PDF detallado incluye una sección con ítems
- **THEN** cada ítem aparece en una fila con sus columnas y montos en formato es-CL

### Requirement: Carrusel de páginas en PDFs extensos
El sistema SHALL paginar correctamente cuando los ítems del PDF detallado superan una página.

#### Scenario: Presupuesto con muchos ítems
- **WHEN** el presupuesto tiene más ítems de los que caben en una página
- **THEN** el PDF continúa en páginas nuevas conservando el encabezado de la tabla y los totales al final

### Requirement: Nombres de archivo del PDF
El sistema SHALL nombrar los archivos PDF de forma legible y consistente, diferenciando detallado de resumido, con el prefijo "cotizacion".

#### Scenario: Nombre del archivo detallado
- **WHEN** se genera el PDF detallado
- **THEN** el archivo se nombra incluyendo el número de la cotización y la palabra detalle (por ejemplo, cotizacion-0005-detalle.pdf)

#### Scenario: Nombre del archivo resumido
- **WHEN** se genera el PDF resumido
- **THEN** el archivo se nombra incluyendo el número de la cotización y la palabra resumen (por ejemplo, cotizacion-0005-resumen.pdf)

### Requirement: Título COTIZACIÓN en el encabezado
El sistema SHALL mostrar el título "COTIZACIÓN" en el encabezado del PDF.

#### Scenario: Título del documento
- **WHEN** se genera cualquiera de los dos PDF
- **THEN** el encabezado del documento dice "COTIZACIÓN" (y no "Presupuesto")

### Requirement: Pie de página del PDF
El sistema SHALL agregar al pie de cada página del PDF la línea "Exportado por ADOS DOCS" y no SHALL incluir crédito personal en ese pie.

> Requisito actualizado para alinearlo con el comportamiento implementado. La
> versión original exigía "Exportado por ADOS OBRAS" y el crédito discreto
> "Elaborada por Matías Valdebenito Quezada"; ambos se retiraron de la
> aplicación (`src/ui/strings.ts`: `creditExportadoPor` y
> `creditElaboradaPor: ''`) y las pruebas 29 y 30 de `src/domain/tests.ts`
> verifican que no aparezcan en el PDF.

#### Scenario: Pie de página
- **WHEN** se genera cualquiera de los dos PDF
- **THEN** cada página incluye, en el pie, el texto "Exportado por ADOS DOCS" y no aparece crédito personal retirado