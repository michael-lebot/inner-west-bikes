import Link from 'next/link'
import { Footer } from '@/components/Footer'

export default function TagNotFound() {
  return (
    <>
      <main className="mx-auto w-full max-w-[70ch] flex-1 p-4">
        <h1 className="text-lg font-bold">This tag has gone</h1>
        <p className="mt-2">
          The bike was marked as removed, or nobody has seen it for 48 hours.{' '}
          <Link href="/list" className="underline">
            See the bikes still in the graveyard
          </Link>
          .
        </p>
      </main>
      <Footer />
    </>
  )
}
