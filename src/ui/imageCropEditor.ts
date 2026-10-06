export type CropResult = {
  dataUrl: string
  width: number
  height: number
}

export type CropOptions = {
  aspectRatio?: number
  maxWidth?: number
  maxHeight?: number
}

export function openImageCropEditor(
  file: File,
  options: CropOptions = {},
): Promise<CropResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '')
      if (!dataUrl) {
        reject(new Error('No se pudo leer la imagen.'))
        return
      }
      showCropDialog(dataUrl, options, resolve, reject)
    }
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'))
    reader.readAsDataURL(file)
  })
}

function showCropDialog(
  _srcDataUrl: string,
  options: CropOptions,
  resolve: (r: CropResult) => void,
  reject: (e: Error) => void,
): void {
  const overlay = document.createElement('div')
  overlay.className = 'overlay'

  const img = new Image()
  img.onload = () => {
    buildCropUI(overlay, img, options, resolve, reject)
  }
  img.onerror = () => {
    overlay.remove()
    reject(new Error('No se pudo cargar la imagen.'))
  }
  img.src = _srcDataUrl
}

function buildCropUI(
  overlay: HTMLDivElement,
  img: HTMLImageElement,
  options: CropOptions,
  resolve: (r: CropResult) => void,
  reject: (e: Error) => void,
): void {
  const naturalW = img.naturalWidth
  const naturalH = img.naturalHeight
  const aspectRatio = options.aspectRatio

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const MAX_CANVAS = 500
  const scale = Math.min(MAX_CANVAS / naturalW, MAX_CANVAS / naturalH, 1)
  const canvasW = Math.round(naturalW * scale)
  const canvasH = Math.round(naturalH * scale)
  canvas.width = canvasW
  canvas.height = canvasH

  let cropX = 0
  let cropY = 0
  let cropW = canvasW
  let cropH = canvasH

  if (aspectRatio) {
    if (canvasW / canvasH > aspectRatio) {
      cropW = canvasH * aspectRatio
      cropX = (canvasW - cropW) / 2
    } else {
      cropH = canvasW / aspectRatio
      cropY = (canvasH - cropH) / 2
    }
  }

  let zoom = 1
  let panX = 0
  let panY = 0
  let isDragging = false
  let lastX = 0
  let lastY = 0

  function draw() {
    ctx.clearRect(0, 0, canvasW, canvasH)
    ctx.save()
    ctx.translate(canvasW / 2 + panX, canvasH / 2 + panY)
    ctx.scale(zoom, zoom)
    ctx.drawImage(img, -naturalW / 2, -naturalH / 2, naturalW, naturalH)
    ctx.restore()

    // Dim outside crop area
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(0, 0, canvasW, cropY)
    ctx.fillRect(0, cropY, cropX, cropH)
    ctx.fillRect(cropX + cropW, cropY, canvasW - cropX - cropW, cropH)
    ctx.fillRect(0, cropY + cropH, canvasW, canvasH - cropY - cropH)

    // Crop border
    ctx.strokeStyle = '#16a34a'
    ctx.lineWidth = 2
    ctx.strokeRect(cropX, cropY, cropW, cropH)
  }

  draw()

  const slider = document.createElement('input')
  slider.type = 'range'
  slider.min = '0.5'
  slider.max = '3'
  slider.step = '0.05'
  slider.value = String(zoom)
  slider.style.width = '100%'
  slider.addEventListener('input', () => {
    zoom = Number(slider.value)
    draw()
  })

  // Drag to pan
  canvas.addEventListener('mousedown', (e) => {
    isDragging = true
    lastX = e.clientX
    lastY = e.clientY
  })
  canvas.addEventListener('mousemove', (e) => {
    if (!isDragging) return
    panX += e.clientX - lastX
    panY += e.clientY - lastY
    lastX = e.clientX
    lastY = e.clientY
    draw()
  })
  canvas.addEventListener('mouseup', () => { isDragging = false })
  canvas.addEventListener('mouseleave', () => { isDragging = false })

  // Touch support
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      isDragging = true
      lastX = e.touches[0].clientX
      lastY = e.touches[0].clientY
    }
  }, { passive: true })
  canvas.addEventListener('touchmove', (e) => {
    if (!isDragging || e.touches.length !== 1) return
    panX += e.touches[0].clientX - lastX
    panY += e.touches[0].clientY - lastY
    lastX = e.touches[0].clientX
    lastY = e.touches[0].clientY
    draw()
  }, { passive: true })
  canvas.addEventListener('touchend', () => { isDragging = false })

  // Auto-fit button
  const autoFitBtn = document.createElement('button')
  autoFitBtn.type = 'button'
  autoFitBtn.className = 'btn btn-secondary btn-sm'
  autoFitBtn.textContent = 'Ajustar'
  autoFitBtn.addEventListener('click', () => {
    // Auto-crop: find content bounds by analyzing pixels
    const tmpCanvas = document.createElement('canvas')
    tmpCanvas.width = naturalW
    tmpCanvas.height = naturalH
    const tmpCtx = tmpCanvas.getContext('2d')!
    tmpCtx.drawImage(img, 0, 0)
    const imageData = tmpCtx.getImageData(0, 0, naturalW, naturalH)
    const data = imageData.data
    let minX = naturalW, minY = naturalH, maxX = 0, maxY = 0
    let found = false
    for (let y = 0; y < naturalH; y++) {
      for (let x = 0; x < naturalW; x++) {
        const i = (y * naturalW + x) * 4
        const a = data[i + 3]
        if (a > 10) {
          found = true
          if (x < minX) minX = x
          if (y < minY) minY = y
          if (x > maxX) maxX = x
          if (y > maxY) maxY = y
        }
      }
    }
    if (found) {
      // Add small padding
      const pad = Math.max(2, Math.round(Math.min(maxX - minX, maxY - minY) * 0.02))
      minX = Math.max(0, minX - pad)
      minY = Math.max(0, minY - pad)
      maxX = Math.min(naturalW - 1, maxX + pad)
      maxY = Math.min(naturalH - 1, maxY + pad)
      const contentW = maxX - minX + 1
      const contentH = maxY - minY + 1
      // Center the view on the content
      panX = -(minX + contentW / 2 - naturalW / 2) * scale
      panY = -(minY + contentH / 2 - naturalH / 2) * scale
      zoom = Math.min(MAX_CANVAS / contentW, MAX_CANVAS / contentH, 2)
      slider.value = String(zoom)
      draw()
    }
  })

  const confirmBtn = document.createElement('button')
  confirmBtn.type = 'button'
  confirmBtn.className = 'btn btn-primary'
  confirmBtn.textContent = 'Confirmar'
  confirmBtn.addEventListener('click', () => {
    // Export cropped region
    const outCanvas = document.createElement('canvas')
    const outW = Math.round(cropW / scale)
    const outH = Math.round(cropH / scale)
    const maxOut = options.maxWidth ?? 800
    const outScale = Math.min(maxOut / outW, 1)
    outCanvas.width = Math.round(outW * outScale)
    outCanvas.height = Math.round(outH * outScale)
    const outCtx = outCanvas.getContext('2d')!
    const srcCropX = (cropX / scale) + (naturalW / 2 - canvasW / (2 * scale)) - panX / scale
    const srcCropY = (cropY / scale) + (naturalH / 2 - canvasH / (2 * scale)) - panY / scale
    outCtx.drawImage(
      img,
      srcCropX, srcCropY, outW, outH,
      0, 0, outCanvas.width, outCanvas.height,
    )
    const result = outCanvas.toDataURL('image/jpeg', 0.85)
    overlay.remove()
    resolve({ dataUrl: result, width: outCanvas.width, height: outCanvas.height })
  })

  const cancelBtn = document.createElement('button')
  cancelBtn.type = 'button'
  cancelBtn.className = 'btn btn-secondary'
  cancelBtn.textContent = 'Cancelar'
  cancelBtn.addEventListener('click', () => {
    overlay.remove()
    reject(new Error('Edición cancelada.'))
  })

  const dialog = document.createElement('div')
  dialog.className = 'dialog'
  dialog.style.maxWidth = '540px'
  dialog.innerHTML = '<p style="margin:0 0 8px;font-weight:600">Recortar imagen</p>'
  dialog.appendChild(canvas)
  dialog.appendChild(slider)

  const hint = document.createElement('p')
  hint.className = 'hint'
  hint.style.margin = '4px 0 8px'
  hint.textContent = 'Arrastra para mover, usa la barra para zoom.'
  dialog.appendChild(hint)

  const actions = document.createElement('div')
  actions.className = 'dialog-actions'
  actions.appendChild(autoFitBtn)
  actions.appendChild(cancelBtn)
  actions.appendChild(confirmBtn)
  dialog.appendChild(actions)

  overlay.appendChild(dialog)
  document.body.appendChild(overlay)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove()
      reject(new Error('Edición cancelada.'))
    }
  })
}
