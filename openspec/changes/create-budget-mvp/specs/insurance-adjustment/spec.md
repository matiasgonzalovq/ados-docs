## Purpose

Permitir que una cotización use opcionalmente un formato de ajuste de seguro sin alterar el comportamiento ni los totales de las cotizaciones normales o antiguas.

## ADDED Requirements

### Requirement: Modo opcional de ajuste de seguro
El sistema SHALL mantener la cotización normal como modo predeterminado y SHALL mostrar los campos especializados solo cuando el usuario seleccione **Ajuste de seguro**.

#### Scenario: Abrir cotización antigua
- **WHEN** se carga una cotización sin modo de cálculo
- **THEN** se interpreta como cotización normal y conserva sus secciones, ítems y totales

#### Scenario: Activar ajuste de seguro
- **WHEN** el usuario selecciona Ajuste de seguro
- **THEN** aparecen observación, GG y utilidad, valor UF, fecha de conversión y deducible

### Requirement: Datos de partida
Cada partida SHALL solicitar únicamente descripción, unidad, cantidad, precio unitario y observación. El precio total SHALL calcularse automáticamente como cantidad por precio unitario.

#### Scenario: Calcular precio total
- **WHEN** una partida tiene cantidad 2 y precio unitario $100.000
- **THEN** el precio total mostrado es $200.000

### Requirement: Jerarquía de trabajos
El detalle SHALL permitir un título editable, zonas o recintos como primer nivel y elementos o subpartidas como segundo nivel antes de las partidas.

#### Scenario: Organizar trabajos por recinto y elemento
- **WHEN** el usuario crea la sección **Pasillo** y asigna partidas a **Cielo**, **Muro** y **Piso**
- **THEN** la tabla y el PDF muestran Pasillo como `1` y sus elementos como `1.1`, `1.2` y `1.3`

#### Scenario: Cotización anterior sin elemento
- **WHEN** se carga un ítem antiguo sin subpartida
- **THEN** aparece dentro del grupo **General** y conserva todos sus datos

### Requirement: Resumen de indemnización
El sistema SHALL calcular costo directo, GG y utilidad, costo neto, IVA, total, equivalencia UF, deducible y pérdida indemnizable.

#### Scenario: Calcular deducible
- **WHEN** existe valor UF y un deducible expresado en UF
- **THEN** el deducible en CLP se resta del total ajustado sin permitir una pérdida indemnizable negativa

### Requirement: Exportación PDF
Los PDF detallado y resumido SHALL reflejar el modo elegido. El PDF SHALL incluir numeración, partida, unidad, cantidad, precio unitario, precio total y observación.

#### Scenario: Descargar ajuste detallado
- **WHEN** el usuario descarga una cotización en modo Ajuste de seguro
- **THEN** el PDF muestra las columnas especializadas y el resumen de indemnización
