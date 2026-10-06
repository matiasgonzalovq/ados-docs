## 1. Setup del proyecto

- [x] 1.1 Limpiar el scaffold de Vite (eliminar src/counter.ts, assets de ejemplo, estilos por defecto).
- [x] 1.2 Configurar index.html en español: lang="es", título "ADOS Obras", viewport móvil y theme-color.
- [x] 1.3 Crear la estructura de carpetas: src/domain, src/storage, src/pdf, src/ui (ver design.md D1).
- [x] 1.4 Verificar que npm run build (tsc + vite build) compila sin errores con el esqueleto.

## 2. Dominio y dinero

- [x] 2.1 Implementar tipos de dominio: CompanyConfig, Client, Unit, ItemType, BudgetItem, BudgetSection, Budget (design.md D5).
- [x] 2.2 Implementar catálogo fijo de unidades y de tipos de ítem con etiquetas en español (budget-sections/spec.md).
- [x] 2.3 Implementar utilidad money.ts: conversión texto→centavos, centavos→texto es-CL (Intl.NumberFormat es-CL, CLP) y round centavos (pricing/spec.md).
- [x] 2.4 Implementar cálculo de totales: montos de ítems, subtotal por sección, subtotal general, descuento, base imponible, IVA configurable (default 19) y total, todos en centavos (pricing/spec.md).
- [x] 2.5 Implementar validadores de negocio: ítem (descripción, cantidad>0, precio>0), sección (nombre), descuento (0≤d≤subtotal), montos no negativos, cliente con nombre (budget-sections, pricing, budgets/spec.md).
- [x] 2.6 Escribir pruebas unitarias rápidas de money/validadores (p. ej. 0.1+0.2=0.3, redondeo, descuento mayor que subtotal) ejecutables con un script npm.

## 3. Persistencia local

- [x] 3.1 Implementar store (storage/store.ts): read/save de company, clients, budgets y nextBudgetNumber en localStorage, con deserialización validada y recuperación de datos corruptos (local-storage/spec.md).
- [x] 3.2 Implementar generación de números correlativos solo al guardar (budgets/spec.md).
- [x] 3.3 Implementar persistencia del logo como data URL con validación de tamaño (~1 MB) (company-settings/spec.md).
- [x] 3.4 Verificar que la capa de dominio no importa nada de storage (aislamiento, local-storage/spec.md).

## 4. Interfaz base y navegación

- [x] 4.1 Montar la SPA: bootstrap en ui/app.ts, vistas Inicio, Presupuesto, Clientes y Configuración con conmutación sin librerías (design.md D9).
- [x] 4.2 Aplicar estilos mobile-first: botones grandes (≥44px), barra de navegación inferior, contraste alto, tipografía legible en src/style.css.
- [x] 4.3 Centralizar textos de la interfaz en español (Design Tokens/strings en ui).

## 5. Configuración de empresa

- [x] 5.1 Vista de configuración: formulario con nombre, RUT, teléfono, correo, dirección y carga de logo (company-settings/spec.md).
- [x] 5.2 Validar nombre obligatorio y correo válido; mostrar mensajes en español (company-settings/spec.md).
- [x] 5.3 Persistir la configuración al guardar y pre-cargarla al abrir la vista (local-storage/spec.md).

## 6. Clientes

- [x] 6.1 Vista de clientes: lista y formulario de creación/edición (nombre obligatorio, RUT/teléfono/dirección opcionales) (clients/spec.md).
- [x] 6.2 Eliminación con confirmación; conservar los datos asociados en presupuestos ya guardados (clients/spec.md).
- [x] 6.3 Selector de cliente al crear/editar presupuestos, con captura del snapshot del cliente (design.md D5).

## 7. Editor de presupuestos

- [x] 7.1 Vista de presupuesto: cliente, nombre y dirección de obra, selector de forma de pago (rápidas + personalizada), vigencia, observaciones, descuento e IVA configurable (budgets/spec.md).
- [x] 7.2 Editor de secciones: crear/renombrar/eliminar secciones (con sugerencias rápidas) y dentro de cada sección agregar/editar/eliminar ítems con descripción, tipo, cantidad, unidad (catálogo) y precio unitario, con validaciones en español (budget-sections/spec.md).
- [x] 7.3 Mostrar en vivo subtotal, descuento, base imponible, IVA y total en formato es-CL (pricing/spec.md).
- [x] 7.4 Guardar presupuesto (normal y borrador), editar conservando número, duplicar con número y fecha nuevos (budgets/spec.md).

## 8. Historial e inicio

- [x] 8.1 Vista de inicio: lista de presupuestos (número, fecha, cliente, total) ordenados del más reciente al más antiguo, con estado de borrador (budgets/spec.md).
- [x] 8.2 Acciones por presupuesto: abrir/editar, duplicar, compartir (PDF detallado), descargar PDF resumido, descargar PDF detallado y eliminar con confirmación (budgets, sharing/spec.md).

## 9. Generación de PDF

- [x] 9.1 Implementar pdf/pdf.ts con jsPDF + jspdf-autotable: encabezado (logo, empresa, número, fecha), cliente y obra; modo detallado con secciones, tabla de ítems (Descripción, Tipo, Cantidad, Unidad, Precio unitario, Monto) y subtotal por sección; modo resumido con solo sección/subtotal; desglose de totales en es-CL y pie con forma de pago/vigencia/observaciones (pdf-export/spec.md).
- [x] 9.2 Bloquear la generación sin cliente o sin ítems válidos mostrando mensaje en español (pdf-export/spec.md).
- [x] 9.3 Paginado correcto con encabezado de tabla repetido para presupuestos extensos; verificación manual (pdf-export/spec.md).
- [x] 9.4 Nombrar archivo presupuesto-<número>.pdf (detallado) y presupuesto-<número>-resumen.pdf (resumido) (pdf-export/spec.md).

