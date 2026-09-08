import lensNames from './data/lens-makers.json' with { type: 'json' }

const normalizeName = (text) => text.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ').replace(/\s*\|\s*/g, '|')
const normalizeMaker = (text) => text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
const knownLenses = new Map(Object.entries(lensNames).map(([name, display]) => [normalizeName(name), display]))

export function formatLens(lensMake, lensModel) {
  const name = normalizeName(lensModel)
  let display = knownLenses.get(name)
  // Accept a manufacturer prefix without duplicating entries in the JSON.
  if (!display) {
    for (const [key, value] of knownLenses) {
      if (!name.endsWith(` ${key}`)) continue
      const prefix = name.slice(0, -key.length).trim()
      if (normalizeName(value).startsWith(`${prefix} `)) { display = value; break }
    }
  }
  // Do not override a conflicting manufacturer explicitly recorded in EXIF.
  if (display && (!lensMake || normalizeMaker(display).startsWith(normalizeMaker(lensMake)))) return display
  const makerIncluded = lensMake && normalizeMaker(lensModel).includes(normalizeMaker(lensMake))
  return [makerIncluded ? '' : lensMake, lensModel].filter(Boolean).join(' ')
}
