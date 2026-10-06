## Purpose

Permite compartir el presupuesto desde el teléfono mediante la Web Share API cuando está disponible y descargar el PDF como alternativa universal.

## ADDED Requirements

### Requirement: Compartir mediante Web Share API
El sistema SHALL ofrecer compartir el presupuesto mediante la Web Share API cuando el navegador la soporta.

#### Scenario: Compartir por WhatsApp
- **WHEN** el usuario toca el botón de compartir y elige WhatsApp
- **THEN** el sistema comparte el PDF detallado de la cotización con el título de la cotización

### Requirement: Descarga como alternativa
El sistema SHALL ofrecer la descarga del PDF cuando la Web Share API no esté disponible o el usuario prefiera descargar.

#### Scenario: Descarga del PDF
- **WHEN** el usuario toca el botón de descargar
- **THEN** el sistema descarga el PDF de la cotización al dispositivo

#### Scenario: Sin soporte de Web Share
- **WHEN** el navegador no soporta la Web Share API
- **THEN** el sistema muestra la opción de descarga como alternativa

### Requirement: Errores de compartición
El sistema SHALL manejar con mensajes en español los casos en que la compartición falle o sea cancelada.

#### Scenario: Compartición cancelada
- **WHEN** el usuario cancela la compartición
- **THEN** el sistema no genera un error y permanece en la vista actual

#### Scenario: Error de compartición
- **WHEN** la compartición falla por un error del navegador
- **THEN** el sistema muestra un mensaje en español y ofrece la descarga como alternativa