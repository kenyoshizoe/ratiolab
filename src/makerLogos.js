import sonyUrl from './assets/sony.svg?url'
import canonUrl from './assets/canon.svg?url'
import nikonUrl from './assets/nikon.svg?url'
import fujifilmUrl from './assets/fujifilm.svg?url'
import lumixUrl from './assets/lumix.svg?url'
import leicaUrl from './assets/leica.svg?url'
import ricohUrl from './assets/ricoh.svg?url'
import djiUrl from './assets/dji.svg?url'
import omSystemUrl from './assets/om-system.svg?url'

// Match the manufacturer strings written by cameras, including corporate names.
const brands = [
  [/sony/i, sonyUrl],
  [/canon/i, canonUrl],
  [/nikon/i, nikonUrl],
  [/fuji/i, fujifilmUrl],
  [/panasonic|lumix/i, lumixUrl],
  [/leica/i, leicaUrl],
  [/ricoh/i, ricohUrl],
  [/dji/i, djiUrl],
  [/om[\s._-]*(?:system|digital)/i, omSystemUrl],
]

export function getLogoUrl(maker = '') {
  return brands.find(([pattern]) => pattern.test(maker))?.[1] ?? null
}

export async function loadMakerLogo(maker) {
  const url = getLogoUrl(maker)
  if (!url) return null
  const image = new Image()
  image.src = url
  try { await image.decode(); return image } catch { return null }
}
