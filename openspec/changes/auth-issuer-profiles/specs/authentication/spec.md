## Purpose

Define la autenticación de ADOS Docs con **Firebase Authentication** (correo + contraseña): registro, inicio de sesión y cierre de sesión. La app requiere una sesión activa para su uso normal; no existe un modo funcional sin login. Se soporta una sesión activa por navegador. El cierre de sesión limpia el estado sensible en memoria pero NO elimina los datos persistidos.

## ADDED Requirements

### Requirement: Registro de cuenta

El sistema SHALL permitir crear una cuenta con correo electrónico y contraseña mediante Firebase Authentication.

#### Scenario: Registro exitoso
- **WHEN** el usuario registra una cuenta con un correo y una contraseña válidos
- **THEN** el sistema crea la cuenta en Firebase Auth, crea su `UserProfile` por defecto en Firestore y queda con sesión iniciada en la app

#### Scenario: Correo ya registrado
- **WHEN** el usuario intenta registrar un correo que ya está en uso
- **THEN** el sistema muestra un mensaje de error en español y no crea la cuenta

#### Scenario: Contraseña inválida
- **WHEN** el usuario registra con una contraseña que no cumple los requisitos mínimos de seguridad de Firebase
- **THEN** el sistema muestra un mensaje de error en español y no crea la cuenta

### Requirement: Inicio de sesión

El sistema SHALL permitir iniciar sesión con el correo y la contraseña de una cuenta existente.

#### Scenario: Login exitoso
- **WHEN** el usuario ingresa credenciales válidas
- **THEN** el sistema inicia la sesión y carga los datos del usuario (perfiles emisores, clientes, cotizaciones) desde Firestore

#### Scenario: Credenciales incorrectas
- **WHEN** el usuario ingresa un correo o contraseña incorrectos
- **THEN** el sistema muestra un mensaje de error en español y no inicia la sesión

### Requirement: Cierre de sesión

El sistema SHALL permitir cerrar la sesión activa.

#### Scenario: Logout normal
- **WHEN** el usuario cierra sesión
- **THEN** el sistema termina la sesión de Firebase, limpia el estado sensible en memoria (datos cargados de la cuenta) y muestra la vista de autenticación

#### Scenario: Logout conserva los datos
- **WHEN** el usuario cierra sesión
- **THEN** los datos persistidos en Firestore y la caché local NO se eliminan; el usuario puede volver a iniciar sesión y encontrarlos

### Requirement: Acceso requiere sesión

El sistema SHALL exigir una sesión iniciada para usar la aplicación; sin sesión se muestra la vista de autenticación.

#### Scenario: Usuario sin sesión
- **WHEN** la aplicación arranca sin una sesión activa
- **THEN** se muestra la pantalla de autenticación (registro o inicio de sesión) y no se accede a las funcionalidades de la app

#### Scenario: Cambio de cuenta en el mismo navegador
- **WHEN** el usuario cierra sesión e inicia sesión con otra cuenta
- **THEN** la app carga exclusivamente los datos de la nueva cuenta, sin mezclar ni exponer los de la anterior