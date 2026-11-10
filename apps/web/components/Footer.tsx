import { FEEDBACK_EMAIL } from '@iwb/shared'
import Link from 'next/link'
import { MotionToggle } from './MotionToggle'

const PAGES = [
  { href: '/why', label: 'Why this page exists' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/accessibility', label: 'Accessibility' },
  { href: '/terms', label: 'Terms' },
]

const LINK = 'inline-flex min-h-[44px] min-w-[44px] items-center underline underline-offset-2'

/**
 * Pinned to the bottom of every page (§4.7): feedback, the pages about the site, and Reduce motion. Two rows on a
 * phone, one on a desktop; the address shows where there is room for it, and screen readers always hear it.
 */
export function Footer() {
  return (
    <footer className="sticky bottom-0 z-20 mt-auto flex max-h-[20dvh] flex-wrap items-center gap-x-3 overflow-y-auto overscroll-contain border-t border-line bg-white pr-[max(1rem,env(safe-area-inset-right))] pb-[env(safe-area-inset-bottom)] pl-[max(1rem,env(safe-area-inset-left))] text-sm">
      <a href={`mailto:${FEEDBACK_EMAIL}`} aria-label={`Feedback: ${FEEDBACK_EMAIL}`} className={LINK}>
        Feedback<span className="hidden lg:inline">: {FEEDBACK_EMAIL}</span>
      </a>
      {PAGES.map(({ href, label }) => (
        <Link key={href} href={href} className={LINK}>
          {label}
        </Link>
      ))}
      <MotionToggle />
    </footer>
  )
}
