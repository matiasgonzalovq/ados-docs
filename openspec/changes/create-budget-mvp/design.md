## Context

El proyecto es un scaffold de Vite + TypeScript recién inicializado (src/counter.ts, estilo por defecto). Ya están declaradas las dependencias `jspdf` y `jspdf-autotable` en `package.json`. No existe ningún código de dominio ni spec previa. El producto es una PWA móvil en español para una pequeña empresa de construcción chilena cuyo usuario tiene poca experiencia con computadores (ver proposal.md — Why). No hay backend: todo debe persistir en el dispositivo.

## Goals / Non-Goals

**Goals:**
- Arquitectura con separación clara: `domain`, `storage`, `pdf`, `ui`.
- Cálculos monetarios exactos en CLP sin errores de punto flotante.
- Interfaz mobile-first, en español, de una sola página, con navegación mínima.
- Experiencia PWA: instalable y funcional sin conexión.
- Generación de PDF profesional y compartir por WhatsApp con un mínimo de pasos.

**Non-Goals:**
- Backend, sincronización, cuentas de usuario o IA.
- Ruteo complejo o frameworks de UI (se usa HTML + CSS vanilla sobre Vite).
- Soporte a otros idiomas o monedas.
- Impresión a papel directa (se cubre con descarga/PDF).

## Decisions

### D1. Capas y estructura de carpetas
```
src/
  domain/        entidades, utilidades de dinero, validaciones de negocio (puro Ts, sin DOM)
    money.ts     CentsValue, CLPFormat, calcularTotales
    types.ts     CompanyConfig, Client, Unit, BudgetItem, Budget
    validators.ts
  storage/       adaptador de persistencia (localStorage + logo como data URL)
    store.ts     API de lectura/escritura, aislamiento de formato
  pdf/           generación de PDF (jsPDF + autotable)
    pdf.ts
  ui/            render de vistas, componentes y estado
    app.ts       bootstrap y navegación entre vistas
    views/...
  main.ts        punto de entrada
```
Rationale: se cumple la regla del producto de separar dominio, persistencia, PDF e interfaz y facilita el testing de `domain` sin DOM. `Vite` compila TS directamente; no se usa framework.

Alternativa considerada: framework React/Svelte. Descartado porque el producto pide navegación mínima y simplicidad; el DOM vanilla con vistas de una sola página reduce dependencias y curva de mantenimiento.

### D2. Dinero en centavos (enteros)
Todo monto se representa como número entero de centavos (`number` CLP) en la lógica de dominio. Se convierte desde/hacia texto solo en los bordes (inputs y formato). El redondeo se aplica en cada operación (`Math.round`) para evitar acumulación de errores de punto flotante.

```
cantidad        (decimal, ingresado por el usuario)
precioUnitario  (decimal)
montoPartida    = round(cantidad * precioUnitario * 100) centavos
subtotal        = Σ montos; descuento en centavos
baseImponible   = subtotal − descuento
iva             = round(baseImponible * tasa / 100)
total           = baseImponible + iva
```
El formato es-CL se obtiene con `Intl.NumberFormat('es-CL', { style:'currency', currency:'CLP' })` (sin decimales cuando el valor no tiene centavos, o siempre con 0 decimales vía `maximumFractionDigits: 0` dependiendo de la configuración regional; se verifica en implementación).

Rationale: `0.1 + 0.2 !== 0.3` en punto flotante; con enteros de centavos todo suma exacto y el redondeo se hace explícito.

Alternativa considerada: `BigDecimal`/librerías. Descartada: complejidad innecesaria para este volumen; enteros en centavos con `round` es suficiente y ampliamente usado.

### D3. Persistencia local
- `localStorage` con claves separadas: `company`, `clients`, `budgets`, `nextBudgetNumber`.
- El logo de empresa se persiste como data URL (base64) en `company.logoDataUrl`, con límite de tamaño validado (~1 MB) para no saturar la cuota de localStorage (~5 MB). Si se supera, se usa IndexedDB solo para el logo (decisión de reserva, ver D7).
- El almacenamiento expone una interfaz mínima (`loadState`, `saveState`) y la serialización/deserialización con validación (los datos corruptos se recuperan como estado vacío sin romper la app).

Rationale: localStorage cubre el volumen esperado (decenas de presupuestos) y simplifica la persistencia sin backend. Guardar "al tocar Guardar" (no autosave) mantiene el comportamiento predecible para el usuario novice.

### D4. Número correlativo y borradores
`nextBudgetNumber` se persiste y solo se incrementa al guardar. Cada presupuesto almacena su `number` (nunca se reasigna). El historial despliega todos los presupuestos (incluidos borradores) con su estado. Duplicar copia contenido, usa `nextBudgetNumber` nuevo y fecha actual.

