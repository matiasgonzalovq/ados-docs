import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Budget, BudgetItem, BudgetSection, CompanyConfig, RGB, IssuerSnapshot } from '../domain/types.ts'
import { UNIT_LABELS } from '../domain/units.ts'
import { calculateInsuranceTotals, formatCLP, moneyToCents } from '../domain/money.ts'
import { budgetSubtotalCents, budgetAdjustedSubtotalCents, budgetHasValidItems, sectionSubtotalCents, sectionAdjustedSubtotalCents, formatValidityValue, formatExecutionTime } from '../domain/validators.ts'
import { formatRut } from '../domain/rut.ts'

export type PdfModo = 'detallado' | 'resumido'

// ── Theme colors ──
const DEFAULT_THEME: RGB = [30, 58, 95]
function themeRgb(snap: IssuerSnapshot | undefined, company: CompanyConfig): RGB {
  const tc = snap?.themeColor ?? (company as Record<string, unknown>).themeColor
  if (Array.isArray(tc) && tc.length === 3) return tc as RGB
  return DEFAULT_THEME
}
function themeLight(rgb: RGB): RGB {
  return [rgb[0], rgb[1], rgb[2]].map((c) => Math.min(255, c + 180)) as RGB
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

const MARGIN = 13
const EXPORT_LINE = 'Exportado por ADOS DOCS'

function pdfText(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

// ── Image helpers ──
type ImgDims = { width: number; height: number }

function dataUrlBytes(dataUrl: string): Uint8Array | null {
  const comma = dataUrl.indexOf(',')
  if (comma === -1) return null
  const b64 = dataUrl.slice(comma + 1)
  try {
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes
  } catch { return null }
}

function pngDims(bytes: Uint8Array): ImgDims | null {
  if (bytes.length < 24) return null
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return null
  const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]
  const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]
  return width > 0 && height > 0 ? { width, height } : null
}

function jpegDims(bytes: Uint8Array): ImgDims | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  let i = 2
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) { i++; continue }
    const marker = bytes[i + 1]
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = (bytes[i + 5] << 8) | bytes[i + 6]
      const width = (bytes[i + 7] << 8) | bytes[i + 8]
      if (width > 0 && height > 0) return { width, height }
    }
    const len = (bytes[i + 2] << 8) | bytes[i + 3]
    if (len < 2) break
    i += 2 + len
  }
  return null
}

function webpDims(bytes: Uint8Array): ImgDims | null {
  if (bytes.length < 30) return null
  const isRiff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === 'RIFF'
  const isWebp = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) === 'WEBP'
  if (!isRiff || !isWebp) return null
  if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x58) {
    const width = (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)) + 1
    const height = (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) + 1
    if (width > 0 && height > 0) return { width, height }
  }
  return null
}

function naturalDims(dataUrl: string): ImgDims | null {
  const bytes = dataUrlBytes(dataUrl)
  if (!bytes) return null
  return pngDims(bytes) ?? jpegDims(bytes) ?? webpDims(bytes)
}

function imageFormat(dataUrl: string): 'PNG' | 'JPEG' | 'WEBP' {
  if (/^data:image\/jpeg/i.test(dataUrl)) return 'JPEG'
  if (/^data:image\/webp/i.test(dataUrl)) return 'WEBP'
  if (/^data:image\/png/i.test(dataUrl)) return 'PNG'
  const bytes = dataUrlBytes(dataUrl)
  if (bytes && bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) return 'JPEG'
  if (bytes && bytes.length >= 12 && String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) === 'WEBP') return 'WEBP'
  if (bytes && bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'PNG'
  return 'PNG'
}

// ── Icon drawing helpers ──
function iconRut(doc: jsPDF, x: number, y: number, rgb: RGB) {
  doc.setDrawColor(...rgb)
  doc.setFillColor(...rgb)
  doc.setLineWidth(0.4)
  doc.roundedRect(x, y - 2.8, 3.2, 2.8, 0.4, 0.4, 'S')
  doc.line(x + 0.8, y - 1.2, x + 2.4, y - 1.2)
  doc.line(x + 0.8, y - 0.5, x + 2.4, y - 0.5)
  doc.setDrawColor(0, 0, 0)
  doc.setFillColor(0, 0, 0)
}

function iconGiro(doc: jsPDF, x: number, y: number, rgb: RGB) {
  doc.setDrawColor(...rgb)
  doc.setLineWidth(0.4)
  doc.rect(x + 0.3, y - 2.8, 2.6, 2.2, 'S')
  doc.line(x + 1.6, y - 2.8, x + 1.6, y - 0.6)
  doc.line(x + 0.3, y - 1.7, x + 2.9, y - 1.7)
  doc.setDrawColor(0, 0, 0)
}

