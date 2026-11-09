import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Reported photos' }

export default function ReportsPage() {
  return (
    <>
      <h1 className="text-2xl font-bold">Reported photos</h1>
      <p className="mt-2">No reported photos.</p>
    </>
  )
}
