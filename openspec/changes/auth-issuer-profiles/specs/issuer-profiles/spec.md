## Purpose

Define los **perfiles emisores** (`IssuerProfile`): entidades propiedad del usuario desde las cuales se emiten cotizaciones. Un usuario puede tener uno o varios perfiles (p. ej. "Constructora Demo SpA" y "Persona Demo"). Se soporta crear, editar, eliminar con confirmación, definir uno como predeterminado y elegir el perfil al crear una cotización.

## ADDED Requirements

### Requirement: Crear perfil emisor

El sistema SHALL permitir crear un perfil emisor indicando si representa una **empresa** o una **persona natural**, con los siguientes campos: nombre o razón social (obligatorio), RUT (opcional), teléfono (opcional), correo (opcional), dirección (opcional), logo (opcional) e información adicional (opcional).

#### Scenario: Crear perfil válido
- **WHEN** el usuario crea un perfil con tipo (empresa o persona), nombre y datos opcionales
- **THEN** el perfil queda almacenado bajo `users/{uid}/issuers/{issuerId}`, con su `kind`, y disponible para usarse como emisor

#### Scenario: Crear perfil sin nombre
- **WHEN** el usuario intenta guardar un perfil sin nombre o solo espacios
- **THEN** el sistema muestra un mensaje en español y no crea el perfil

#### Scenario: Primer perfil automático
- **WHEN** un usuario no tiene ningún perfil emisor
- **THEN** el sistema ofrece crear el primero y, si corresponde, lo marca como predeterminado (ver data-migration para usuario que migra su CompanyConfig como empresa)

### Requirement: Editar perfil emisor

El sistema SHALL permitir modificar cualquier campo de un perfil emisor existente.

#### Scenario: Editar datos del perfil
- **WHEN** el usuario modifica los datos de un perfil emisor
- **THEN** el perfil se actualiza bajo `users/{uid}/issuers/{issuerId}` sin afectar cotizaciones históricas (ver quote-issuer-snapshot)

### Requirement: Perfil emisor predeterminado

El sistema SHALL permitir definir un perfil como predeterminado (máximo uno por usuario). Debe existir exactamente un predeterminado cuando hay al menos un perfil.

#### Scenario: Definir predeterminado
- **WHEN** el usuario marca un perfil como predeterminado
- **THEN** ese perfil queda como predeterminado y los demás dejan de serlo

#### Scenario: Preselección por defecto
- **WHEN** el usuario crea una cotización
- **THEN** el selector de perfil emisor aparece preseleccionado con el predeterminado (o el último usado si no hay predeterminado)

### Requirement: Eliminar perfil emisor

El sistema SHALL permitir eliminar un perfil emisor, con confirmación previa, sin modificar cotizaciones históricas.

#### Scenario: Eliminar con confirmación
- **WHEN** el usuario confirma la eliminación de un perfil
- **THEN** el perfil se elimina de `users/{uid}/issuers/` y las cotizaciones que lo usaron conservan su snapshot

#### Scenario: Cancelar eliminación
- **WHEN** el usuario cancela la confirmación
- **THEN** el perfil permanece intacto

#### Scenario: Eliminar el predeterminado
- **WHEN** el usuario elimina el perfil predeterminado y quedan otros perfiles
- **THEN** el sistema elige (o solicita elegir) un nuevo predeterminado entre los restantes

### Requirement: Selección del emisor al crear cotización

El sistema SHALL ofrecer un selector de perfil emisor al crear o editar una cotización, y congelar los datos del perfil elegido en la cotización (issuerSnapshot, ver quote-issuer-snapshot).

#### Scenario: Elegir emisor
- **WHEN** el usuario selecciona un perfil emisor al crear una cotización
- **THEN** los datos de ese perfil se copian como snapshot inmutable en la cotización al guardarla