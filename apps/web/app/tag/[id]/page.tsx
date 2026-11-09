import { getLiveTag } from '@iwb/server'
import { bikeName, TagParams } from '@iwb/shared'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { Footer } from '@/components/Footer'
import { PinIcon } from '@/components/PinIcon'
import { TagActions } from '@/components/TagActions'
import { TagDetails } from '@/components/TagDetails'

/** The live tag the URL names, or null. Cached for the request, so the title and the page read the database once. */
const findTag = cache(async (id: string) => {
  const parsed = TagParams.safeParse({ id })
  return parsed.success ? getLiveTag(parsed.data.id) : null
})

// not-found.tsx titles the server's 404 HTML, but once the page hydrates Next shows this title instead.
export async function generateMetadata({ params }: PageProps<'/tag/[id]'>): Promise<Metadata> {
  return { title: (await findTag((await params).id)) ? 'Tagged bike' : 'This tag has gone' }
}

/** One live tag, shareable by URL. Anything else, including an id that isn't a UUID, is a 404. */
export default async function TagPage({ params }: PageProps<'/tag/[id]'>) {
  const tag = await findTag((await params).id)
  if (!tag) notFound()

  return (
    <>
      <main className="mx-auto flex w-full max-w-[70ch] flex-1 flex-col gap-3 p-4">
        <h1 className="flex items-center gap-2 text-lg font-bold">
          <PinIcon operator={tag.operator} />
          {bikeName(tag.operator)}
        </h1>
        <TagDetails tag={tag} now={new Date()} />
        <TagActions id={tag.id} />
      </main>
      <Footer />
    </>
  )
}
