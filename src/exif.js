import { formatLens } from './lens.js'
import { isCropMode } from './crop.js'
import exifr from 'exifr'

export const exifFields = [
  { id: 'maker', label: 'Camera brand logo' },
  { id: 'camera', label: 'Camera' },
  { id: 'lens', label: 'Lens' },
  { id: 'shooting', label: 'Shooting settings' },
]
export const defaultExifVisibility = { maker: true, camera: true, lens: true, shooting: true }
const clean = (value) => typeof value === 'string' ? value.replace(/[\x00-\x1f]/g, '').trim() : ''
const positive = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0
const decimal = (value) => Number(value.toFixed(2)).toString()

export function formatExif(tags = {}) {
  const shooting = []
  if (positive(tags.FocalLength)) shooting.push(`${decimal(tags.FocalLength)}mm`)
  if (positive(tags.FNumber)) shooting.push(`f/${decimal(tags.FNumber)}`)
  if (positive(tags.ExposureTime)) {
    const seconds = tags.ExposureTime
    shooting.push(seconds < 1 ? `1/${decimal(1 / seconds)}s` : `${decimal(seconds)}s`)
  }
  if (positive(tags.ISO)) shooting.push(`ISO ${tags.ISO}`)
  const lensMake = clean(tags.LensMake)
  const lensModel = clean(tags.LensModel)
  const lens = formatLens(lensMake, lensModel)
  return { maker: clean(tags.Make), camera: clean(tags.Model), lens, shooting: shooting.join('  ·  ') }
}

export async function readExif(file) {
  const tags = await exifr.parse(file, { pick: ['Make', 'Model', 'LensMake', 'LensModel', 'FocalLength', 'FNumber', 'ExposureTime', 'ISO'], gps: false })
  return formatExif(tags)
}

export function getExifLayout(image, metadata, visibility, hasLogo = false, options = {}) {
  const enabled = options.exifEnabled !== false
  const style = options.exifStyle ?? 'gradient'
  const boxed = style === 'box'
  const outside = style === 'text-outside'
  const darkText = outside && ['white', 'cream', 'sky'].includes(options.background)
  const lines = []
  const showMaker = Boolean(enabled && visibility.maker && metadata.maker)
  if (showMaker && !hasLogo) lines.push(metadata.maker)
  for (const id of ['camera', 'lens', 'shooting']) {
    if (enabled && visibility[id] && metadata[id]) lines.push(metadata[id])
  }
  const fontSize = Math.max(1, Math.round(Math.min(image.naturalWidth, image.naturalHeight) / 48))
  const logoSize = showMaker && hasLogo ? fontSize * 5 : 0
  const lineHeight = Math.ceil(fontSize * 1.6)
  const inset = fontSize * 1.5
  const height = lines.length || logoSize ? Math.ceil(Math.max(lines.length * lineHeight, logoSize) + inset * 2) : 0
  return { lines, fontSize, logoSize, lineHeight, inset, height, boxed, outside, darkText, style, footerHeight: boxed || outside ? height : 0 }
}

export function compositionSize(image, settings, footerHeight = 0) {
  if (settings.ratio === 'original') {
    // Append the EXIF strip without expanding the canvas to the photo's ratio.
    if (footerHeight > 0 && settings.exifStyle === 'box') {
      return {
        width: image.naturalWidth + settings.padding * 2,
        height: image.naturalHeight + settings.padding * 2 + footerHeight,
      }
    }
    const scale = Math.max(
      (image.naturalWidth + settings.padding * 2) / image.naturalWidth,
      (image.naturalHeight + settings.padding * 2 + footerHeight) / image.naturalHeight,
    )
    // Round the added canvas to whole pixels without multiplying odd-sized
    // originals up to the next exact integer ratio unit. The photo stays 1:1.
    return { width: Math.ceil(image.naturalWidth * scale), height: Math.ceil(image.naturalHeight * scale) }
  }
  const [w, h] = settings.ratio.split(':').map(Number)
  if (isCropMode(settings)) {
    // Use the largest integer-ratio canvas whose photo area fits at 1:1.
    // The EXIF footer is included in the requested final output ratio.
    const unit = Math.floor(Math.min(image.naturalWidth / w, (image.naturalHeight + footerHeight) / h))
    if (unit >= 1 && h * unit > footerHeight) return { width: w * unit, height: h * unit }
    // Very small images cannot always represent the exact ratio in whole pixels.
    const width = Math.max(1, Math.min(image.naturalWidth, Math.floor((image.naturalHeight + footerHeight) * w / h)))
    return { width, height: Math.max(footerHeight + 1, Math.min(image.naturalHeight + footerHeight, Math.round(width * h / w))) }
  }
  const unit = Math.ceil(Math.max((image.naturalWidth + settings.padding * 2) / w, (image.naturalHeight + settings.padding * 2 + footerHeight) / h))
  return { width: w * unit, height: h * unit }
}

export function drawExif(ctx, width, height, layout, logo) {
  if (!layout.height) return
  const { fontSize, lineHeight, inset, logoSize, lines } = layout
  const top = height - layout.height
  ctx.save()
  const boxed = layout.boxed !== false
  const darkText = boxed || layout.darkText
  if (boxed) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, top, width, layout.height)
  } else {
    if (layout.style === 'gradient') {
      const gradientTop = Math.max(0, height - layout.height * 1.6)
      const gradient = ctx.createLinearGradient(0, gradientTop, 0, height)
      gradient.addColorStop(0, 'rgba(0, 0, 0, 0)')
      gradient.addColorStop(.5, 'rgba(0, 0, 0, .32)')
      gradient.addColorStop(1, 'rgba(0, 0, 0, .76)')
      ctx.fillStyle = gradient
      ctx.fillRect(0, gradientTop, width, height - gradientTop)
    }
    ctx.shadowColor = darkText ? 'rgba(255, 255, 255, .4)' : 'rgba(0, 0, 0, .65)'
    ctx.shadowBlur = Math.max(1, fontSize * .18)
    ctx.shadowOffsetY = Math.max(1, fontSize * .05)
  }
  if (logoSize && logo) {
    const scale = Math.min(logoSize / logo.naturalWidth, logoSize / logo.naturalHeight)
    const w = logo.naturalWidth * scale
    const h = logo.naturalHeight * scale
    ctx.save()
    if (!boxed) ctx.filter = darkText ? 'brightness(0)' : 'brightness(0) invert(1)'
    ctx.drawImage(logo, inset + (logoSize - w) / 2, top + (layout.height - h) / 2, w, h)
    ctx.restore()
  }
  const left = inset + (logoSize ? logoSize + inset : 0)
  const maxWidth = Math.max(1, width - left - inset)
  ctx.fillStyle = darkText ? '#25282c' : '#ffffff'
  ctx.textBaseline = 'middle'
  lines.forEach((line, index) => {
    let size = fontSize
    ctx.font = `${index === 0 ? 600 : 400} ${size}px Arial, sans-serif`
    const measured = ctx.measureText(line).width
    if (measured > maxWidth) {
      size *= maxWidth / measured
      ctx.font = `${index === 0 ? 600 : 400} ${size}px Arial, sans-serif`
    }
    ctx.fillText(line, left, top + (layout.height - lines.length * lineHeight) / 2 + (index + .5) * lineHeight)
  })
  ctx.restore()
}

