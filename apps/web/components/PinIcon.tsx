import { OPERATORS, PIN_HALO, PINS, type Operator } from '@iwb/shared'
import { pixels } from './pixels'

// The mockup's 13 × 15 pixel pin: X is the outline, C the operator colour, W the shine.
const PIN = [
  '....XXXXX....',
  '..XXCCCCCXX..',
  '.XCWCCCCCCCX.',
  '.XCWCCCCCCCX.',
  'XCCCCCCCCCCCX',
  'XCCCCCCCCCCCX',
  'XCCCCCCCCCCCX',
  'XCCCCCCCCCCCX',
  '.XCCCCCCCCCX.',
  '.XCCCCCCCCCX.',
  '..XXCCCCCXX..',
  '...XXCCCXX...',
  '....XXCXX....',
  '.....XXX.....',
  '......X......',
]

const SHAPE = pixels(PIN, 'XCW')
const FILL = pixels(PIN, 'C')
const SHINE = pixels(PIN, 'W')

/** A pixel pin, `scale` CSS px per pixel. Decorative: the operator is always named in text beside it. */
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
        y={5.8}
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