function iconPhone(doc: jsPDF, x: number, y: number, rgb: RGB) {
  doc.setDrawColor(...rgb)
  doc.setLineWidth(0.4)
  doc.roundedRect(x + 0.6, y - 3, 2, 2.6, 0.5, 0.5, 'S')
  doc.line(x + 1.3, y - 0.6, x + 1.9, y - 0.6)
  doc.setDrawColor(0, 0, 0)
}

function iconEmail(doc: jsPDF, x: number, y: number, rgb: RGB) {
  doc.setDrawColor(...rgb)
  doc.setLineWidth(0.4)
  doc.rect(x + 0.2, y - 2.8, 2.8, 2.2, 'S')
  doc.line(x + 0.2, y - 2.8, x + 1.6, y - 1.5)
  doc.line(x + 3.0, y - 2.8, x + 1.6, y - 1.5)
  doc.setDrawColor(0, 0, 0)
}

function iconAddress(doc: jsPDF, x: number, y: number, rgb: RGB) {
  doc.setDrawColor(...rgb)
  doc.setFillColor(...rgb)
  doc.setLineWidth(0.4)
  doc.circle(x + 1.6, y - 2.2, 1.1, 'S')
  doc.circle(x + 1.6, y - 2.2, 0.4, 'F')
  doc.setDrawColor(0, 0, 0)
  doc.setFillColor(0, 0, 0)
}

// ── Header ──
function drawEncabezado(doc: jsPDF, budget: Budget, company: CompanyConfig): number {
  const pageWidth = doc.internal.pageSize.getWidth()
  const rightEdge = pageWidth - MARGIN
  let y = MARGIN
  const snap = budget.issuerSnapshot
  const tc = themeRgb(snap, company)

  // ── Row 1: COTIZACIÓN (left) + Fecha (right) ──
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...tc)
  doc.text('COTIZACIÓN', MARGIN, y)
  doc.setTextColor(0)
  y += 6
  doc.setFontSize(11)
  doc.text(`N.º ${String(budget.number).padStart(4, '0')}`, MARGIN, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(`Fecha: ${formatDate(budget.date)}`, rightEdge, y, { align: 'right' })
  y += 4

  // ── Row 2: [LOGO] [COMPANY DATA with icons] ──
  const LOGO_MAX_W = 42
  const LOGO_MAX_H = 30
  const LOGO_TEXT_GAP = 5

  const logoDataUrl = snap?.logoDataUrl ?? company.logoDataUrl
  const dims = logoDataUrl ? naturalDims(logoDataUrl) : null

  let logoW = 0
  let logoH = 0
  if (dims) {
    const scale = Math.min(LOGO_MAX_W / dims.width, LOGO_MAX_H / dims.height)
    logoW = dims.width * scale
    logoH = dims.height * scale
  }

  const logoX = MARGIN
  const companyX = logoX + Math.max(logoW, 20) + LOGO_TEXT_GAP
  const companyMaxW = rightEdge - companyX

  // Build company lines with icons
  type CompanyField = { text: string; bold: boolean; icon?: 'rut' | 'giro' | 'phone' | 'email' | 'address' }
  const companyLines: CompanyField[] = []
  if (snap) {
    if (snap.name) companyLines.push({ text: snap.name, bold: true })
    if (snap.rut) companyLines.push({ text: snap.rut, bold: false, icon: 'rut' })
    if (snap.giro) companyLines.push({ text: snap.giro, bold: false, icon: 'giro' })
    if (snap.phone) companyLines.push({ text: snap.phone, bold: false, icon: 'phone' })
    if (snap.email) companyLines.push({ text: snap.email, bold: false, icon: 'email' })
    if (snap.address) companyLines.push({ text: snap.address, bold: false, icon: 'address' })
    if (snap.info) companyLines.push({ text: snap.info, bold: false })
  } else {
    if (company.name) companyLines.push({ text: company.name, bold: true })
    if (company.rut) companyLines.push({ text: company.rut, bold: false, icon: 'rut' })
    if (company.phone) companyLines.push({ text: company.phone, bold: false, icon: 'phone' })
    if (company.email) companyLines.push({ text: company.email, bold: false, icon: 'email' })
    if (company.address) companyLines.push({ text: company.address, bold: false, icon: 'address' })
  }

  // Draw company data with word wrapping — first pass to measure height
  const LINE_H = 3.8
  const ICON_GAP = 5
  const blockTop = y
  let companyBlockH = 0
  doc.setFontSize(10)
  const wrappedLines: Array<{ lines: string[]; bold: boolean; icon?: CompanyField['icon'] }> = []
  for (const field of companyLines) {
    doc.setFont('helvetica', field.bold ? 'bold' : 'normal')
    const w = field.icon ? companyMaxW - ICON_GAP : companyMaxW
    const wrapped = doc.splitTextToSize(pdfText(field.text), w)
    wrappedLines.push({ lines: wrapped, bold: field.bold, icon: field.icon })
    companyBlockH += wrapped.length * LINE_H
  }

  // Center logo vertically within company block
  const logoY = companyBlockH > logoH
    ? blockTop + (companyBlockH - logoH) / 2
    : blockTop

  // Second pass — draw text
  let ty = blockTop
  doc.setFontSize(10)
  const iconFns: Record<string, typeof iconRut> = { rut: iconRut, giro: iconGiro, phone: iconPhone, email: iconEmail, address: iconAddress }
  for (const wl of wrappedLines) {
    doc.setFont('helvetica', wl.bold ? 'bold' : 'normal')
    const textX = wl.icon ? companyX + ICON_GAP : companyX
    if (wl.icon) {
      const fn = iconFns[wl.icon]
      if (fn) fn(doc, companyX, ty + 0.2, tc)
    }
    for (const line of wl.lines) {
      doc.text(line, textX, ty)
      ty += LINE_H
    }
  }

  const logoBottom = logoY + logoH
  const companyBottom = blockTop + companyBlockH
  y = Math.max(logoBottom, companyBottom) + 3

  // Draw logo
  if (dims && logoDataUrl && logoW > 0) {
    try {
      doc.addImage(logoDataUrl, imageFormat(logoDataUrl), logoX, logoY, logoW, logoH)
    } catch { /* Logo no representable */ }
  }

  // ── Separator line ──
  doc.setDrawColor(...tc)
  doc.setLineWidth(0.5)
  doc.line(MARGIN, y, rightEdge, y)
  doc.setLineWidth(0.2)
  doc.setDrawColor(0, 0, 0)
  y += 5

  // ── Datos del cliente ──
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...tc)
  doc.text('Datos del cliente', MARGIN, y)
  doc.setTextColor(0)
  y += 4
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const clientSnap = budget.clientSnapshot
  if (clientSnap) {
    const clientLines = [clientSnap.name, clientSnap.rut ? `RUT: ${clientSnap.rut}` : '', clientSnap.phone ? `Teléfono: ${clientSnap.phone}` : '', clientSnap.address ?? ''].filter((l): l is string => !!l)
    for (const line of clientLines) {
      doc.text(pdfText(line), MARGIN, y)
      y += 4
    }
  }
  y += 2

  // ── Obra ──
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...tc)
  doc.text('Obra', MARGIN, y)
  doc.setTextColor(0)
  y += 4
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  for (const line of [budget.jobName, budget.jobAddress].filter(Boolean)) {
    doc.text(pdfText(line), MARGIN, y)
    y += 4
  }
  y += 5

  return y
}

