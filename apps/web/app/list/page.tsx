import { listLiveTags } from '@iwb/db'
import { bikeCount, TAG_LIFETIME_HOURS } from '@iwb/shared'
import type { Metadata } from 'next'
import { Footer } from '@/components/Footer'
import { TagList } from '@/components/TagList'
import { ViewToggle } from '@/components/ViewToggle'

export const metadata: Metadata = { title: 'List of bikes' }

/** Every live tag, rendered on the server: reading it needs neither the map nor JavaScript (§10.3). */
export default async function ListPage() {
  const tags = await listLiveTags()
  const now = new Date()

  return (
    <>
      <main className="mx-auto flex w-full max-w-[70ch] flex-1 flex-col gap-3 p-4">
        <div>
          <h1 className="text-lg font-bold">
            {tags.length ? bikeCount(tags.length) : 'No bikes in the graveyard right now.'}
          </h1>
          <p className="text-sm text-muted">Tags disappear {TAG_LIFETIME_HOURS} hours after the last sighting.</p>
        </div>
        <ViewToggle current="/list" />
        <TagList tags={tags} now={now} />
      </main>
      <Footer />
    </>
  )
}
