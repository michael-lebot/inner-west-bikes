import { bikes, byPlace, type PublicTag } from '@iwb/shared'
import { TagRow } from './TagRow'

/** Live tags grouped by suburb: suburbs, then the streets in each, in alphabetical order. */
export function TagList({ tags, now }: { tags: PublicTag[]; now: Date }) {
  const bySuburb = new Map<string, PublicTag[]>()
  for (const tag of tags.toSorted(byPlace)) {
    const group = bySuburb.get(tag.suburb)
    if (group) group.push(tag)
    else bySuburb.set(tag.suburb, [tag])
  }

  return (
    <div className="flex flex-col gap-2">
      {[...bySuburb].map(([suburb, group]) => (
        <section key={suburb} className="flex flex-col gap-2">
          <h2 aria-label={`${suburb}, ${bikes(group.length)}`} className="mt-2 text-sm font-bold text-muted">
            {suburb} · {group.length}
          </h2>
          <ul className="flex flex-col gap-2">
            {group.map((tag) => (
              <li key={tag.id}>
                <TagRow tag={tag} now={now} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