// ── Section title ──
function drawSectionTitle(doc: jsPDF, name: string, y: number, tc: RGB): number {
  const pageWidth = doc.internal.pageSize.getWidth()
  const lightBlue: RGB = [224, 241, 250]
  doc.setFillColor(...lightBlue)
  doc.roundedRect(MARGIN, y - 3.4, pageWidth - MARGIN * 2, 5.8, 0.8, 0.8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.setTextColor(...tc)
  doc.text(pdfText(name), MARGIN + 2, y)
  doc.setTextColor(0)
  return y + 3.6
}

// ── Section subtotal ──
function drawSectionSubtotal(doc: jsPDF, section: BudgetSection, startY: number, tc: RGB, insurance = false): number {
  const pageWidth = doc.internal.pageSize.getWidth()
  const barHeight = 4.8
  const gapAbove = 1.2
  let barTop = startY + gapAbove
  if (barTop + barHeight > doc.internal.pageSize.getHeight() - 16) {
    doc.addPage()
    barTop = MARGIN
  }
  const textY = barTop + 3.2
  const label = insurance ? 'Subtotal ajustado:' : 'Subtotal sección:'
  const value = formatCLP(insurance ? sectionAdjustedSubtotalCents(section) : sectionSubtotalCents(section))

  const subtotalFill: RGB = [232, 245, 235]
  doc.setFillColor(...subtotalFill)
  doc.rect(MARGIN, barTop, pageWidth - MARGIN * 2, barHeight, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(35, 91, 55)
  doc.text(label, pageWidth - MARGIN - 55, textY, { align: 'left' })
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...tc)
  doc.text(value, pageWidth - MARGIN, textY, { align: 'right' })
  doc.setTextColor(0)
  // Reserva el ascenso del siguiente título: su fondo comienza 3,4 mm antes
  // de la línea base. Sin esta reserva, el celeste cubre el texto del subtotal.
  return barTop + barHeight + 3.4
}

// ── Table ──
function itemRow(item: BudgetItem): string[] {
  const base = moneyToCents(item.quantity, item.unitPrice)
  return [
    '',
    pdfText(item.description),
    UNIT_LABELS[item.unit] ?? item.unit,
    String(item.quantity),
    formatCLP(Math.round(item.unitPrice * 100)),
    formatCLP(base),
    pdfText(item.observation ?? ''),
  ]
}

function globalRowClean(section: BudgetSection): string[] {
  const amount = formatCLP(Math.round((section.globalAmount ?? 0) * 100))
  return ['', 'Ejecución global de los trabajos descritos', 'Global', '1', amount, amount, '']
}

function drawDetailBlock(doc: jsPDF, section: BudgetSection, startY: number, tc: RGB): number {
  const pageWidth = doc.internal.pageSize.getWidth()
  const contentW = pageWidth - MARGIN * 2
  let y = startY

  // Check page break
  if (y + 10 > doc.internal.pageSize.getHeight() - 20) {
    doc.addPage()
    y = MARGIN
  }

  // Title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.2)
  doc.setTextColor(...tc)
  doc.text('Detalle de trabajos incluidos', MARGIN, y)
  y += 4

  // Bullet items
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(40)
  const BULLET_INDENT = 5
  const LINE_H = 3.4
  const workDetails = section.workDetails ?? []

  for (const wd of workDetails) {
    const bulletText = `• ${pdfText(wd.description)}`
    const wrapped = doc.splitTextToSize(bulletText, contentW - BULLET_INDENT)

    // Page break check for each item
    if (y + wrapped.length * LINE_H > doc.internal.pageSize.getHeight() - 20) {
      doc.addPage()
      y = MARGIN
    }

    for (const line of wrapped) {
      doc.text(line, MARGIN + BULLET_INDENT, y)
      y += LINE_H
    }
    y += 0.3
  }

  return y + 1
}

function drawSeccionDetallada(
  doc: jsPDF,
  section: BudgetSection,
  startY: number,
  tc: RGB,
  sectionIndex: number,
  insurance: boolean,
): number {
  let y = startY
  if (y > doc.internal.pageSize.getHeight() - 50) {
    doc.addPage()
    y = MARGIN
  }

  y = drawSectionTitle(doc, `${sectionIndex + 1}. ${section.name}`, y, tc)

  const hasWorkDetails = section.workDetails && section.workDetails.length > 0
  const hasGlobal = section.globalAmount != null && section.globalAmount > 0
  const hasItems = section.items.length > 0

  if (!hasWorkDetails && !hasGlobal && !hasItems) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(9)
    doc.setTextColor(120)
    doc.text('(Sin contenido)', MARGIN, y + 4)
    doc.setTextColor(0)
    return y + 10
  }

  const rgbLight = themeLight(tc)

  // Phase 1: draw work details as manual text block (if present)
  if (hasWorkDetails) {
    y = drawDetailBlock(doc, section, y, tc)
  }

  // Phase 2: draw table — global row (if any) + items
  const rows: string[][] = []
  const groupRowIndexes = new Set<number>()
  if (hasGlobal) {
    rows.push(globalRowClean(section))
  }
  const grouped = new Map<string, BudgetItem[]>()
  for (const item of section.items) {
    const groupName = item.groupName?.trim() || 'General'
    grouped.set(groupName, [...(grouped.get(groupName) ?? []), item])
  }
  for (const [groupIndex, [groupName, items]] of Array.from(grouped.entries()).entries()) {
    const isImplicitGeneral = grouped.size === 1 && groupName === 'General'
    if (!isImplicitGeneral) {
      groupRowIndexes.add(rows.length)
      rows.push([`${sectionIndex + 1}.${groupIndex + 1}`, pdfText(groupName), '', '', '', '', ''])
    }
    for (const item of items) {
      rows.push(itemRow(item))
    }
  }

  if (rows.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      theme: 'plain',
      styles: {
        font: 'helvetica',
        fontSize: 7.2,
        cellPadding: { top: 0.65, bottom: 0.65, left: 2.1, right: 2.1 },
        textColor: [40, 40, 40],
        lineColor: [220, 220, 220],
        lineWidth: 0.2,
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: tc,
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 7.5,
        cellPadding: { top: 1.2, bottom: 1.2, left: 2.1, right: 2.1 },
        halign: 'left',
      },
      alternateRowStyles: {
        fillColor: [255, 255, 255],
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 9 },
        1: { halign: 'left', cellWidth: 'auto' },
        2: { halign: 'center', cellWidth: 12 },
        3: { halign: 'right', cellWidth: 12 },
        4: { halign: 'right', cellWidth: 24 },
        5: { halign: 'right', cellWidth: 24 },
        6: { halign: 'left', cellWidth: 25 },
      },
      head: [['N.º', 'Partida', 'Un.', 'Cant.', 'P.U.', 'P.T.', 'Obs.']],
      body: rows,
      didParseCell: (data) => {
        if (data.section !== 'body') return
        if (groupRowIndexes.has(data.row.index)) {
          data.cell.styles.fillColor = [255, 255, 255]
          data.cell.styles.fontStyle = 'bold'
          data.cell.styles.textColor = tc
          data.cell.styles.cellPadding = { top: 0.9, bottom: 0.55, left: 2.1, right: 2.1 }
        }
        // Global row: italic description, light background
        if (hasGlobal && data.row.index === 0) {
          if (data.column.index === 0) {
            data.cell.styles.fontStyle = 'italic'
          }
          data.cell.styles.fillColor = rgbLight
        }
      },
      didDrawPage: () => {},
    })

    y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y
  }

  return drawSectionSubtotal(doc, section, y, tc, insurance)
}

