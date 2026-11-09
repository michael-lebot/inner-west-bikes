import { ViewToggle } from '@/components/ViewToggle'

/** The map screen's static shell. It never waits for data, so first paint is fast (§11.2). */
export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <h1 className="sr-only">Map of dumped share bikes in the Inner West</h1>
      {/* Space reserved for the map and the bike count, which arrive after first paint, so nothing shifts. */}
      <div className="min-h-64 flex-1 bg-meter" />
      <div className="flex flex-col gap-3 border-t border-line p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <p className="min-h-7 text-lg font-bold" />
        <ViewToggle current="/" />
      </div>
    </main>
  )
}
