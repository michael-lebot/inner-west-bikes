// The map's pixel art (§4.1, §9) as ASCII sprites, one letter per pixel. Each becomes an RGBA image at twice the CSS
// resolution (pixelRatio 2), so an art pixel is one CSS pixel and stays sharp on a phone.
import { LABEL } from '@iwb/shared'
import type { StyleImageMetadata } from 'maplibre-gl'

// A white label box with a grey edge, stretched around each street name.
const BOX = ['eeeeee', 'ewwwwe', 'ewwwwe', 'ewwwwe', 'ewwwwe', 'eeeeee']

const INKS: Record<string, string> = { e: LABEL.boxEdge, w: LABEL.box }

/** Each letter as a 2 × 2 block of its colour; `.` is the ground colour. */
function pixels(sprite: string[], ground = '#000000') {
  const width = sprite[0]!.length * 2
  const height = sprite.length * 2
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const hex = INKS[sprite[y >> 1]![x >> 1]!] ?? ground
      data.set([1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).concat(255), (y * width + x) * 4)
    }
  return { width, height, data }
}

/** Every image the style names, by id, for map.addImage when MapLibre asks for it. */
export const IMAGES: Record<string, [ReturnType<typeof pixels>, Partial<StyleImageMetadata>]> = {
  // The edge stays put and the white middle stretches; the name sits in the middle.
  'label-box': [pixels(BOX), { pixelRatio: 2, stretchX: [[2, 10]], stretchY: [[2, 10]], content: [2, 2, 10, 10] }],
}
