import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Terms' }

export default function TermsPage() {
  return (
    <>
      <h1>Terms</h1>
      <p>By adding a tag or a photo, you agree to these terms.</p>

      <h2>Photos</h2>
      <ul>
        <li>Photos must show a share bike. People and number plates must not be the subject.</li>
        <li>
          That is a request to you, not consent from anyone who appears in a photo. A photo reported as showing a
          person, face or number plate is hidden straight away.
        </li>
        <li>You give us permission to show the photos you add on this site.</li>
      </ul>

      <h2>Removal</h2>
      <p>We may remove any tag or photo at any time.</p>

      <h2>No affiliation</h2>
      <p>This site isn&apos;t affiliated with Lime, Hello, Ario, Inner West Council or Transport for NSW.</p>
    </>
  )
}
