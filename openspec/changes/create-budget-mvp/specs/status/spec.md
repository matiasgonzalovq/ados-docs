## Purpose

Define el ciclo de vida de una cotización mediante estados (Pendiente, Se realizará, No realizada) y la separación entre **Cotizaciones activas** y **Archivadas**. Las cotizaciones "No realizadas" pasan automáticamente a Archivadas y pueden volver a Pendiente o Se realizará sin perder datos.

## ADDED Requirements

### Requirement: Estados de cotización

El sistema SHALL asignar a cada cotización un estado dentro del conjunto: **Pendiente**, **Se realizará** y **No realizada**. Toda cotización nueva SHALL nacer en **Pendiente**.

#### Scenario: Estado por defecto

- **WHEN** el usuario crea una cotización nueva
- **THEN** la cotización queda en estado **Pendiente** y aparece en las Cotizaciones activas

#### Scenario: Cambiar estado

- **WHEN** el usuario usa la acción "Cambiar estado" sobre una cotización
- **THEN** el sistema ofrece los tres estados y, al elegir uno, guarda el nuevo estado sin modificar el número ni el contenido de la cotización

### Requirement: Migración de cotizaciones antiguas

El sistema SHALL migrar las cotizaciones (presupuestos) guardados antes de existir el estado, asignándoles **Pendiente**.

#### Scenario: Cotización antigua sin estado

- **WHEN** el sistema carga una cotización guardada sin campo de estado
- **THEN** la cotización queda en estado **Pendiente** y aparece en las Cotizaciones activas

#### Scenario: Estado desconocido

- **WHEN** el sistema encuentra un estado inválido o desconocido
- **THEN** la cotización se recupera como **Pendiente** sin perder el resto de sus datos

### Requirement: Separar activas y archivadas

El sistema SHALL mostrar las Cotizaciones activas (Pendiente y Se realizará) separadas de las Archivadas.

#### Scenario: Ver listas separadas

- **WHEN** el usuario abre la sección Inicio
- **THEN** el sistema muestra las cotizaciones activas y, bajo un encabezado distinto, las cotizaciones archivadas

### Requirement: No realizada pasa a Archivadas

El sistema SHALL mover automáticamente a Archivadas toda cotización cuyo estado sea **No realizada**.

#### Scenario: Marcar como No realizada

- **WHEN** el usuario cambia el estado de una cotización a **No realizada**
- **THEN** la cotización deja de aparecer en activas y aparece en Archivadas, conservando número, contenido y total

#### Scenario: Devolver una archivada

- **WHEN** el usuario cambia el estado de una cotización archivada a **Pendiente** o **Se realizará**
- **THEN** la cotización vuelve a aparecer en las Cotizaciones activas

### Requirement: Estado visible en las tarjetas

El sistema SHALL mostrar el estado de cada cotización en su tarjeta del historial.

#### Scenario: Badge de estado

- **WHEN** el historial muestra una cotización
- **THEN** la tarjeta incluye una etiqueta con su estado (Pendiente, Se realizará o No realizada)