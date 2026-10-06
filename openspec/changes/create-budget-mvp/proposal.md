## Why

ADOS Obras es una pequeña empresa de construcción chilena cuyo principal operador tiene poca experiencia con computadores y hoy envía sus presupuestos armados a mano por WhatsApp. No existe una herramienta simple, móvil y en español que le permita crear un presupuesto profesional desde su teléfono. El resultado: presupuestos inconsistentes, errores de cálculo y una imagen poco confiable ante los clientes.

## What Changes

Se construye el MVP de una PWA móvil (Vite + TypeScript) en español, con persistencia 100% local, que permite a ADOS Obras crear, guardar, editar, duplicar, exportar a PDF y compartir cotizaciones de construcción desde el teléfono.

- Configuración de empresa: nombre, RUT, teléfono, correo, dirección y logo (persistido localmente).
- Clientes: nombre, RUT opcional, teléfono y dirección.
- Presupuesto con número correlativo, fecha, cliente, nombre y dirección de la obra.
- Estructura jerárquica de secciones/especialidades con ítems: cada sección tiene un nombre (con sugerencias rápidas y nombres personalizados) y cada ítem tiene descripción, tipo (Material, Mano de obra, Servicio u Otro), cantidad, unidad y precio unitario; subtotal por sección y subtotal general.
- Catálogo de unidades: unidad, m², m³, metro lineal, hora, jornada y global.
- Cálculo de subtotal general, descuento opcional, IVA configurable y total, con moneda CLP y formato es-CL, sin errores de punto flotante.
- Forma de pago mediante selector de opciones rápidas (con opción personalizada), vigencia y observaciones.
- Historial de cotizaciones con estados (Pendiente, Se realizará, No realizada), separación entre Cotizaciones activas y Archivadas, edición (conserva el número), duplicación (número y fecha nuevos) y acción "Cambiar estado".
- PDF profesional (detallado y resumido) mediante jsPDF + jspdf-autotable, con título "COTIZACIÓN", nombres cotizacion-XXXX-detalle/resumen.pdf, crédito "Elaborada por Matías Valdebenito Quezada" y pie "Exportado por ADOS OBRAS".
- Compartir mediante Web Share API (usa el PDF detallado), con descarga de ambos PDF como alternativa.
- Diseño mobile-first con botones grandes, navegación mínima y funcionamiento como PWA.
- Todas las interfaces y el contenido visible en español.

Fuera del alcance: autenticación, backend/Firebase, IA, búsqueda de precios, inventario, contratos, facturación electrónica y roles/permisos.

## Capabilities

### New Capabilities

- `company-settings`: configuración de la empresa (nombre, RUT, teléfono, correo, dirección y logo), persistida localmente.
- `clients`: alta, edición, borrado y selección de clientes (nombre, RUT opcional, teléfono, dirección).
- `budget-sections`: secciones/especialidades e ítems del presupuesto (nombre de sección, tipo, descripción, cantidad, unidad, precio unitario), catálogo fijo de unidades y tipos de ítem.
- `budgets`: creación, guardado, edición, duplicación, historial y borrado de cotizaciones, con número correlativo, fecha, cliente, datos de la obra y estado (Pendiente / Se realizará / No realizada).
- `status`: estados de la cotización, separación entre Cotizaciones activas y Archivadas, migración de cotizaciones antiguas a Pendiente y acción "Cambiar estado".
- `pricing`: cálculos de subtotal, descuento opcional, IVA configurable y total en CLP con aritmética de enteros (evita errores de punto flotante), formato es-CL y validaciones de montos.
- `pdf-export`: generación del PDF profesional del presupuesto con jsPDF y jspdf-autotable.
- `sharing`: compartir el presupuesto vía Web Share API y descargar el PDF como alternativa.
- `local-storage`: persistencia local de configuración, clientes y presupuestos, con separación de dominio y almacenamiento.

### Modified Capabilities

- Ninguna. No existen especificaciones previas en `openspec/specs/`.

## Impact

- **Código**: reemplaza el scaffold de Vite (src/counter.ts, index.html por defecto) por la aplicación; se crean `src/domain`, `src/storage`, `src/pdf`, `src/ui` y `src/main.ts`.
- **Dependencias**: ya declaradas en `package.json` — `jspdf` y `jspdf-autotable`. Se agregan assets de PWA (manifest, service worker o su equivalente) en `public/`.
- **Infraestructura**: sin backend. Todo se persiste en `localStorage` (o IndexedDB si el tamaño del logo lo exige).
- **Idioma y moneda**: es-CL, CLP, no usar `Date.toLocaleDateString()` con locales no configurados.
