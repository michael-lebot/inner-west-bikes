import { OPERATORS, PIN_HALO, PINS, type Operator } from '@iwb/shared'
import { pixels } from './pixels'

// The header's headstone, 13 × 15 pixels: X is the outline, C the operator colour, W the shine. Its ground line is in the
// outline's colour, as the logo's green vanishes on the map's grass. The middle of the base is where the bike is.
const STONE = [
  '...XXXXXXX...',
  '..XXCCCCCXX..',
  '.XXWCCCCCCXX.',
  '.XWCCCCCCCCX.',
  '.XWCCCCCCCCX.',
  '.XCCCCCCCCCX.',
  '.XCCCCCCCCCX.',
  '.XCCCCCCCCCX.',
  '.XCCCCCCCCCX.',
  '.XCCCCCCCCCX.',
  '.XCCCCCCCCCX.',
  '.XCCCCCCCCCX.',
  '.XCCCCCCCCCX.',
  '.XXXXXXXXXXX.',
  'XXXXXXXXXXXXX',
]

const SHAPE = pixels(STONE, 'XCW')
const FILL = pixels(STONE, 'C')
const SHINE = pixels(STONE, 'W')

/** A pixel headstone, `scale` CSS px per pixel. Decorative: the operator is always named in text beside it. */
export function PinIcon({ operator, scale = 2 }: { operator: Operator; scale?: number }) {
  const colors = PINS[operator]
  return (
    <svg
      width={15 * scale}
      height={17 * scale}
      viewBox="-1 -1 15 17"
      shapeRendering="crispEdges"
      aria-hidden="true"
      className="shrink-0"
    >
      {/* The stroke is painted under the fill, so only its outer half shows: a 1 px white halo. */}
      <path d={SHAPE} fill={colors.line} stroke={PIN_HALO} strokeWidth={2} paintOrder="stroke" />
      <path d={FILL} fill={colors.fill} />
      <path d={SHINE} fill={colors.shine} />
      <text
        x={6.5}
        y={7.5}
        fill={colors.letter}
        fontSize={6.5}
        fontWeight={700}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {OPERATORS[operator].letter}
      </text>
    </svg>
  )
}
