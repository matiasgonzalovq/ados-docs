const LOGO_MAX_DIM = 800
const LOGO_MAX_BYTES = 250 * 1024
const SIGNATURE_MAX_DIM = 600
const SIGNATURE_MAX_BYTES = 180 * 1024
const JPEG_QUALITY_START = 0.85
const JPEG_QUALITY_MIN = 0.40
const JPEG_QUALITY_STEP = 0.10

export type ImageKind = 'logo' | 'signature'

export type OptimizeResult = {
  dataUrl: string
  width: number
  height: number
  bytes: number
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('No se pudo cargar la imagen.'))
    img.src = URL.createObjectURL(file)
  })
}

function computeSize(w: number, h: number, maxDim: number): { w: number; h: number } {
  if (w <= maxDim && h <= maxDim) return { w, h }
  const scale = Math.min(maxDim / w, maxDim / h)
  return { w: Math.round(w * scale), h: Math.round(h * scale) }
}

function drawToCanvas(img: HTMLImageElement, w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, w, h)
  return canvas
}

function canvasToDataUrl(canvas: HTMLCanvasElement, quality: number): string {
  return canvas.toDataURL('image/jpeg', quality)
}

function dataUrlByteSize(dataUrl: string): number {
  const comma = dataUrl.indexOf(',')
  if (comma === -1) return 0
  const b64 = dataUrl.slice(comma + 1)
  return Math.ceil(b64.length * 3 / 4)
}

function validateFile(file: File): void {
  if (!file.type.startsWith('image/')) {
    throw new Error('El archivo seleccionado no es una imagen.')
  }
}

export async function optimizeIssuerImage(file: File, kind: ImageKind): Promise<OptimizeResult> {
  validateFile(file)
  const maxDim = kind === 'logo' ? LOGO_MAX_DIM : SIGNATURE_MAX_DIM
  const maxBytes = kind === 'logo' ? LOGO_MAX_BYTES : SIGNATURE_MAX_BYTES

  const img = await loadImage(file)
  const { w, h } = computeSize(img.naturalWidth, img.naturalHeight, maxDim)
  const canvas = drawToCanvas(img, w, h)

  let quality = JPEG_QUALITY_START
  let dataUrl = canvasToDataUrl(canvas, quality)
  let bytes = dataUrlByteSize(dataUrl)

  while (bytes > maxBytes && quality > JPEG_QUALITY_MIN) {
    quality -= JPEG_QUALITY_STEP
    dataUrl = canvasToDataUrl(canvas, quality)
    bytes = dataUrlByteSize(dataUrl)
  }

  if (bytes > maxBytes) {
    throw new Error(
      kind === 'logo'
        ? 'El logo es demasiado incluso con compresión máxima. Intenta con una imagen más pequeña.'
        : 'La firma es demasiado grande incluso con compresión máxima. Intenta con una imagen más pequeña.',
    )
  }

  return { dataUrl, width: w, height: h, bytes }
}