## 10. Compartir y descargar

- [x] 10.1 Botón Compartir con navigator.share (PDF como File) cuando está soportado; cancelación sin error (sharing/spec.md).
- [x] 10.2 Botón Descargar como alternativa universal con a[download] o doc.save (sharing/spec.md).
- [x] 10.3 Manejar errores de compartición con mensaje en español y ofrecer descarga (sharing/spec.md).

## 11. PWA

- [x] 11.1 Crear manifest.webmanifest (nombre, color, iconos, display: standalone, start_url) e iconos PWA.
- [x] 11.2 Registrar service worker de cache-first para funcionamiento offline (local-storage/spec.md).
- [x] 11.3 Enlazar manifest e icons en index.html; verificar instalabilidad y estilos standalone.

## 12. Verificación final

- [x] 12.1 Probar flujo completo en móvil: configuración, cliente, crear presupuesto, guardar, editar, duplicar, PDF, compartir por WhatsApp y descarga.
- [x] 12.2 Verificar uso offline y reapertura con datos persistentes (local-storage/spec.md).
- [x] 12.3 Verificar que todos los mensajes, botones y labels están en español.
- [x] 12.4 Ejecutar npm run build (tsc + vite) sin errores de tipos y corregir cualquier warning.

## 13. Reestructuración partidas → Secciones / ítems

- [x] 13.1 Modelo de dominio: BudgetItem.type (ItemType), BudgetSection y Budget.sections reemplazan a Budget.items (design.md D5).
- [x] 13.2 Migración en storage: presupuestos antiguos con items pasan a sección "Obra general" y ítems con tipo "otro", sin perder datos (local-storage/spec.md).
- [x] 13.3 Editor: crear/renombrar/eliminar secciones (con sugerencias rápidas) y agregar/editar/eliminar ítems con selector de tipo dentro de cada sección, manteniendo el invariante de no perder datos (budget-sections/spec.md, design.md D9b).
- [x] 13.4 Forma de pago: selector de opciones rápidas más campo libre para "Personalizado", persistiendo el texto final (budgets/spec.md, design.md D9c).
- [x] 13.5 Totales: subtotal por sección y subtotal general como suma de secciones; descuento/IVA/total sobre el subtotal general (pricing/spec.md).
- [x] 13.6 PDF: modo detallado (secciones + ítems + subtotales por sección) y modo resumido (solo sección/subtotal y total); dos descargas y compartir con detallado (pdf-export/spec.md, D6/D8).
- [x] 13.7 Eliminar el término visible "Partida(s)" de toda la interfaz; usar "Sección" e "Ítem" (design.md D9).
- [x] 13.8 Pruebas: unitarias y de regresión para secciones/ítems/tipos/forma de pago/PDF (detallado y resumido)/migración/persistencia; ejecutar npm test, test:regression y npm run build.

## 14. Estados de cotización, terminología y PDF

- [x] 14.1 Modelo de dominio: BudgetStatus ('pendiente' | 'se-realizara' | 'no-realizada'), campo status en Budget y catálogo de etiquetas en español (status/spec.md).
- [x] 14.2 Migración en storage: cotizaciones antiguas sin estado o con estado desconocido quedan en 'pendiente' (local-storage/spec.md).
- [x] 14.3 Terminología visible: reemplazar "Presupuesto/Presupuestos" por "Cotización/Cotizaciones" en toda la UI, manifest e inicio (status/spec.md).
- [x] 14.4 Mostrar el estado en las tarjetas del historial mediante etiqueta (badge) y acción "Cambiar estado" con diálogo de opciones (status/spec.md).
- [x] 14.5 Separar en Inicio las "Cotizaciones activas" (Pendiente y Se realizará) de las "Archivadas"; "No realizada" pasa a Archivadas y puede volver a Pendiente o Se realizará (status/spec.md).
- [x] 14.6 Crédito discreto "Elaborada por Matías Valdebenito Quezada" en el pie de la app (status/spec.md).
- [x] 14.7 PDF: título "COTIZACIÓN" en el encabezado; nombres cotizacion-XXXX-detalle.pdf y cotizacion-XXXX-resumen.pdf; pie con "Exportado por ADOS OBRAS" y el crédito (pdf-export/spec.md).
- [x] 14.8 Numeración: se confirma que el número correlativo se asigna al guardar y no cambia al modificar el estado (budgets/spec.md).
- [x] 14.9 Pruebas: unitarias (estado por defecto, migración, archivado, nombres de archivo) y de regresión (badge, cambio de estado, activas/archivadas, devolver archivada, terminología); ejecutar npm test, test:regression y npm run build.

## 15. Ajuste opcional de seguro

- [x] 15.1 Mantener cotizaciones antiguas en modo normal y preservar todos los campos al deserializar.
- [x] 15.2 Limitar cada partida a descripción, unidad, cantidad, precio unitario, precio total automático y observación.
- [x] 15.3 Calcular costo directo ajustado, GG/utilidad, IVA, UF, deducible y pérdida indemnizable.
- [x] 15.4 Mostrar una tabla numerada y adaptable en el editor; en este contexto especializado se recupera el término visible "Partida".
- [x] 15.5 Exportar las columnas y el resumen de ajuste al PDF detallado y resumido.
- [x] 15.6 Cubrir cálculos, persistencia, compatibilidad y PDF con pruebas automatizadas.
- [x] 15.7 Agregar título editable y jerarquía recinto → elemento/subpartida → partidas con numeración automática.
