import { clockTime, duration, OPERATORS, PROBLEMS, type PublicTag } from '@iwb/shared'
import Link from 'next/link'
import { PinIcon } from './PinIcon'

export function TagRow({ tag, now }: { tag: PublicTag; now: Date }) {
  return (
    <Link
      href={`/tag/${tag.id}`}
      className="flex min-h-14 items-center gap-3 rounded-[10px] border border-line px-3 py-2"
    >
      <PinIcon operator={tag.operator} />
      <span className="flex min-w-0 flex-1 flex-col leading-snug">
        <b>{tag.street}</b>
        <span className="text-sm text-muted">
          {OPERATORS[tag.operator].label} · {PROBLEMS[tag.problem]}
        </span>
      </span>
      <span className="text-sm whitespace-nowrap text-muted">
        {duration(now, tag.expiresAt)} left
        <span className="sr-only"> (disappears at {clockTime(tag.expiresAt)})</span>
      </span>
    </Link>
  )
}
