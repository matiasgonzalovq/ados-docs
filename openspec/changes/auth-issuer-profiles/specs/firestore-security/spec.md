## Purpose

Define las **reglas de seguridad de Cloud Firestore** que garantizan que cada usuario solo pueda leer y escribir sus propios documentos. Estas reglas se despliegan en Firebase Console y son verificables con los emuladores o clients de pruebas.

## ADDED Requirements

### Requirement: Reglas por ownership (uid)

El sistema SHALL restringir todo acceso a `users/{uid}/…` al usuario `uid` autenticado (vía `request.auth.uid`).

#### Scenario: Acceso permitido al dueño
- **WHEN** el usuario autenticado `uid` lee o escribe bajo `users/{uid}/…`
- **THEN** la operación se permite

#### Scenario: Acceso denegado a otros usuarios
- **WHEN** un usuario intente leer o escribir bajo `users/{otroUid}/…`
- **THEN** Firestore deniega la operación

#### Scenario: Acceso sin autenticación
- **WHEN** un cliente sin sesión intente acceder a `users/…`
- **THEN** Firestore deniega la operación (requiere `request.auth != null`)

### Requirement: Reglas propuestas

El sistema SHALL versionar en un archivo `firestore.rules` reglas equivalentes a las siguientes (versión 2), que se despliegan/confirman en Firebase Console en el momento de la integración:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Solo el dueño puede acceder a sus documentos
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

#### Scenario: Cobertura de todas las colecciones
- **WHEN** existe cualquier documento bajo `users/{uid}/…` (profile, issuers, clients, budgets, meta)
- **THEN** el wildcard `{document=**}` aplica la misma regla de propiedad

### Requirement: Verificación de reglas

El sistema SHALL verificar las reglas con pruebas (emulador de Firestore o archivo de reglas versionado, p. ej. `firestore.rules`), incluyendo casos positivos (dueño) y negativos (otro usuario / sin auth).

#### Scenario: Pruebas de seguridad
- **WHEN** se ejecutan las pruebas del change
- **THEN** se validan los casos permitidos y denegados descritos en esta spec

## Notes

- Las reglas exactas finales se confirman al desplegar el proyecto Firebase (ver tasks y decisiones pendientes); no se inventan credenciales en este change.