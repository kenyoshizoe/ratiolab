import { zip } from 'fflate'
import { isCropMode, photoPlacement, dragCrop, resizeCrop } from './crop'
import { exifFields, defaultExifVisibility, readExif, getExifLayout, compositionSize, drawExif } from './exif'
import { loadMakerLogo } from './makerLogos'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownToLine,
  Check,
  ImagePlus,
  Layers3,
  Maximize2,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  X,
  Move,
} from 'lucide-react'

const ratios = [
  { id: 'original', name: 'Original', label: '', width: 1, height: 1 },
  { id: '4:5', label: 'Feed', width: 1080, height: 1350 },
  { id: '3:4', label: 'Tall', width: 1080, height: 1440 },
  { id: '1:1', label: 'Square', width: 1080, height: 1080 },
  { id: '9:16', label: 'Story', width: 1080, height: 1920 },
  { id: '16:9', label: 'Vlog', width: 1920, height: 1080 },
]

const backgrounds = [
  { id: 'blur', label: 'Blur', value: '#18181b' },
  { id: 'cream', label: 'Cream', value: '#efe9dc' },
  { id: 'ink', label: 'Ink', value: '#121216' },
  { id: 'sky', label: 'Sky', value: ['#b8dbff', '#f2d9ef'] },
  { id: 'sunset', label: 'Glow', value: ['#ffb36a', '#9b6cff'] },
]

function drawCover(ctx, image, x, y, width, height) {
  const scale = Math.max(width / image.width, height / image.height)
  const w = image.width * scale
  const h = image.height * scale
  ctx.drawImage(image, x + (width - w) / 2, y + (height - h) / 2, w, h)
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, r)
  ctx.closePath()
}

const EMPTY_METADATA = {}

const defaultSettings = {
  ratio: '4:5', fit: 'pad', cropX: .5, cropY: .5, cropZoom: 1, background: 'blur', padding: 0, blur: 46, radius: 0, shadow: 32, exifEnabled: true, exifStyle: 'gradient',
}

function renderComposition(canvas, image, settings, metadata, visibility, logo) {
  if (!canvas || !image) return
  const layout = getExifLayout(image, metadata, visibility, Boolean(logo), settings)
  const { width: outputWidth, height: outputHeight } = compositionSize(image, settings, layout.footerHeight)
  canvas.width = outputWidth
  canvas.height = outputHeight
  const ctx = canvas.getContext('2d')
  const selected = backgrounds.find((bg) => bg.id === settings.background) ?? backgrounds[0]

  ctx.clearRect(0, 0, outputWidth, outputHeight)

  if (selected.id === 'blur') {
    ctx.save()
    ctx.filter = `blur(${settings.blur}px) brightness(.72) saturate(1.15)`
    const overscan = settings.blur * 2.2
    drawCover(ctx, image, -overscan, -overscan, outputWidth + overscan * 2, outputHeight + overscan * 2)
    ctx.restore()
    ctx.fillStyle = 'rgba(8, 8, 12, .12)'
    ctx.fillRect(0, 0, outputWidth, outputHeight)
  } else if (Array.isArray(selected.value)) {
    const gradient = ctx.createLinearGradient(0, 0, outputWidth, outputHeight)
    gradient.addColorStop(0, selected.value[0])
    gradient.addColorStop(1, selected.value[1])
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, outputWidth, outputHeight)
  } else {
    ctx.fillStyle = selected.value
    ctx.fillRect(0, 0, outputWidth, outputHeight)
  }

  const placement = photoPlacement(image, settings, { width: outputWidth, height: outputHeight }, layout.footerHeight)
  const { width: drawW, height: drawH, x, y, sourceX, sourceY, sourceWidth, sourceHeight, zoom } = placement

  ctx.save()
  if (settings.shadow > 0) {
    ctx.shadowColor = 'rgba(0, 0, 0, .45)'
    ctx.shadowBlur = settings.shadow
    ctx.shadowOffsetY = settings.shadow * 0.28
  }
  if (settings.radius > 0) {
    roundedRect(ctx, x, y, drawW, drawH, settings.radius)
    ctx.clip()
  }
  ctx.imageSmoothingEnabled = zoom !== 1
  ctx.imageSmoothingQuality = 'high'
  // At 1x the crop is copied pixel-for-pixel; zoom resamples to the same output size.
  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, drawW, drawH)
  ctx.restore()
  if (layout.boxed || layout.outside) {
    drawExif(ctx, outputWidth, outputHeight, layout, logo)
  } else {
    ctx.save()
    ctx.translate(x, y)
    // The overlay belongs to the original photo, including with a wide canvas.
    roundedRect(ctx, 0, 0, drawW, drawH, settings.radius)
    ctx.clip()
    drawExif(ctx, drawW, drawH, layout, logo)
    ctx.restore()
  }
}