// ── Totals block ──
function drawTotales(
  doc: jsPDF,
  budget: Budget,
  subtotal: number,
  startY: number,
  tituloTotal: string,
  tc: RGB,
): number {
  const pageWidth = doc.internal.pageSize.getWidth()
  const discount = Math.min(budget.discount, subtotal)
  const baseImponible = subtotal - discount
  const iva = Math.round((baseImponible * budget.ivaRate) / 100)
  const total = baseImponible + iva

  const labelX = pageWidth - MARGIN - 100
  const valueX = pageWidth - MARGIN
  const boxW = 104
  const boxX = valueX - boxW
  let ty = startY + 2

  // Regular lines — skip discount if 0
  const regulars: Array<[string, string]> = [
    ['Subtotal general', formatCLP(subtotal)],
  ]
  if (discount > 0) {
    regulars.push(['Descuento', formatCLP(discount)])
  }
  regulars.push(
    ['Base imponible', formatCLP(baseImponible)],
    [`IVA (${budget.ivaRate}%)`, formatCLP(iva)],
  )

  doc.setFontSize(8.5)
  for (const [label, value] of regulars) {
    if (ty > doc.internal.pageSize.getHeight() - 14) {
      doc.addPage()
      ty = MARGIN
    }
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(60)
    doc.text(label, labelX, ty)
    doc.setTextColor(0)
    doc.text(value, valueX, ty, { align: 'right' })
    ty += 4.6
  }

  // Separator before total
  ty += 0.6
  doc.setDrawColor(...tc)
  doc.setLineWidth(0.3)
  doc.line(boxX, ty, valueX, ty)
  ty += 1

  // Total box
  const boxH = 8
  doc.setFillColor(...themeLight(tc))
  doc.roundedRect(boxX, ty - 3.5, boxW, boxH, 1, 1, 'F')
  doc.setDrawColor(...tc)
  doc.setLineWidth(0.3)
  doc.roundedRect(boxX, ty - 3.5, boxW, boxH, 1, 1, 'S')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.setTextColor(...tc)
  doc.text(tituloTotal, labelX, ty + 1)
  doc.setFontSize(10.5)
  doc.setTextColor(0)
  doc.text(formatCLP(total), valueX, ty + 1, { align: 'right' })

  doc.setLineWidth(0.2)
  doc.setDrawColor(0, 0, 0)
  return ty + boxH + 2
}

