import Link from 'next/link'

const LINKS = [
  { href: '/accessibility', label: 'Accessibility' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
]

export function Footer() {
  return (
    <footer className="border-t border-line">
      {/* The small text is set on the links: on the nav it would shrink its 70ch and pull it out of line with <main>. */}
      <nav aria-label="About this site" className="mx-auto flex max-w-[70ch] flex-wrap gap-x-6 px-4 py-2">
        {LINKS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="inline-flex min-h-11 min-w-11 items-center justify-center text-sm underline underline-offset-2"
          >
            {label}
          </Link>
        ))}
      </nav>
    </footer>
  )
}