const Range = ({ label, value, min, max, step = 1, suffix = '', onChange }) => (
  <label className="range-control">
    <span><span>{label}</span><output>{value}{suffix}</output></span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
  </label>
)

function App() {
  const [theme, setTheme] = useState(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  )
  useEffect(() => {
    const preference = window.matchMedia('(prefers-color-scheme: dark)')
    const syncTheme = () => setTheme(preference.matches ? 'dark' : 'light')
    syncTheme()
    preference.addEventListener('change', syncTheme)
    return () => preference.removeEventListener('change', syncTheme)
  }, [])
  const [photos, setPhotos] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [cropPositions, setCropPositions] = useState({})
  const activePhoto = photos.find((photo) => photo.id === selectedId) ?? photos[0]
  const image = activePhoto?.image ?? null
  const metadata = activePhoto?.metadata ?? EMPTY_METADATA
  const makerLogo = activePhoto?.logo ?? null
  const [isDragging, setIsDragging] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState('')
  const [baseSettings, setSettings] = useState(defaultSettings)
  const activeCrop = cropPositions[activePhoto?.id]
  const settings = useMemo(() => ({ ...baseSettings, ...(activeCrop ?? { cropX: .5, cropY: .5 }) }), [baseSettings, activeCrop])
  const [exifVisibility, setExifVisibility] = useState(defaultExifVisibility)
  const [loadStatus, setLoadStatus] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const loadSequence = useRef(0)
  const loadingRef = useRef(false)
  const exportingRef = useRef(false)
  const imageUrls = useRef(new Set())
  const canvasRef = useRef(null)
  const fileRef = useRef(null)
  const cropDrag = useRef(null)
  const [isCropDragging, setIsCropDragging] = useState(false)
  const [viewMode, setViewMode] = useState('preview')
  const cropSurfaceRef = useRef(null)

  const updateSetting = (key, value) => {
    setSettings((current) => ({ ...current, [key]: value }))
    if (key === 'ratio') setCropPositions({})
    if (key === 'fit') setViewMode(value === 'crop' && baseSettings.ratio !== 'original' ? 'crop' : 'preview')
    if (key === 'ratio' && value === 'original') setViewMode('preview')
  }
  const setCropPosition = (position) => {
    if (activePhoto) setCropPositions((current) => ({ ...current, [activePhoto.id]: { ...current[activePhoto.id], ...position } }))
  }
  const selectPhoto = (id) => {
    cropDrag.current = null
    setIsCropDragging(false)
    setSelectedId(id)
  }
  const removePhoto = (id) => {
    const photo = photos.find((item) => item.id === id)
    if (!photo || isExporting || isLoading) return
    URL.revokeObjectURL(photo.url)
    imageUrls.current.delete(photo.url)
    setPhotos((current) => current.filter((item) => item.id !== id))
    setCropPositions((current) => { const next = { ...current }; delete next[id]; return next })
  }

  const loadFiles = useCallback(async (fileList) => {
    if (loadingRef.current || exportingRef.current) return
    const files = Array.from(fileList ?? [])
    if (!files.length) return
    loadingRef.current = true
    const sequence = ++loadSequence.current
    setIsLoading(true)
    const added = []
    const failures = []
    try {
      for (const [index, file] of files.entries()) {
        if (sequence !== loadSequence.current) break
        setLoadStatus(`Loading ${index + 1} / ${files.length}`)
        if (!file.type.startsWith('image/')) { failures.push(file.name); continue }
        const url = URL.createObjectURL(file)
        imageUrls.current.add(url)
        const nextImage = new Image()
        nextImage.src = url
        try {
          const [parsed] = await Promise.all([
            readExif(file).then((value) => ({ value, failed: false })).catch(() => ({ value: {}, failed: true })),
            nextImage.decode(),
          ])
          const logo = await loadMakerLogo(parsed.value.maker)
          if (sequence !== loadSequence.current) { URL.revokeObjectURL(url); imageUrls.current.delete(url); break }
          added.push({ id: crypto.randomUUID(), image: nextImage, url, name: file.name, metadata: parsed.value, logo,
            note: parsed.failed ? 'Could not read EXIF. You can still edit this image.' : Object.values(parsed.value).some(Boolean) ? '' : 'No EXIF data found.' })
        } catch {
          URL.revokeObjectURL(url)
          imageUrls.current.delete(url)
          failures.push(file.name)
        }
      }
      if (sequence === loadSequence.current) {
        setPhotos((current) => [...current, ...added])
        if (added.length) setSelectedId(added[0].id)
        setLoadStatus(failures.length ? `Could not load: ${failures.join(', ')}` : '')
      }
    } finally {
      if (sequence === loadSequence.current) { setIsLoading(false); loadingRef.current = false }
    }
  }, [])

  useEffect(() => () => {
    loadSequence.current += 1
    for (const url of imageUrls.current) URL.revokeObjectURL(url)
    imageUrls.current.clear()
  }, [])

  useEffect(() => {
    const frame = requestAnimationFrame(() => renderComposition(canvasRef.current, image, settings, metadata, exifVisibility, makerLogo))
    return () => cancelAnimationFrame(frame)
  }, [image, settings, metadata, exifVisibility, makerLogo])

  const selectedRatio = ratios.find((item) => item.id === settings.ratio) ?? ratios[0]

  const outputSize = image ? compositionSize(image, settings, getExifLayout(image, metadata, exifVisibility, Boolean(makerLogo), settings).footerHeight) : null
  const cropMode = isCropMode(settings)
  const footerHeight = image ? getExifLayout(image, metadata, exifVisibility, Boolean(makerLogo), settings).footerHeight : 0
  const placement = image ? photoPlacement(image, settings, outputSize, footerHeight) : null
  const canDragCrop = viewMode === 'crop' && cropMode && !isExporting && !isLoading && Boolean(placement)

  const beginCropEdit = (event, corner = null) => {
    if (!canDragCrop || event.button !== 0 || cropDrag.current) return
    event.preventDefault()
    event.stopPropagation()
    const bounds = cropSurfaceRef.current.getBoundingClientRect()
    event.currentTarget.setPointerCapture(event.pointerId)
    cropDrag.current = { ...placement, corner, pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY,
      scaleX: image.naturalWidth / bounds.width, scaleY: image.naturalHeight / bounds.height }
    setIsCropDragging(true)
  }
  const moveCropDrag = (event) => {
    const start = cropDrag.current
    if (!start || start.pointerId !== event.pointerId) return
    const dx = (event.clientX - start.clientX) * start.scaleX
    const dy = (event.clientY - start.clientY) * start.scaleY
    const position = start.corner
      ? resizeCrop(image, start, start.corner, dx * start.zoom, dy * start.zoom)
      : dragCrop(start, -dx * start.zoom, -dy * start.zoom)
    setCropPosition(position)
  }
  const endCropDrag = (event) => {
    if (cropDrag.current?.pointerId !== event.pointerId) return
    cropDrag.current = null
    setIsCropDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const moveCropByKey = (event) => {
    if (!canDragCrop) return
    if (event.key === 'Home') { event.preventDefault(); setCropPosition({ cropX: .5, cropY: .5 }); return }
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]
    if (!delta) return
    event.preventDefault()
    const step = event.shiftKey ? 10 : 1
    const position = dragCrop(placement, -delta[0] * step * placement.zoom, -delta[1] * step * placement.zoom)
    setCropPosition(position)
  }

  const cropFrameStyle = placement && image ? {
    left: `${100 * placement.sourceX / image.naturalWidth}%`,
    top: `${100 * placement.sourceY / image.naturalHeight}%`,
    width: `${100 * placement.sourceWidth / image.naturalWidth}%`,
    height: `${100 * placement.sourceHeight / image.naturalHeight}%`,
  } : undefined

  const previewWidth = outputSize?.width ?? selectedRatio.width
  const previewHeight = outputSize?.height ?? selectedRatio.height
  const reset = () => { setViewMode('preview'); setCropPositions({}); setSettings({ ...defaultSettings }); setExifVisibility({ ...defaultExifVisibility }) }

  const download = async () => {
    if (!photos.length || loadingRef.current || exportingRef.current) return
    exportingRef.current = true
    setIsExporting(true)
    setLoadStatus('')
    const canvas = document.createElement('canvas')
    try {
      const entries = Object.create(null)
      let singleBlob
      let singleName
      const usedNames = new Set()
      for (const [index, photo] of photos.entries()) {
        setExportProgress(`${index + 1} / ${photos.length}`)
        // Yield so progress paints before the next full-resolution render.
        await new Promise((resolve) => setTimeout(resolve, 0))
        const photoSettings = { ...baseSettings, ...(cropPositions[photo.id] ?? { cropX: .5, cropY: .5 }) }
        renderComposition(canvas, photo.image, photoSettings, photo.metadata, exifVisibility, photo.logo)
        const blob = await new Promise((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error(`Could not export ${photo.name}`)), 'image/png'))
        const stem = (photo.name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_') || 'ratiolab') + '-' + baseSettings.ratio.replace(':', 'x')
        let name = `${stem}.png`
        let suffix = 2
        while (usedNames.has(name.toLowerCase())) name = `${stem}-${suffix++}.png`
        usedNames.add(name.toLowerCase())
        if (photos.length === 1) { singleBlob = blob; singleName = name }
        else entries[name] = new Uint8Array(await blob.arrayBuffer())
      }
      canvas.width = canvas.height = 1
      let blob = singleBlob
      let name = singleName
      if (photos.length > 1) {
        setExportProgress('Creating ZIP…')
        const archive = await new Promise((resolve, reject) => zip(entries, { level: 0 }, (error, result) => error ? reject(error) : resolve(result)))
        blob = new Blob([archive], { type: 'application/zip' })
        name = `ratiolab-${photos.length}-images.zip`
      }
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.download = name
      link.href = url
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (error) {
      setLoadStatus(`Export failed. ${error.message || 'Try again with fewer images.'}`)
    } finally {
      canvas.width = canvas.height = 1
      setIsExporting(false)
      exportingRef.current = false
      setExportProgress('')
    }
  }

  return (
    <div className="app-shell" data-theme={theme}>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="RatioLab home">
          <img className="brand-icon" src="/favicon.svg" alt="" width="28" height="28" />
          <span>Ratio<span>Lab</span></span>
        </a>
      </header>
      <main id="top">
        <section className="studio" aria-label="Image editor">
          <div className="preview-panel">
            <div className="panel-heading preview-tab-heading">
              <div className="preview-tab-group">
                <div className="preview-modes" role="tablist" aria-label="Editor view" onKeyDown={(event) => {
                  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
                  event.preventDefault()
                  const tabs = Array.from(event.currentTarget.querySelectorAll('[role="tab"]:not(:disabled)'))
                  const index = tabs.indexOf(document.activeElement)
                  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
                  tabs[next]?.focus()
                  tabs[next]?.click()
                }}>
                  <button id="preview-tab" role="tab" aria-controls="editor-view" aria-selected={!canDragCrop} tabIndex={!canDragCrop ? 0 : -1} onClick={() => setViewMode('preview')}>Preview</button>
                  <button id="crop-tab" role="tab" aria-controls="editor-view" aria-selected={canDragCrop} tabIndex={canDragCrop ? 0 : -1} disabled={!image || !cropMode || isLoading || isExporting} onClick={() => setViewMode('crop')}>Crop</button>
                </div>
              </div>
              {image && <button className="text-button" disabled={isLoading || isExporting} onClick={() => fileRef.current?.click()}><ImagePlus size={14} /> Add images</button>}
            </div>

            <div id="editor-view" role="tabpanel" aria-labelledby={canDragCrop ? 'crop-tab' : 'preview-tab'}
              className={`canvas-stage ${isDragging ? 'is-dragging' : ''} ${image ? 'has-image' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); loadFiles(e.dataTransfer.files) }}
            >
              <div className="canvas-wrap" hidden={canDragCrop} style={{ aspectRatio: `${previewWidth}/${previewHeight}`, '--preview-ratio': previewWidth / previewHeight }}>
                <canvas ref={canvasRef} aria-label={`${settings.ratio} image preview`} />
                {!image && <button className="drop-zone" onClick={() => fileRef.current?.click()}>
                  <span className="upload-icon"><ImagePlus size={30} strokeWidth={1.6} /></span>
                  <strong>Drop images here</strong><span>or click to browse</span>
                </button>}
              </div>
              {canDragCrop && <>
                <div ref={cropSurfaceRef} className="canvas-wrap crop-editor" style={{ aspectRatio: `${image.naturalWidth}/${image.naturalHeight}`, '--preview-ratio': image.naturalWidth / image.naturalHeight }}>
                  <img className="crop-original" src={activePhoto.url} alt="Original image" draggable="false" />
                  <div className={`crop-frame crop-edit-frame ${isCropDragging ? 'is-editing' : ''}`} style={cropFrameStyle}
                    role="group" aria-label="Crop selection. Drag to move, use corners to resize, or use arrow keys." tabIndex={0}
                    onPointerDown={(event) => beginCropEdit(event)} onPointerMove={moveCropDrag} onPointerUp={endCropDrag} onPointerCancel={endCropDrag} onLostPointerCapture={endCropDrag} onKeyDown={moveCropByKey}>
                    <div className="crop-source-window" aria-hidden="true"><img src={activePhoto.url} alt="" draggable="false" style={{
                      width: `${100 * image.naturalWidth / placement.sourceWidth}%`, height: `${100 * image.naturalHeight / placement.sourceHeight}%`,
                      left: `${-100 * placement.sourceX / placement.sourceWidth}%`, top: `${-100 * placement.sourceY / placement.sourceHeight}%`,
                    }} /></div>
                    <div className="crop-guides" aria-hidden="true" />
                    {['nw', 'ne', 'sw', 'se'].map((corner) => <button key={corner} className={`crop-handle ${corner}`}
                      aria-label={`Resize crop from ${ { nw: 'top left', ne: 'top right', sw: 'bottom left', se: 'bottom right' }[corner]}`}
                      onPointerDown={(event) => beginCropEdit(event, corner)} onPointerMove={moveCropDrag}
                      onPointerUp={endCropDrag} onPointerCancel={endCropDrag} onLostPointerCapture={endCropDrag}
                      onKeyDown={(event) => {
                        event.stopPropagation()
                        const direction = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key]
                        if (!direction) return
                        event.preventDefault()
                        const delta = direction * (event.shiftKey ? 10 : 1) * placement.zoom
                        setCropPosition(resizeCrop(image, placement, corner, event.key.includes('Left') || event.key.includes('Right') ? delta : 0, event.key.includes('Up') || event.key.includes('Down') ? delta : 0))
                      }} />)}
                  </div>
                </div>
                <span className={`preview-drag-hint ${isCropDragging ? 'is-moving' : ''}`}><Move size={14} aria-hidden="true" />Drag selection · Resize corners</span>
                <div className="crop-editor-actions">
                  <button className="crop-reset-icon" aria-label="Reset crop" title="Reset crop" onClick={() => setCropPosition({ cropZoom: 1, cropX: .5, cropY: .5 })}><RefreshCw size={18} aria-hidden="true" /></button>
                </div>
              </>}
              <input ref={fileRef} type="file" multiple disabled={isLoading || isExporting} accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { loadFiles(e.target.files); e.target.value = '' }} />
            </div>
            {photos.length > 0 && <div className="photo-strip" aria-label="Loaded images">
              {photos.map((photo) => <div className={`photo-item ${activePhoto?.id === photo.id ? 'active' : ''}`} key={photo.id}>
                <button className="photo-select" aria-label={`Preview ${photo.name}`} aria-pressed={activePhoto?.id === photo.id} onClick={() => selectPhoto(photo.id)}>
                  <img src={photo.url} alt="" /><span title={photo.name}>{photo.name}</span>
                </button>
                <button className="photo-remove" aria-label={`Remove ${photo.name}`} disabled={isLoading || isExporting} onClick={() => removePhoto(photo.id)}><X size={12} /></button>
              </div>)}
            </div>}
            <div className="preview-meta"><span><Maximize2 size={13} /> {selectedRatio.name ?? settings.ratio} {selectedRatio.label}</span><span>{outputSize ? `${outputSize.width} × ${outputSize.height} px · PNG` : 'Output follows image size'}</span></div>
          </div>

          <aside className="controls-panel">
            <div className="panel-heading">
              <div><h2>Settings {photos.length > 1 && <span className="image-count">All images</span>}</h2></div>
              <button className="icon-button" onClick={reset} title="Reset settings"><RefreshCw size={16} /></button>
            </div>

            <div className="control-section">
              <div className="control-title"><Maximize2 size={15} /><span>Aspect ratio</span></div>
              <div className="ratio-grid">
                {ratios.map((ratio) => (
                  <button
                    key={ratio.id}
                    className={settings.ratio === ratio.id ? 'active' : ''}
                    onClick={() => updateSetting('ratio', ratio.id)}
                    aria-pressed={settings.ratio === ratio.id}
                  >
                    <i style={{ aspectRatio: `${ratio.width}/${ratio.height}` }} />
                    <span><strong>{ratio.name ?? ratio.id}</strong></span>
                  </button>
                ))}
              </div>
              <div className="fit-options" role="group" aria-label="Resize mode">
                <button aria-pressed={!cropMode} onClick={() => updateSetting('fit', 'pad')}>Fit</button>
                <button aria-pressed={cropMode} disabled={settings.ratio === 'original'} onClick={() => updateSetting('fit', 'crop')}>Crop</button>
              </div>
            </div>

            <div className="control-section">
              <div className="control-title"><Layers3 size={15} /><span>Background</span></div>
              <div className="background-grid">
                {backgrounds.map((bg) => (
                  <button
                    key={bg.id}
                    aria-pressed={settings.background === bg.id}
                    className={`background-chip ${settings.background === bg.id ? 'active' : ''}`}
                    onClick={() => updateSetting('background', bg.id)}
                  >
                    <span style={bg.id === 'blur' ? { background: 'linear-gradient(135deg,#9f7aea,#191922)' } : Array.isArray(bg.value) ? { background: `linear-gradient(135deg, ${bg.value.join(',')})` } : { background: bg.value }}>
                      {bg.id === 'blur' && <Sparkles size={13} />}
                      {settings.background === bg.id && <i><Check size={11} /></i>}
                    </span>
                    <small>{bg.label}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="control-section exif-section">
              <label className="exif-toggle exif-heading">
                <span>EXIF</span>
                <input type="checkbox" role="switch" aria-label="Show EXIF" checked={settings.exifEnabled} onChange={(event) => updateSetting('exifEnabled', event.target.checked)} />
              </label>
              <label className="exif-style">
                <span>Display style</span>
                <select aria-label="EXIF display style" value={settings.exifStyle} onChange={(event) => updateSetting('exifStyle', event.target.value)}>
                  <option value="text">Text inside photo</option>
                  <option value="text-outside">Text outside photo</option>
                  <option value="gradient">Bottom gradient</option>
                  <option value="box">White strip</option>
                </select>
              </label>
              <details className="advanced exif-details"><summary>Advanced</summary>
              {exifFields.map(({ id, label }) => (
                <label className="exif-toggle" key={id}>
                  <span><span>{label}</span><small title={metadata[id] || ''}>{metadata[id] || (image ? 'Not recorded' : 'Select an image')}{id === 'maker' && metadata.maker && !makerLogo ? ' (shown as text)' : ''}</small></span>
                  <input type="checkbox" role="switch" aria-label={label} checked={exifVisibility[id]} disabled={!metadata[id] || isLoading} onChange={(event) => setExifVisibility((current) => ({ ...current, [id]: event.target.checked }))} />
                </label>
              ))}
              </details>
              {activePhoto?.note && <p className="exif-status">{activePhoto.note}</p>}
            </div>

            <div className="control-section ranges">
              <div className="control-title"><SlidersHorizontal size={15} /><span>Adjustments</span></div>
              {!cropMode && <Range label="Padding" value={settings.padding} min={0} max={200} suffix=" px" onChange={(v) => updateSetting('padding', v)} />}
              {settings.background === 'blur' && <Range label="Blur" value={settings.blur} min={8} max={80} suffix=" px" onChange={(v) => updateSetting('blur', v)} />}
              <details className="advanced"><summary>Advanced</summary>
              <Range label="Corners" value={settings.radius} min={0} max={80} suffix=" px" onChange={(v) => updateSetting('radius', v)} />
              <Range label="Shadow" value={settings.shadow} min={0} max={70} suffix="%" onChange={(v) => updateSetting('shadow', v)} />
              </details>
            </div>

            <button className="download-button" onClick={download} disabled={!image || isExporting || isLoading}>
              {isExporting ? <RefreshCw className="spin" size={18} /> : <ArrowDownToLine size={18} />}
              {isExporting ? exportProgress : 'DOWNLOAD'}
            </button>
            {photos.length > 1 && <p className="batch-note">Save all {photos.length} images as ZIP</p>}
            {loadStatus && <p className="exif-status" role="status">{loadStatus}</p>}
          </aside>
        </section>
      </main>
    </div>
  )
}

export default App