function drawInsuranceTotals(doc: jsPDF, budget: Budget, startY: number, tc: RGB): number {
  const pageWidth = doc.internal.pageSize.getWidth()
  const valueX = pageWidth - MARGIN
  const labelX = valueX - 92
  let y = startY + 3
  const totals = calculateInsuranceTotals(
    budgetAdjustedSubtotalCents(budget),
    budget.overheadRate ?? 25,
    budget.ivaRate,
    budget.ufValue ?? 0,
    budget.deductibleUf ?? 0,
  )
  const rows: Array<[string, string, boolean?]> = [
    ['Costo directo', formatCLP(totals.directCost)],
    [`GG y utilidad (${budget.overheadRate ?? 25}%)`, formatCLP(totals.overhead)],
    ['Costo neto', formatCLP(totals.netCost), true],
    [`IVA (${budget.ivaRate}%)`, formatCLP(totals.iva)],
    ['TOTAL', formatCLP(totals.adjustedTotal), true],
    ['Equivalencia', totals.ufEquivalent == null ? 'Sin valor UF' : `${totals.ufEquivalent.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UF`],
    [`Deducible (${totals.deductibleUf.toLocaleString('es-CL')} UF)`, formatCLP(totals.deductible)],
    ['PÉRDIDA INDEMNIZABLE', formatCLP(totals.indemnizableLoss), true],
  ]
  if (y + rows.length * 5 > doc.internal.pageSize.getHeight() - 18) {
    doc.addPage()
    y = MARGIN
  }
  for (const [label, value, strong] of rows) {
    if (strong) {
      doc.setFillColor(...themeLight(tc))
      doc.rect(labelX - 3, y - 3.3, valueX - labelX + 3, 5, 'F')
    }
    doc.setFont('helvetica', strong ? 'bold' : 'normal')
    doc.setFontSize(strong ? 9 : 8.3)
    doc.setTextColor(strong ? tc[0] : 55, strong ? tc[1] : 55, strong ? tc[2] : 55)
    doc.text(label, labelX, y)
    doc.setTextColor(0)
    doc.text(value, valueX, y, { align: 'right' })
    y += strong ? 6 : 4.8
  }
  if (budget.ufConversionDate || (budget.ufValue ?? 0) > 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(80)
    const dateText = budget.ufConversionDate ? formatDate(`${budget.ufConversionDate}T12:00:00`) : 'sin fecha'
    doc.text(`Conversión UF: ${dateText} · Valor UF: ${budget.ufValue ? formatCLP(Math.round(budget.ufValue * 100)) : 'sin informar'}`, valueX, y, { align: 'right' })
    y += 5
  }
  return y + 2
}

