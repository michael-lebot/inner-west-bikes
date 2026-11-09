import { OPERATORS, PIN_HALO, PINS, type Operator } from '@iwb/shared'

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

/** An SVG path over every pixel whose letter is in `letters`, one rectangle per run along a row. */
const pixels = (letters: string) =>
  PIN.flatMap((row, y) =>
    [...row.matchAll(new RegExp(`[${letters}]+`, 'g'))].map(
      ({ index, 0: run }) => `M${index} ${y}h${run.length}v1h-${run.length}z`,
    ),
  ).join('')

const SHAPE = pixels('XCW')
const FILL = pixels('C')
const SHINE = pixels('W')

/** A pixel pin, drawn 2 CSS px per pixel. Decorative: the operator is always named in text beside it. */
export function PinIcon({ operator }: { operator: Operator }) {
  const colors = PINS[operator]
  return (
    <svg
      width={30}
      height={34}
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