### D5. Modelo de datos
```ts
type CompanyConfig = {
  name: string; rut?: string; phone?: string; email?: string;
  address?: string; logoDataUrl?: string;
}
type Client = { id: string; name: string; rut?: string; phone?: string; address?: string; }
type Unit = 'unidad' | 'm2' | 'm3' | 'ml' | 'hora' | 'jornada' | 'global';
// catálogo fijo en domain/units.ts con etiquetas en español
type ItemType = 'material' | 'mano-de-obra' | 'servicio' | 'otro';
// catálogo fijo en domain/units o types con etiquetas en español
type BudgetItem = { id: string; description: string; type: ItemType; quantity: number; unit: Unit; unitPrice: number; }
type BudgetSection = { id: string; name: string; items: BudgetItem[]; }
type Budget = {
  id: string; number: number; date: string; // ISO
  clientId?: string;
  clientSnapshot?: { name: string; rut?: string; phone?: string; address?: string };
  jobName: string; jobAddress: string;
  sections: BudgetSection[];
  discount: number; // centavos
  ivaRate: number;  // 0..100; 19 por defecto
  paymentTerms: string; validity: string; notes: string;
  createdAt: string; updatedAt: string;
  isDraft?: boolean;
  status?: BudgetStatus; // 'pendiente' | 'se-realizara' | 'no-realizada'; por defecto 'pendiente'
}
```
Decisión clave: `clientSnapshot` guarda una copia del cliente al momento de guardar. Esto satisface "editar cliente refleja cambios en presupuestos que lo usen" a la vez que "eliminar cliente conserva los datos del presupuesto": los presupuestos ya guardados muestran su snapshot, mientras los presupuestos aún en edición toman datos vivos del catálogo (que es lo que el usuario entiende como "usar el cliente"). En la vista de edición se refresca el snapshot desde el catálogo al seleccionar/guardar; en el PDF y en el historial se usa el snapshot.

Decisión clave (reestructuración): el presupuesto ya no tiene partidas directas; se organiza en `sections`, cada una con `name` y `items`. Cada ítem lleva un `type` (material, mano-de-obra, servicio, otro) que no afecta los cálculos del MVP pero permite distinguiciones futuras. El subtotal de sección es la suma de sus ítems; el subtotal general es la suma de los subtotales de sección. Los cálculos de descuento/IVA/total se mantienen sobre el subtotal general.

### D9b. Editor y preservación de datos (invariante)
Las vistas se re-renderizan desde el modelo (`app.render()` reconstruye el HTML). Para que nunca se pierdan datos escritos por el usuario, se mantiene el invariante: *ninguna interacción interna del editor puede reinicializar o destruir datos introducidos por el usuario*. Técnica: antes de re-renderizar la vista de presupuesto, `syncBudgetFields()` vuelca los valores actuales del DOM (obra, dirección, descuento, IVA, forma de pago, observaciones, cliente y todos los controles de secciones/ítems) al borrador en memoria (`app.editingBudget`); la función se aplica solo cuando el formulario ya existe en el DOM (es decir, en re-renders internos, nunca al entrar desde otra vista). Los datos solo se descartan con una acción explícita del usuario (volver atrás, guardar y navegar).

### D9c. Forma de pago
La forma de pago se guarda como texto (`paymentTerms`), pero el editor la presenta como un selector de opciones rápidas (100% al finalizar; 50% al inicio / 50% al finalizar; 40% / 30% / 30%; 30% anticipo / 70% al finalizar; Por avance de obra) más la opción "Personalizado". Al elegir "Personalizado" se muestra un campo de texto. El modo activo se deriva del valor guardado: si coincide con una opción predefinida se selecciona esa opción; en caso contrario se muestra "Personalizado" con el texto. Así el selector no requiere estado adicional y sobrevive a los re-renders.

### D6. PDF con jsPDF + jspdf-autotable (dos modos)
`pdf/generarPresupuestoPdf(budget, company, modo)` con `modo: 'detallado' | 'resumido'` compone el documento:
- Encabezado común: logo (si hay), datos de empresa, número y fecha del presupuesto; bloque de cliente y obra.
- **Detallado**: por cada sección imprime el nombre de la sección, una tabla de sus ítems con autotable (`columns: Descripción, Tipo, Cantidad, Unidad, Precio unitario, Monto`) y el subtotal de la sección; al final el desglose de subtotal general, descuento, base imponible, IVA y TOTAL, con repetición de encabezado para paginado.
- **Resumido**: por cada sección imprime solo el nombre y el subtotal de la sección (sin ítems), y al final el total general.
- Pié común: forma de pago, vigencia y observaciones.
- `doc.save('cotizacion-'+number+'-detalle.pdf')` para detallado y `doc.save('cotizacion-'+number+'-resumen.pdf')` para resumido. El título del documento es "COTIZACIÓN". Cada página lleva en el pie la línea "Exportado por ADOS OBRAS" y el crédito discreto "Elaborada por Matías Valdebenito Quezada" (D11).

Los montos que ingresan al PDF ya son enteros en centavos formateados por el mismo formateador de dominio, garantizando consistencia entre pantalla y documento.