// ── Pie (payment, validity, execution time, notes) ──
function drawPie(doc: jsPDF, budget: Budget, startY: number, tc: RGB): number {
  const pageWidth = doc.internal.pageSize.getWidth()
  const contentW = pageWidth - MARGIN * 2

  let ty = startY
  doc.setDrawColor(...tc)
  doc.setLineWidth(0.3)
  doc.line(MARGIN, ty, pageWidth - MARGIN, ty)
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.2)
  ty += 3

  const TITLE_H = 3.4
  const LINE_H = 3.3
  const COL_GAP = 6

  // Row 1: payment + validity + execution time (3 columns)
  const topCols: Array<{ title: string; text: string }> = []
  if (budget.paymentTerms) topCols.push({ title: 'Forma de pago', text: budget.paymentTerms })
  const validityText = (budget.validityValue != null && budget.validityUnit)
    ? formatValidityValue(budget.validityValue, budget.validityUnit)
    : budget.validity
  if (validityText) topCols.push({ title: 'Vigencia cotización', text: validityText })
  if (budget.executionTimeValue != null && budget.executionTimeUnit) {
    topCols.push({ title: 'Tiempo estimado de ejecución', text: formatExecutionTime(budget.executionTimeValue, budget.executionTimeUnit) })
  }

  if (topCols.length > 0) {
    const colW = (contentW - COL_GAP * (topCols.length - 1)) / topCols.length
    let maxTopLines = 0
    const topData = topCols.map((c) => {
      const titleLines = doc.splitTextToSize(c.title, colW)
      const bodyLines = doc.splitTextToSize(c.text, colW)
      const total = titleLines.length + bodyLines.length
      if (total > maxTopLines) maxTopLines = total
      return { titleLines, bodyLines }
    })

    topData.forEach((col, i) => {
      const x = MARGIN + i * (colW + COL_GAP)
      let cy = ty
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.8)
      doc.setTextColor(...tc)
      for (const line of col.titleLines) {
        doc.text(line, x, cy)
        cy += TITLE_H
      }
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(40)
      for (const line of col.bodyLines) {
        doc.text(line, x, cy)
        cy += LINE_H
      }
    })
    ty += maxTopLines * LINE_H + 2
  }

  // Row 2: Observaciones at full width
  if (budget.notes) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.8)
    doc.setTextColor(...tc)
    doc.text('Observaciones', MARGIN, ty)
    ty += TITLE_H

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(40)

    // Handle line breaks: split by newlines, preserve structure
    const rawLines = budget.notes.split('\n')
    const allWrapped: string[] = []
    for (const raw of rawLines) {
      if (raw.trim() === '') {
        allWrapped.push('')
      } else {
        const wrapped = doc.splitTextToSize(pdfText(raw), contentW)
        allWrapped.push(...wrapped)
      }
    }
    for (const line of allWrapped) {
      doc.text(line, MARGIN, ty)
      ty += LINE_H
    }
    ty += 1
  }

  return ty
}

