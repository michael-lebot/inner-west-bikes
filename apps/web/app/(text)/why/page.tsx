import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Why this page exists' }

export default function WhyPage() {
  return (
    <>
      <h1>Why this page exists</h1>
      <p>
        <strong>Placeholder: Michael will supply this text.</strong> The site doesn&apos;t launch until it is here.
      </p>
    </>
  )
}
