## Purpose

Define el perfil básico de la cuenta del usuario (`UserProfile`), gestionado desde una sección "Mi perfil" dentro de Ajustes. Contiene los datos básicos de la cuenta, sin reemplazar los perfiles emisores.

## ADDED Requirements

### Requirement: Perfil de usuario en Ajustes

El sistema SHALL mostrar una sección "Mi perfil" en Ajustes con los datos básicos de la cuenta.

#### Scenario: Ver mi perfil
- **WHEN** el usuario abre Ajustes
- **THEN** el sistema muestra la sección "Mi perfil" con el correo de la cuenta (proveniente de Firebase Auth) y los campos editables del perfil

#### Scenario: Editar nombre mostrado
- **WHEN** el usuario modifica su nombre mostrado y guarda
- **THEN** el sistema persiste el cambio bajo `users/{uid}/profile` y lo refleja en la interfaz

#### Scenario: Teléfono opcional
- **WHEN** el usuario guarda un teléfono opcional
- **THEN** el sistema persiste el teléfono bajo `users/{uid}/profile` y lo mantiene disponible en la sesión

### Requirement: Datos del perfil no confidenciales

El sistema SHALL tratar el correo como identificador inmutable (provisto por Firebase Auth) y NO permitir cambiarlo desde el perfil local mientras no se implemente cambio de correo.

#### Scenario: Correo no editable
- **WHEN** el usuario abre "Mi perfil"
- **THEN** el correo se muestra como dato de solo lectura, emitido por Firebase Auth