// ── Signature ──
function drawFirma(doc: jsPDF, budget: Budget, startY: number): number {
  if (!budget.signatureMode || budget.signatureMode === 'none') return startY
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const FOOTER_RESERVE = 10
  const snap = budget.issuerSnapshot
  const displaySignerName = pdfText((snap?.signerName?.trim() || snap?.name) ?? '')
  const signerRut = snap?.signerRut
  const signerRole = snap?.signerRole ? pdfText(snap.signerRole) : undefined

  const SIG_MAX_W = 46
  const SIG_MAX_H = 20
  const LINE_W = 56
  const centerX = pageWidth / 2

  const infoLines = (displaySignerName ? 1 : 0) + (signerRut ? 1 : 0) + (signerRole ? 1 : 0)
  const infoH = infoLines > 0 ? infoLines * 3.8 : 0

  let imageH = 0
  const sigUrl = snap?.signatureDataUrl
  if (sigUrl) {
    const dims = naturalDims(sigUrl)
    if (dims) {
      const scale = Math.min(SIG_MAX_W / dims.width, SIG_MAX_H / dims.height)
      imageH = dims.height * scale
    }
  }
  const totalNeeded = (sigUrl ? imageH + 1 : 0) + 3.5 + infoH + 1

  let y = startY + 1
  if (y + totalNeeded > pageHeight - FOOTER_RESERVE) {
    doc.addPage()
    y = MARGIN
  }

  doc.setDrawColor(0, 0, 0)

  if (budget.signatureMode === 'saved' && sigUrl) {
    const dims = naturalDims(sigUrl)
    if (dims) {
      const scale = Math.min(SIG_MAX_W / dims.width, SIG_MAX_H / dims.height)
      const w = dims.width * scale
      const h = dims.height * scale
      const imgX = centerX - w / 2
      try { doc.addImage(sigUrl, imageFormat(sigUrl), imgX, y, w, h) } catch { /* */ }
      y += h
    }
  }

  y += 0.6
  doc.line(centerX - LINE_W / 2, y, centerX + LINE_W / 2, y)
  y += 3.8

  if (displaySignerName) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(0)
    doc.text(displaySignerName, centerX, y, { align: 'center' })
    y += 3.8
  }
  if (signerRut) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(60)
    doc.text(`RUT: ${formatRut(signerRut)}`, centerX, y, { align: 'center' })
    y += 3.8
  }
  if (signerRole) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(100)
    doc.text(signerRole, centerX, y, { align: 'center' })
    y += 3.8
  }

  return y
}

// ── Footer ──
function drawFooter(doc: jsPDF): void {
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const pageCount = doc.getNumberOfPages()
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(140)
    doc.text(EXPORT_LINE, pageWidth / 2, pageHeight - 8, { align: 'center' })
    doc.setTextColor(0)
  }
}

// ── Height pre-calculations ──
function drawPieHeight(doc: jsPDF, budget: Budget): number {
  const pageWidth = doc.internal.pageSize.getWidth()
  const contentW = pageWidth - MARGIN * 2
  const COL_GAP = 6
  const LINE_H = 3.3
  const TITLE_H = 3.4
  const EXTRA = 4

  // Row 1: top columns
  const topCols: Array<{ title: string; text: string }> = []
  if (budget.paymentTerms) topCols.push({ title: 'Forma de pago', text: budget.paymentTerms })
  const validityText = (budget.validityValue != null && budget.validityUnit)
    ? formatValidityValue(budget.validityValue, budget.validityUnit)
    : budget.validity
  if (validityText) topCols.push({ title: 'Vigencia cotización', text: validityText })
  if (budget.executionTimeValue != null && budget.executionTimeUnit) {
    topCols.push({ title: 'Tiempo estimado de ejecución', text: formatExecutionTime(budget.executionTimeValue, budget.executionTimeUnit) })
  }

  let h = 0
  if (topCols.length > 0) {
    const colW = (contentW - COL_GAP * (topCols.length - 1)) / topCols.length
    let maxTopLines = 0
    for (const c of topCols) {
      const t = doc.splitTextToSize(c.title, colW).length
      const b = doc.splitTextToSize(c.text, colW).length
      if (t + b > maxTopLines) maxTopLines = t + b
    }
    h += maxTopLines * LINE_H + 3
  }

  // Row 2: observations at full width
  if (budget.notes) {
    h += TITLE_H
    const rawLines = budget.notes.split('\n')
    for (const raw of rawLines) {
      if (raw.trim() === '') {
        h += LINE_H
      } else {
        h += doc.splitTextToSize(pdfText(raw), contentW).length * LINE_H
      }
    }
    h += 1
  }

  return h > 0 ? h + EXTRA : 0
}

