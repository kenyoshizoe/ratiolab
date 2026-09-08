export const isCropMode = (settings) => settings.fit === 'crop' && settings.ratio !== 'original'
const clamp = (value) => Math.min(1, Math.max(0, value))

export function photoPlacement(image, settings, output, footerHeight = 0) {
  const cropped = isCropMode(settings)
  const width = cropped ? Math.min(image.naturalWidth, output.width) : image.naturalWidth
  const height = cropped ? Math.min(image.naturalHeight, output.height - footerHeight) : image.naturalHeight
  const zoom = cropped ? Math.min(4, Math.max(1, settings.cropZoom ?? 1)) : 1
  const sourceWidth = width / zoom
  const sourceHeight = height / zoom
  const maxX = image.naturalWidth - sourceWidth
  const maxY = image.naturalHeight - sourceHeight
  const pixel = (value) => zoom === 1 ? Math.round(value) : value
  return {
    width, height, sourceWidth, sourceHeight, zoom, maxX, maxY,
    sourceX: cropped ? pixel(maxX * clamp(settings.cropX ?? .5)) : 0,
    sourceY: cropped ? pixel(maxY * clamp(settings.cropY ?? .5)) : 0,
    x: Math.floor((output.width - width) / 2),
    y: Math.floor((output.height - footerHeight - height) / 2),
  }
}

// Dragging the photo to the right reveals pixels further to the left.
export function dragCrop(start, deltaX, deltaY) {
  return {
    cropX: start.maxX ? clamp((start.sourceX - deltaX / (start.zoom ?? 1)) / start.maxX) : .5,
    cropY: start.maxY ? clamp((start.sourceY - deltaY / (start.zoom ?? 1)) / start.maxY) : .5,
  }
}

export function zoomCrop(image, settings, output, footerHeight, nextZoom, anchorX, anchorY) {
  const before = photoPlacement(image, settings, output, footerHeight)
  const cropZoom = Math.min(4, Math.max(1, nextZoom))
  const after = photoPlacement(image, { ...settings, cropZoom }, output, footerHeight)
  const u = clamp((anchorX - before.x) / before.width)
  const v = clamp((anchorY - before.y) / before.height)
  return {
    cropZoom,
    cropX: after.maxX ? clamp((before.sourceX + u * before.sourceWidth - u * after.sourceWidth) / after.maxX) : .5,
    cropY: after.maxY ? clamp((before.sourceY + v * before.sourceHeight - v * after.sourceHeight) / after.maxY) : .5,
  }
}
// Resize a source rectangle around its opposite corner, keeping its aspect ratio.
export function resizeCrop(image, start, corner, deltaX, deltaY) {
  const right = corner.endsWith('e')
  const bottom = corner.startsWith('s')
  const anchorX = start.sourceX + (right ? 0 : start.sourceWidth)
  const anchorY = start.sourceY + (bottom ? 0 : start.sourceHeight)
  const dx = deltaX / start.zoom * (right ? 1 : -1)
  const dy = deltaY / start.zoom * (bottom ? 1 : -1)
  const requested = 1 + (dx * start.sourceWidth + dy * start.sourceHeight) / (start.sourceWidth ** 2 + start.sourceHeight ** 2)
  const maxWidth = right ? image.naturalWidth - anchorX : anchorX
  const maxHeight = bottom ? image.naturalHeight - anchorY : anchorY
  const maximum = Math.min(start.zoom, maxWidth / start.sourceWidth, maxHeight / start.sourceHeight)
  const factor = Math.max(start.zoom / 4, Math.min(maximum, requested))
  const width = start.sourceWidth * factor
  const height = start.sourceHeight * factor
  const x = right ? anchorX : anchorX - width
  const y = bottom ? anchorY : anchorY - height
  return {
    cropZoom: start.zoom / factor,
    cropX: image.naturalWidth > width ? clamp(x / (image.naturalWidth - width)) : .5,
    cropY: image.naturalHeight > height ? clamp(y / (image.naturalHeight - height)) : .5,
  }
}
