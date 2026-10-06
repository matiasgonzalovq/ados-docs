## Purpose

Define el cálculo de los montos del presupuesto en pesos chilenos (CLP): subtotal, descuento opcional, IVA configurable y total, con aritmética de enteros para evitar errores monetarios de punto flotante y formato es-CL.

## ADDED Requirements

### Requirement: Cálculo de subtotal
El sistema SHALL calcular el subtotal de cada sección como la suma de los montos de sus ítems, y el subtotal general del presupuesto como la suma de los subtotales de todas las secciones.

#### Scenario: Subtotal de sección correcto
- **WHEN** una sección tiene varios ítems
- **THEN** el subtotal de la sección es la suma exacta de los montos de sus ítems en CLP

#### Scenario: Subtotal general correcto
- **WHEN** un presupuesto tiene varias secciones con ítems
- **THEN** el subtotal general es la suma exacta de los subtotales de todas las secciones en CLP

### Requirement: Descuento opcional
El sistema SHALL permitir ingresar un descuento opcional, expresado en pesos, que se resta del subtotal. El descuento SHALL ser mayor o igual que cero y no SHALL superar el subtotal.

#### Scenario: Aplicar descuento
- **WHEN** el usuario ingresa un descuento válido
- **THEN** la base imponible es el subtotal menos el descuento

#### Scenario: Descuento negativo o inválido
- **WHEN** el usuario ingresa un descuento negativo o no numérico
- **THEN** el sistema muestra un mensaje en español y no aplica el descuento

#### Scenario: Descuento mayor que el subtotal
- **WHEN** el usuario ingresa un descuento mayor que el subtotal
- **THEN** el sistema muestra un mensaje en español y no aplica el descuento

#### Scenario: Sin descuento
- **WHEN** el usuario deja el descuento en cero
- **THEN** la base imponible es igual al subtotal

### Requirement: IVA configurable
El sistema SHALL permitir configurar la tasa de IVA (por defecto 19%) para aplicar al presupuesto, con opción de no aplicar IVA.

#### Scenario: Aplicar IVA configurado
- **WHEN** el presupuesto tiene IVA configurado mayor que cero
- **THEN** el total es la base imponible más el IVA calculado sobre la base imponible

#### Scenario: Sin IVA
- **WHEN** el usuario configura IVA en cero
- **THEN** el total es igual a la base imponible

### Requirement: Cálculo del total
El sistema SHALL calcular el total del presupuesto y garantizar que ningún monto (subtotal, base imponible, IVA o total) sea negativo.

#### Scenario: Total correcto
- **WHEN** el presupuesto tiene partidas, descuento e IVA
- **THEN** el sistema muestra subtotal, descuento, base imponible, IVA y total con la relación correcta entre ellos

#### Scenario: Montos no negativos
- **WHEN** se aplican las reglas de descuento y precios
- **THEN** ningún monto del presupuesto resulta negativo

### Requirement: Aritmética sin errores de punto flotante
El sistema SHALL realizar todos los cálculos monetarios con aritmética de enteros en centavos y redondear al centavo más cercano al momento de convertir a CLP.

#### Scenario: Cálculo exacto con decimales
- **WHEN** los precios, cantidades y descuentos incluyen decimales
- **THEN** los montos se redondean correctamente al centavo sin errores de punto flotante (por ejemplo, 0,1 + 0,2 es 0,3)

### Requirement: Formato es-CL
El sistema SHALL mostrar todos los montos en pesos chilenos formateados según la locale es-CL, con separador de miles y símbolo de moneda.

#### Scenario: Formato de montos en la interfaz
- **WHEN** el sistema muestra un subtotal, descuento, IVA o total
- **THEN** el monto se muestra en formato es-CL (por ejemplo, $1.234.567)