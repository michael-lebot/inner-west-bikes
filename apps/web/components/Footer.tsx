import Link from 'next/link'

const LINKS = [
  { href: '/accessibility', label: 'Accessibility' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
]

export function Footer() {
  return (
    <footer className="border-t border-line">
      <nav aria-label="About this site" className="mx-auto flex max-w-[70ch] flex-wrap gap-x-6 px-4 py-2 text-sm">
        {LINKS.map(({ href, label }) => (
          <Link key={href} href={href} className="inline-flex min-h-11 items-center underline underline-offset-2">
            {label}
          </Link>
        ))}
      </nav>
    </footer>
  )
}
