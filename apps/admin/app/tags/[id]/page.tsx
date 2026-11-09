import { getTag, listTagEvents } from '@iwb/server'
import { type AdminTag, dateTime, isExpired, OPERATORS, PROBLEMS, TagParams } from '@iwb/shared'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Fragment } from 'react'
import { PRIMARY, SECONDARY } from '@/components/buttons'
import { CELL, Table } from '@/components/Table'

export const metadata: Metadata = { title: 'Tag' }

/** What each action's ?notice= says (lib/action.ts). */
const NOTICES: Record<string, string> = {
  undone: 'Undone: the tag is live again, with the time it had left.',
  expired: "Expired, can't undo: its time ran out.",
  not_removed: "Nothing to undo: the tag isn't removed.",
  taken_down: 'Taken down. It is off the map for good.',
  already_down: 'It was already taken down.',
}

const EVENTS = {
  created: 'Created',
  still_there: 'Still there',
  removed: 'Removed',
  restored: 'Undone by admin',
  taken_down: 'Taken down by admin',
}

const COLUMNS = ['Event', 'Time', 'Visitor', 'Their actions that day', 'IP', 'Its actions that day']

/** Enough of a hash to tell visitors apart on one screen. Admin actions have none, and others lose theirs at 30 days. */
const short = (hash: string | null) => hash?.slice(0, 8) ?? 'None'

/** Take down (§4.2), final, so it asks first: the link reloads the page with the question, and only its form posts. */
function TakeDown({ tag, confirming }: { tag: AdminTag; confirming: boolean }) {
  if (tag.status === 'taken_down') return <p>Taken down. That is final.</p>
  if (!confirming)
    return (
      <a href="?confirm=take-down#take-down" className={`${SECONDARY} self-start`}>
        Take down…
      </a>
    )
  return (
    <div id="take-down" tabIndex={-1} className="flex flex-col gap-2">
      <p className="font-bold">Take this tag down? It goes off the map for good, and nobody can undo it.</p>
      <div className="flex flex-wrap gap-2">
        <form method="post" action={`/api/tags/${tag.id}/take-down`}>
          <button type="submit" className={PRIMARY}>
            Take down
          </button>
        </form>
        <a href={`/tags/${tag.id}`} className={SECONDARY}>
          Cancel
        </a>
      </div>
    </div>
  )
}

/** One tag in any state: its details, Undo removal and Take down, and its events with each hash's actions that day. */
export default async function TagPage({ params, searchParams }: PageProps<'/tags/[id]'>) {
  const parsed = TagParams.safeParse(await params)
  const tag = parsed.success && (await getTag(parsed.data.id))
  if (!tag) notFound()
  const [{ notice, confirm }, events] = await Promise.all([searchParams, listTagEvents(tag.id)])
  const details = [
    ['Status', tag.status],
    ['Live', tag.live ? 'Yes' : 'No'],
    ['Operator', OPERATORS[tag.operator].label],
    ['Problem', PROBLEMS[tag.problem]],
    ['Created', dateTime(tag.createdAt)],
    ['Last seen', dateTime(tag.lastConfirmedAt)],
    ['Still there', `${tag.confirmCount} times`],
    ['Removed', tag.removedAt ? dateTime(tag.removedAt) : 'No'],
    ['Expires', dateTime(tag.expiresAt)],
    ['Position', `${tag.lat.toFixed(6)}, ${tag.lng.toFixed(6)}`],
    ['Id', tag.id],
  ]

  return (
    <>
      <h1 className="text-2xl font-bold">
        {tag.street}, {tag.suburb}
      </h1>
      {typeof notice === 'string' && NOTICES[notice] && (
        <p className="mt-2 rounded-[10px] bg-tint p-3 font-bold">{NOTICES[notice]}</p>
      )}
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {details.map(([term, value]) => (
          <Fragment key={term}>
            <dt className="font-bold">{term}</dt>
            <dd className="min-w-0 break-words">{value}</dd>
          </Fragment>
        ))}
      </dl>

      <h2 className="mt-8 text-xl font-bold">Actions</h2>
      <div className="mt-2 flex flex-col gap-4">
        {tag.status === 'removed' &&
          (isExpired(tag) ? (
            <p>Expired, can&apos;t undo.</p>
          ) : (
            <form method="post" action={`/api/tags/${tag.id}/undo`}>
              <button type="submit" className={PRIMARY}>
                Undo removal
              </button>
            </form>
          ))}
        <TakeDown tag={tag} confirming={confirm === 'take-down'} />
      </div>

      <h2 className="mt-8 text-xl font-bold">Events</h2>
      <p className="mt-1 text-sm text-muted">
        Hashes are shortened. Actions are counted on any tag, over the UTC day of the event.
      </p>
      <Table label="Events" columns={COLUMNS}>
        {events.map((event, i) => (
          <tr key={i} className="border-b border-line">
            <td className={CELL}>{EVENTS[event.type]}</td>
            <td className={CELL}>{dateTime(event.at)}</td>
            <td className={`${CELL} font-mono`}>{short(event.visitorHash)}</td>
            <td className={CELL}>{event.visitorHash && event.visitorActions}</td>
            <td className={`${CELL} font-mono`}>{short(event.ipHash)}</td>
            <td className={CELL}>{event.ipHash && event.ipActions}</td>
          </tr>
        ))}
      </Table>
    </>
  )
}
