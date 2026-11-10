import { listRecentRemovals, listRecentTags } from '@iwb/server'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SECONDARY } from '@/components/buttons'
import { TagTable } from '@/components/TagTable'

export const metadata: Metadata = { title: 'Tags' }

const ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

/** Recent removals, to undo a malicious one, and recent tags; a tag id or a pasted /tag/ link opens that tag. */
export default async function TagsPage({ searchParams }: PageProps<'/tags'>) {
  const { q } = await searchParams
  const lookup = typeof q === 'string' ? q.trim() : ''
  const id = lookup.match(ID)?.[0]
  if (id) redirect(`/tags/${id.toLowerCase()}`)
  const [removals, tags] = await Promise.all([listRecentRemovals(), listRecentTags()])

  return (
    <>
      <h1 className="text-2xl font-bold">Tags</h1>
      <form action="/tags" role="search" className="mt-4 flex flex-col gap-2">
        <label htmlFor="lookup" className="font-bold">
          Tag id or link
        </label>
        <div className="flex max-w-xl gap-2">
          <input
            id="lookup"
            name="q"
            defaultValue={lookup}
            autoComplete="off"
            aria-invalid={lookup ? true : undefined}
            aria-describedby={lookup ? 'lookup-error' : undefined}
            className="min-h-11 min-w-0 flex-1 rounded-[10px] border border-edge px-3"
          />
          <button type="submit" className={SECONDARY}>
            Find
          </button>
        </div>
        {lookup && (
          <p id="lookup-error" className="font-bold text-error">
            That has no tag id in it. Paste the id, or the tag&apos;s link from the public site.
          </p>
        )}
      </form>

      <h2 className="mt-8 text-xl font-bold">Recent removals</h2>
      {removals.length ? (
        <TagTable label="Recent removals" tags={removals} />
      ) : (
        <p className="mt-2">No removed tags.</p>
      )}

      <h2 className="mt-8 text-xl font-bold">Recent tags</h2>
      <p className="mt-1 text-sm text-muted">The latest {tags.length} tags, newest first.</p>
      <TagTable label="Recent tags" tags={tags} />
    </>
  )
}