### D7. PWA
- `manifest.webmanifest` (name, short_name, icons, theme_color, display: standalone, start_url).
- Service worker simple de cache-first en `public/sw.js` registrado desde `main.ts`, que cachea los assets del build para uso offline.
- `index.html` en español con `<meta name="theme-color">`, `<html lang="es">` y viewport móvil.
- Iconos PWA en `public/`.

Riesgo asumido: si el logo (data URL) crece, localStorage puede llenarse; como reserva se contempla IndexedDB para logos. No bloquea el MVP inicial.

### D8. Web Share API y descarga
- Botón "Compartir": si `navigator.share` existe, comparte `File` del **PDF detallado** con texto descriptivo; si no, se degrada a descarga.
- Botones de descarga diferenciados: "Descargar PDF detallado" y "Descargar PDF resumido" (`doc.save(...)` / `URL.createObjectURL` con `a[download]`).
- El PDF se genera bajo demanda en el momento de compartir/descargar (no se persiste en disco, evita acumular archivos).

### D9. Navegación e interfaz
SPA con 4 vistas (sin router de librería): **Inicio** (historial de cotizaciones con botón grande "Nueva cotización"), **Cotización** (formulario con secciones/ítems y totales), **Clientes**, **Configuración**. Barra inferior/tab de 2-3 accesos grandes (`Inicio`, `Clientes`, `Ajustes`) para dedos. Botones de alto contraste ≥ 44px. Todos los textos, mensajes y placeholders en español. Los términos visibles "Partida(s)" se reemplazan por "Sección" e "Ítem". La terminología visible del producto es **Cotización** (no "Presupuesto"), incluidos títulos, botones y textos de compartir/descargar.

### D10. Estados de cotización y archivado
Cada cotización tiene un `status: BudgetStatus` ∈ {`pendiente`, `se-realizara`, `no-realizada`}. Toda cotización nueva nace en `pendiente` (ver D5 y status/spec.md). Una cotización se considera **archivada** cuando su estado es `no-realizada` (`budgetIsArchived`). En Inicio se muestran dos listas: **Cotizaciones activas** (Pendiente y Se realizará) y **Archivadas** (No realizada). La acción "Cambiar estado" abre un diálogo con los tres estados; al elegir "No realizada" la cotización pasa a Archivadas, y al elegir "Pendiente" o "Se realizará" vuelve a activas. Cambiar el estado no altera el número correlativo ni el contenido de la cotización (D4). La migración asigna `pendiente` a cotizaciones antiguas sin estado o con estado desconocido.

### D11. Crédito discreto
Se muestra el crédito "Elaborada por Matías Valdebenito Quezada" de forma discreta en el pie de la app (`.app-credit`) y en el pie de cada página del PDF, junto a la línea "Exportado por ADOS OBRAS".

## Risks / Trade-offs

- [Cuota de localStorage (~5 MB)] → Logos limitados a ~1 MB como data URL; reserva a IndexedDB si se necesita más. No se almacenan PDFs, solo datos.
- [Estado local frágil: el usuario puede borrar datos del navegador] → Aceptado para el MVP (offline-first sin backend); se aprovecha la PWA instalada, no se mitiga con export de datos.
- [Web Share API no disponible en todo navegador/escritorio] → La descarga es siempre la alternativa; el botón de compartir se degrada con elegancia.
- [Data URL larga en localStorage puede degradar rendimiento al guardar] → Persistencia solo al guardar (no autosave) y límite de tamaño del logo.
- [Dominar jsPDF/autotable en layouts con muchos datos] → Partidas de horas-hombre típicas son pocas; autotable paginará con `startY`, y se mitiga con pruebas manuales de un presupuesto extenso.
- [Español en todos los textos] → Se centralizan los strings en una utilidad de etiquetas en `ui` y se evita generación en inglés en las bibliotecas (encabezados de tabla siempre en español explícito).

## Migration Plan

**Reestructuración de partidas → secciones/ítems.** Ya pueden existir presupuestos guardados con `items` a nivel de presupuesto (estructura anterior). La capa de almacenamiento migra sobre la marcha al leer: si un presupuesto no tiene `sections` pero tiene `items`, se envuelven en una sección automática con id estable `sec-legacy` y nombre "Obra general", y a cada ítem sin tipo se le asigna `otro`. La migración es de solo lectura e idempotente; al volver a guardar el presupuesto queda persistido ya con la nueva estructura. No se destruye ningún dato.

**Estados de cotización.** Toda cotización guardada sin campo `status` o con un estado desconocido se migra a `pendiente` al leer, de modo que las cotizaciones antiguas aparecen como activas (ver D10 y status/spec.md). La migración es de solo lectura e idempotente.

## Open Questions

- Formato es-CL exacto de centavos (¿mostrar siempre "$1.234" sin decimales o con ",00"?): se decide en implementación con el usuario verificando en pantalla, sin impacto en specs ni tareas.
- Tamaño del logo y límite real de localStorage: se valida empíricamente en una jornada; el límite de 1 MB es un supuesto inicial.