function drawFirmaHeight(budget: Budget): number {
  if (!budget.signatureMode || budget.signatureMode === 'none') return 0
  const snap = budget.issuerSnapshot
  const displaySignerName = pdfText((snap?.signerName?.trim() || snap?.name) ?? '')
  const signerRut = snap?.signerRut
  const signerRole = snap?.signerRole ? pdfText(snap.signerRole) : undefined
  const SIG_MAX_W = 46
  const SIG_MAX_H = 20
  let imageH = 0
  if (budget.signatureMode === 'saved' && snap?.signatureDataUrl) {
    const dims = naturalDims(snap.signatureDataUrl)
    if (dims) {
      const scale = Math.min(SIG_MAX_W / dims.width, SIG_MAX_H / dims.height)
      imageH = dims.height * scale
    }
  }
  const infoLines = (displaySignerName ? 1 : 0) + (signerRut ? 1 : 0) + (signerRole ? 1 : 0)
  return 1 + (imageH > 0 ? imageH + 1 : 0) + 3.5 + (infoLines > 0 ? infoLines * 3.8 : 0) + 1
}

function drawFinalBlock(doc: jsPDF, budget: Budget, startY: number, tc: RGB): number {
  const pageHeight = doc.internal.pageSize.getHeight()
  const FOOTER_RESERVE = 10
  const pieH = drawPieHeight(doc, budget)
  const firmaH = drawFirmaHeight(budget)
  const totalNeeded = pieH + firmaH

  let y = startY
  if (y + totalNeeded > pageHeight - FOOTER_RESERVE) {
    doc.addPage()
    y = MARGIN
  }
  y = drawPie(doc, budget, y, tc)
  y = drawFirma(doc, budget, y)
  drawFooter(doc)
  return y
}

// ── Main export ──
export function generarPresupuestoPdf(
  budget: Budget,
  company: CompanyConfig,
  modo: PdfModo = 'detallado',
): jsPDF {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const tc = themeRgb(budget.issuerSnapshot, company)
  const insurance = budget.pricingMode === 'insurance-adjustment'

  let y = drawEncabezado(doc, budget, company)
  const subtotal = budgetSubtotalCents(budget)

  const workTableTitle = pdfText(budget.workTableTitle?.trim() || 'Trabajos a realizar')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...tc)
  doc.text(workTableTitle, MARGIN, y)
  doc.setDrawColor(...tc)
  doc.line(MARGIN, y + 1, MARGIN + doc.getTextWidth(workTableTitle), y + 1)
  doc.setTextColor(0)
  y += 7

  if (modo === 'resumido') {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(...tc)
    doc.text('Resumen por sección', MARGIN, y)
    doc.setTextColor(0)
    y += 7
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    const rightEdge = pageWidth - MARGIN
    for (const section of budget.sections) {
      if (y > pageHeight - 30) { doc.addPage(); y = MARGIN }
      const label = section.name
      const valueText = formatCLP(insurance ? sectionAdjustedSubtotalCents(section) : sectionSubtotalCents(section))
      const labelWidth = doc.getTextWidth(label)
      const valueWidth = doc.getTextWidth(valueText)
      const dx = MARGIN + labelWidth + 4
      const endX = rightEdge - valueWidth - 4
      if (endX > dx) {
        doc.setDrawColor(200)
        doc.setLineDashPattern([1, 2], 0)
        doc.line(dx, y - 1.5, endX, y - 1.5)
        doc.setLineDashPattern([], 0)
        doc.setDrawColor(0, 0, 0)
      }
      doc.text(label, MARGIN, y)
      doc.text(valueText, rightEdge, y, { align: 'right' })
      y += 7
    }
    y += 2
    y = insurance
      ? drawInsuranceTotals(doc, budget, y, tc)
      : drawTotales(doc, budget, subtotal, y, 'TOTAL PROYECTO', tc)
    drawFinalBlock(doc, budget, y, tc)
    return doc
  }

  for (const [sectionIndex, section] of budget.sections.entries()) {
    y = drawSeccionDetallada(doc, section, y, tc, sectionIndex, insurance)
    y += 1.5
  }

  y = insurance
    ? drawInsuranceTotals(doc, budget, y, tc)
    : drawTotales(doc, budget, subtotal, y, 'TOTAL PROYECTO', tc)
  drawFinalBlock(doc, budget, y, tc)

  return doc
}

export function nombreArchivoCotizacionDetallado(budget: Budget): string {
  return `cotizacion-${String(budget.number).padStart(4, '0')}-detalle.pdf`
}

export function nombreArchivoCotizacionResumido(budget: Budget): string {
  return `cotizacion-${String(budget.number).padStart(4, '0')}-resumen.pdf`
}

export function puedeGenerarPdf(budget: Budget): { ok: boolean; reason?: string } {
  if (!budget.clientSnapshot) return { ok: false, reason: 'Debes seleccionar un cliente.' }
  if (!budgetHasValidItems(budget)) return { ok: false, reason: 'Agrega al menos un ítem, valor global o detalle de trabajos.' }
  return { ok: true }
}
