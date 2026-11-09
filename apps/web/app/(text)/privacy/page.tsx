import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Privacy' }

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy</h1>
      <p>This site has no accounts. It never asks for your name, email address or any other personal details.</p>

      <h2>What we collect</h2>
      <ul>
        <li>
          The tags you add: a spot, whose bike it is, what is wrong and, if you add one, a photo. There is no free text.
        </li>
        <li>
          A random identifier in a cookie, so we can limit how often one visitor acts and undo abuse. We store only a
          keyed hash of it.
        </li>
        <li>
          A hash of your IP address, made with a key that changes every day. We never store or log the address itself.
        </li>
      </ul>

      <h2>How long we keep it</h2>
      <ul>
        <li>
          Visitor and IP hashes are cleared from tags and reports after 30 days. The anonymous record (place, operator,
          problem and times) is kept.
        </li>
        <li>Rate-limit counters are deleted 48 hours after they start.</li>
        <li>
          Each day&apos;s IP key is deleted after 48 hours. After that, that day&apos;s IP hashes can&apos;t be linked
          to an address.
        </li>
        <li>Photos are deleted when their tag&apos;s 48 hours run out, or sooner if they are taken down.</li>
      </ul>

      <h2>Photos</h2>
      <p>
        Photos are public. Please leave out people, faces and number plates. Every photo is re-encoded when it arrives,
        which removes its location and other hidden details.
      </p>

      <h2>Your location</h2>
      <p>
        Using your location is optional. Your browser asks for permission only when you choose it. The location is read
        once, used in your browser to suggest a pin, and never sent or stored. Only the pin you confirm is sent, as for
        any tag.
      </p>

      <h2>Bot checks</h2>
      <p>
        To keep out automated abuse, Vercel BotID checks signals from your browser when you add a tag, mark one, add a
        photo or report one.
      </p>

      <h2>Who helps us run the site</h2>
      <ul>
        <li>Vercel hosts the site, in its Sydney region, and stores the photos.</li>
        <li>Neon stores the database, in Sydney.</li>
        <li>Resend sends report alerts to the site&apos;s owner. They contain no visitor details.</li>
      </ul>

      <h2>Contact</h2>
      <p>
        <strong>Contact address to come.</strong>
      </p>
    </>
  )
}
