## Purpose

Define el **issuerSnapshot**: copia inmutable de los datos del perfil emisor utilizados en el momento de crear una cotización. Este snapshot garantiza que editar o eliminar un perfil emisor posteriormente NO modifica cotizaciones históricas.

## ADDED Requirements

### Requirement: Congelar el emisor en cada cotización

El sistema SHALL guardar en cada cotización una copia (`issuerSnapshot`) de los datos del perfil emisor usado al momento de crearla, incluyendo id del perfil y los datos visibles (nombre o razón social, RUT, teléfono, correo, dirección, logo, información adicional).

#### Scenario: Crear cotización con emisor elegido
- **WHEN** el usuario crea una cotización y selecciona un perfil emisor
- **THEN** la cotización persiste con el `issuerSnapshot` congelado con los datos de ese perfil

#### Scenario: Editar cotización sin cambiar emisor
- **WHEN** el usuario edita una cotización sin cambiar el perfil emisor
- **THEN** el `issuerSnapshot` se conserva tal como estaba (no se re-lee del perfil)

#### Scenario: Cambiar de emisor al editar
- **WHEN** el usuario cambia el perfil emisor al editar una cotización guardada vacía o la re-emite
- **THEN** se congela un nuevo `issuerSnapshot` con los datos del perfil recién elegido (según decisión de la vista de edición, ver design.md)

### Requirement: Independencia histórica

El sistema SHALL garantizar que las cotizaciones existentes no cambien sus datos de emisor cuando se modifica o elimina el perfil emisor correspondiente.

#### Scenario: Editar el perfil emisor no altera cotizaciones
- **WHEN** el usuario edita un perfil emisor (por ejemplo, cambia su nombre o RUT)
- **THEN** las cotizaciones que usaron ese perfil conservan su `issuerSnapshot` original

#### Scenario: Eliminar el perfil emisor no altera cotizaciones
- **WHEN** el usuario elimina un perfil emisor
- **THEN** la cotización histórica conserva su `issuerSnapshot` original y su PDF sigue mostrando esos datos

### Requirement: Uso del snapshot en el PDF y el historial

El sistema SHALL usar el `issuerSnapshot` como fuente de datos del emisor para el PDF detallado/resumido y para cualquier vista de una cotización existente.

#### Scenario: PDF con datos históricos
- **WHEN** se genera el PDF de una cotización existente
- **THEN** el encabezado de emisor usa el `issuerSnapshot` de la cotización, no el estado actual del perfil