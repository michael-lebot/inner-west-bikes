import { getLiveTag } from '@iwb/server'
import { bikeName, TagParams } from '@iwb/shared'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Footer } from '@/components/Footer'
import { PinIcon } from '@/components/PinIcon'
import { TagDetails } from '@/components/TagDetails'

export const metadata: Metadata = { title: 'Tagged bike' }

/** One live tag, shareable by URL. Anything else, including an id that isn't a UUID, is a 404. */
export default async function TagPage({ params }: PageProps<'/tag/[id]'>) {
  const parsed = TagParams.safeParse(await params)
  const tag = parsed.success ? await getLiveTag(parsed.data.id) : null
  if (!tag) notFound()

  return (
    <>
      <main className="mx-auto flex w-full max-w-[70ch] flex-1 flex-col gap-3 p-4">
        <h1 className="flex items-center gap-2 text-lg font-bold">
          <PinIcon operator={tag.operator} />
          {bikeName(tag.operator)}
        </h1>
        <TagDetails tag={tag} now={new Date()} />
      </main>
      <Footer />
    </>
  )
}
