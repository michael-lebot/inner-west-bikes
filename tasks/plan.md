# Build plan — The Inner West E-bike Graveyard

Source of truth: `SPEC.md` rev 5. This plan does not reopen its decisions; section numbers (§) refer to it.
Visual reference: `docs/mockups/graveyard-v3.html`. Task checklist: `tasks/todo.md`.

The build is six stacked pull requests. PR 1 branches from `main`, and each later PR branches from the one before
and targets it. Every PR leaves the repo green (`pnpm verify`) and visibly working in a browser.

| PR | Branch | Goal | Milestone | Tasks |
|---|---|---|---|---|
| 1 | `build/01-foundation` | Repo, tooling, database, CI, read-only pages | M0 | 9 |
| 2 | `build/02-browse-map` | The Overworld map with live pins, cards, list and desktop panel | M1 | 9 |
| 3 | `build/03-tag-on-map` | Tag, confirm and remove on the map, with safe retries and limits | M2 (part) | 8 |
| 4 | `build/04-tag-without-map` | Choose by street, Use my location, admin Tags, hourly job | M2 (rest) | 6 |
| 5 | `build/05-photos` | Photo upload, private serving, retry and deletion | M3 (part) | 7 |
| 6 | `build/06-moderation-launch` | Reports, email, circuit breaker, admin queue, launch docs | M3 (rest) + M4 | 7 |

---

## 1. Architecture

### 1.1 The shape in one paragraph

Two Next.js apps sit on two internal packages. **`packages/shared`** is pure TypeScript and data, safe to import in
the browser: configuration, Zod schemas, error codes, formatting, colour tokens and the NSW geodata with the functions
that read it. **`packages/server`** runs only on the server: the Prisma schema and client, the Blob and email seams,
and **every domain rule** (tag lifecycle, photo moderation, reports, rate limits, retention). It is the only code
that talks to Postgres, Blob or Resend. **`apps/web`** (public) and **`apps/admin`** (protected) contain only HTTP
and UI: route handlers parse input and call one `packages/server` function; pages read through `packages/server` and
pass props to components. No package builds anything: both apps compile the packages' TypeScript directly
(`transpilePackages`).

### 1.2 Directory tree

```
.
├── apps/
│   ├── web/                         Public site. HTTP and UI only; no SQL, no domain rules.
│   │   ├── app/                     Routes only: pages, layouts, route handlers. Data enters here.
│   │   │   ├── page.tsx             Map screen shell (renders <MapScreen>)
│   │   │   ├── list/page.tsx        Server-rendered list; never loads MapLibre
│   │   │   ├── tag/[id]/page.tsx    Server-rendered tag page
│   │   │   ├── (text)/                  Text pages: layout.tsx (column, prose styles, footer) and
│   │   │   │                            why/ accessibility/ privacy/ terms/ (page.tsx each)
│   │   │   ├── api/tags/route.ts                    GET live tags, POST create
│   │   │   ├── api/tags/[id]/still-there/route.ts   POST
│   │   │   ├── api/tags/[id]/removed/route.ts       POST
│   │   │   ├── api/tags/[id]/photo/route.ts         POST (multipart)
│   │   │   ├── api/photos/[id]/report/route.ts      POST
│   │   │   ├── api/cron/hourly/route.ts             GET, CRON_SECRET only
│   │   │   ├── photo/[id]/route.ts, photo/[id]/thumb/route.ts   Private photo streaming
│   │   │   ├── layout.tsx, not-found.tsx, globals.css
│   │   ├── components/              React components. Receive data as props; never import @iwb/server.
│   │   ├── map/                     The ONLY folder that imports maplibre-gl or pmtiles. Loaded by import() only.
│   │   ├── lib/                     App helpers that are not components: write wrapper, BotID seam, env,
│   │   │                            image pipeline, browser send-with-retry, live-tags hook.
│   │   ├── public/                  fonts/, glyphs/ (committed); tiles/ and preview.webp (generated, git-ignored)
│   │   ├── scripts/                 fetch-tiles.sh, build-preview.ts
│   │   ├── proxy.ts                 Visitor cookie + nonce CSP + security headers (Next 16 "proxy")
│   │   ├── instrumentation-client.ts  BotID client init
│   │   ├── next.config.ts, vercel.json, .env.example
│   └── admin/                       Michael's app behind Vercel Authentication. HTTP and UI only.
│       ├── app/                     tags/, tags/[id]/, reports/ pages; api/ form-post handlers; photo/[id]/
│       ├── components/              Admin-only components (tables, action forms, uploads switch)
│       ├── lib/action.ts            The one wrapper for admin POSTs (same-origin check, 303 redirect)
│       └── next.config.ts, vercel.json, .env.example
├── packages/
│   ├── server/                      Server only. Everything that touches Postgres, Blob or email.
│   │   ├── prisma/schema.prisma     The whole §5.1 data model (one initial migration in PR 1)
│   │   ├── prisma/migrations/, prisma/seed.sql
│   │   └── src/
│   │       ├── index.ts             Public API: named exports only. Apps import nothing deeper.
│   │       ├── client.ts            Prisma client (driver adapter @prisma/adapter-pg), one per process
│   │       ├── env.ts               Server env, Zod-parsed, local defaults off Vercel
│   │       ├── tags.ts              Tag lifecycle + LIVE + reads. Owns tables tags, tag_events
│   │       ├── photos.ts            Attach, serve lookup, restore, delete, expiry, uploads paused.
│   │       │                        Owns photos, site_state and photo files
│   │       ├── reports.ts           Report, per-report email, digest, circuit breaker. Owns photo_reports
│   │       ├── limits.ts            Rate counters. Owns rate_counters
│   │       ├── visitors.ts          Cookie and IP hashing, daily salts, 30-day hash clearing. Owns daily_salts
│   │       ├── hourly.ts            runHourly(): calls the owners' cleanup functions in §5.4 order
│   │       ├── blob.ts              Blob seam: put / get / del / list (Vercel Blob, or a local folder)
│   │       ├── email.ts             Email seam: sendEmail (Resend over fetch, or console)
│   │       ├── generated/           Prisma client output (git-ignored, made by postinstall)
│   │       └── *.test.ts            Integration tests against real Postgres
│   └── shared/                      Browser-safe. No node: imports, no Prisma, no React.
│       ├── theme.css                UI colour tokens (Tailwind 4 @theme). Imported by both apps.
│       ├── data/                    Generated NSW data (committed): council.json, council-buffered.json,
│       │                            places.json, picker.json, addresses/<suburb>.json + addresses/index.ts
│       ├── scripts/                 fetch-nsw.ts, build-data.ts (dev only, need network). data/raw/ is git-ignored.
│       └── src/
│           ├── index.ts             Main entry (small, always loaded): config, schemas, errors, format, near
│           ├── config.ts            Operators, problems, report reasons, LIMITS, every tunable constant
│           ├── schemas.ts           Zod request/response schemas and their types (PublicTag, …)
│           ├── errors.ts            AppError, error codes → HTTP status → visitor-facing message
│           ├── format.ts            Counts, relative/absolute times, accessible names, photo alt text
│           ├── near.ts              distanceMeters, nearbyTags (25 m check)
│           ├── palette.ts           Map art colours and operator pin colours
│           ├── geo.ts               Entry "@iwb/shared/geo": where(lat,lng) → inside / suburb / street
│           ├── picker.ts            Entry "@iwb/shared/picker": street search, corners, house numbers
│           └── *.test.ts            Unit tests (contrast, where, house numbers, format)
├── e2e/                             Playwright specs for both apps + support.ts (DB reset, SQL, axe helper)
├── docs/                            mockups/ (existing), accessibility-checklist.md, launch.md, esafety.md
├── .github/workflows/ci.yml
├── docker-compose.yml               Postgres 18 for local dev and tests (port 54318)
├── playwright.config.ts, lighthouserc.json, eslint.config.mjs, .prettierrc, .prettierignore
├── turbo.json, pnpm-workspace.yaml, tsconfig.base.json, tsconfig.json (e2e/), package.json, .nvmrc
```

What does **not** go where:
- No `packages/ui`, `packages/config` or `packages/core`. Shared React components are not needed (admin has its own
  few); configs live at the root.
- No `services/`, `repositories/` or `utils/` folders. A domain rule goes in the `packages/server/src` file that owns
  the table it writes. A helper used by one file stays in that file.
- No components inside `app/`. No route handlers outside `app/`.

### 1.3 Dependency rule (allowed imports)

1. `packages/shared` imports only npm packages (`zod`, `@turf/boolean-point-in-polygon`). Never `node:*`, Prisma,
   React, Next or another workspace package.
2. `packages/server` imports `@iwb/shared`, Prisma, `@prisma/adapter-pg`, `@vercel/blob` and `node:*`.
3. Apps import `@iwb/shared` (main entry anywhere; `/geo` and `/picker` only through `import()` in client code) and
   `@iwb/server` **only from `app/**` and `lib/`** (pages, route handlers, wrappers). `components/` and `map/` never
   import `@iwb/server`: they get data as props or over `/api/*`.
4. `maplibre-gl` and `pmtiles` are imported only inside `apps/web/map/`. `apps/web/map/*` is reached only through
   `import('@/map/MapView')` in `components/MapScreen.tsx`.
5. `sharp` is imported only in `apps/web/lib/image.ts` (and the preview script). `botid` only in `lib/bot.ts`,
   `instrumentation-client.ts` and `next.config.ts`.
6. Apps never import each other. Packages never import apps.

Enforced by ESLint `no-restricted-imports` overrides in `eslint.config.mjs` (task 1.1). A client component that
imports `@iwb/server` also fails `next build`, because `pg` and `node:crypto` can't be bundled for the browser.

### 1.4 The write path — one shape for every public write

```ts
// apps/web/app/api/tags/[id]/removed/route.ts — every write route is this short
import { markRemoved } from '@iwb/server'
import { ActionBody, TagParams } from '@iwb/shared'
import { write } from '@/lib/write'

export const POST = write(async ({ request, params, visitor }) => {
  const { id } = TagParams.parse(await params)                  // Zod at the boundary
  const { requestId } = ActionBody.parse(await request.json())   // the browser-made ID (§5.3)
  return markRemoved({ tagId: id, requestId, visitor })          // exactly one domain call
})
```

```ts
// apps/web/lib/write.ts — the only wrapper; the photo route uses it too (with formData instead of json)
export function write<P>(run: (ctx: WriteContext<P>) => Promise<object>) {
  return async (request: Request, { params }: { params: Promise<P> }) => {
    try {
      if (await isBot()) throw new AppError('bot')                 // 1. BotID first, before any work
      const visitor = await identify(request)                       // 2. hashed cookie + hashed IP (daily salt)
      return Response.json(await run({ request, params, visitor }), { headers: NO_STORE })   // 3. parse + domain
    } catch (error) {
      return errorResponse(error)   // AppError → its status + {error:{code,message}}; ZodError → 400; else log, 500
    }
  }
}
```

```ts
// packages/server/src/tags.ts — one transaction; the repeat check, the count and one conditional statement
export function markRemoved({ tagId, requestId, visitor }: TagAction) {
  return db.$transaction(async (tx) => {
    if (!(await claimRequest(tx, { requestId, tagId, type: 'removed', visitor })))
      return { tag: await liveTag(tx, tagId) }       // repeat: same visitor → current state, nothing new; other → 409
    await countAction(tx, 'removed', visitor)         // rate_counters upsert … RETURNING count; over → 429, rollback
    const rows = await tx.$queryRaw<{ id: string }[]>`
      UPDATE tags SET status = 'removed', removed_at = now()
      WHERE id = ${tagId}::uuid AND ${LIVE} RETURNING id`    // "Allowed when" (§4.2) tested in the same statement
    if (rows.length === 0) throw new AppError('tag_gone')    // rollback also undoes the event row and the count
    return { tag: null }                                     // null = "no longer live, drop it from your map"
  })
}
```

How the spec's rules land:
- **One conditional statement per transition (§4.2).** Each transition is one `UPDATE … WHERE <allowed when> …
  RETURNING`, or for create one `INSERT … ON CONFLICT (id) DO NOTHING RETURNING`. No read-then-write.
- **Time is always Postgres `now()`.** No JavaScript clock in any query that tests or sets `expires_at`. This makes the
  "one second before / after" tests (§5.5) exact and keeps app and database clocks from disagreeing.
- **Safe retries (§5.3).** `claimRequest` inserts the event (or report) row first with `ON CONFLICT (request_id) DO
  NOTHING`. If the row already existed, it compares `visitor_hash`: same visitor → return current state, no count, no
  second event, no email; different visitor → `AppError('conflict')` (409). Create uses the tag `id` the same way
  (the `created` event's `request_id` is the tag id). Photo uses the unique `photos.tag_id`.
- **Rate limits in the same transaction (§6).** `countAction` runs after the repeat check, so a repeat never counts,
  and before the transition, so a rejected write rolls the count back. Row locks on the counter upsert serialise two
  simultaneous requests, so they can't pass a limit together.
- **Two simultaneous Removed** both reach the `UPDATE`; the second waits for the first's row lock, re-checks
  `status = 'active'`, matches nothing, throws `tag_gone` and rolls back its event: one removal.
- **Responses.** Every tag write returns `{ tag: PublicTag | null }` with status 200, first time or repeat.
  `null` means "not live". Errors are always `{ error: { code, message } }`.
- **Side effects after commit.** Emails and Blob deletions happen after the transaction commits, using the
  "claim, act, release on failure" pattern (`UPDATE … SET notified_at = now() WHERE notified_at IS NULL RETURNING`,
  send, reset to `NULL` if the send throws). Blob writes for a photo happen before its row insert, with a compensating
  delete if the insert fails (§4.3).

Admin writes use the same domain functions through `apps/admin/lib/action.ts`: same-origin check (`Origin` header
must equal the request host), run, then `303` redirect back with a `?notice=` code. Admin pages use plain HTML
`<form method="post">`, so they need no client JavaScript.

### 1.5 Where each rule lives (one place each)

| Rule | Lives in |
|---|---|
| Tag lifecycle: create, still there, removed, undo removal, take down (§4.2) | `packages/server/src/tags.ts`. No other file writes `tags.status` or `expires_at` |
| "Is this tag live" | `LIVE` SQL fragment in `tags.ts` (`status = 'active' AND expires_at > now()`), used by every read and transition. The browser only drops tags whose `expiresAt` has passed (`isExpired` in `format.ts`), because the API returns live tags only |
| Photo rules: attach, serving, restore, delete, expiry deletion, uploads paused (§4.3, §4.6) | `packages/server/src/photos.ts` |
| Reports, email timing, digest, circuit breaker (§4.6) | `packages/server/src/reports.ts` |
| Limit numbers (§6 table), operators, problems, report reasons, 48 h, 25 m, 44 px, zoom 16, 50 m, 20 m, 5 min, 10 emails/day, 15 reports/hour | `packages/shared/src/config.ts` |
| Limit enforcement | `packages/server/src/limits.ts` (`countAction`) |
| Retention: 30-day hashes, 48 h counters and salts (§6) | `visitors.ts` and `limits.ts`; scheduled only by `hourly.ts` |
| Inside the council (+20 m), suburb, nearest street (§4.1) | `where()` in `packages/shared/src/geo.ts`, run in the browser and again in `createTag` on the server |
| House-number matching (§10.3) | `matchHouseNumber()` in `packages/shared/src/picker.ts` |
| Visitor-facing error text | `packages/shared/src/errors.ts` |
| Counts, times, accessible names, alt text | `packages/shared/src/format.ts` |
| UI colours / map colours | `packages/shared/theme.css` / `packages/shared/src/palette.ts` |
| HTTP shape of public writes / admin writes | `apps/web/lib/write.ts` / `apps/admin/lib/action.ts` |
| Browser retry policy (§5.3) | `apps/web/lib/send.ts` |
| Live-tag refresh policy (§11.3) | `apps/web/lib/use-live-tags.ts` |

### 1.6 Conventions

**Naming.**
- React component files `PascalCase.tsx`, named after the component. Every other file `kebab-case.ts`. Next special
  files lowercase (`page.tsx`, `route.ts`).
- Functions `camelCase` verbs that match the spec's words: `createTag`, `confirmStillThere`, `markRemoved`,
  `undoRemoval`, `takeDown`, `attachPhoto`, `reportPhoto`, `restorePhoto`, `deletePhoto`, `pauseUploads`,
  `resumeUploads`, `runHourly`, `listLiveTags`, `getLiveTag`.
- Types, components and Zod schemas `PascalCase` (`PublicTag`, `CreateTagBody`). Constants `UPPER_SNAKE` in
  `config.ts`.
- Database: tables and columns `snake_case` exactly as §5.1 (via `@@map`/`@map`); Prisma models singular
  `PascalCase` (`Tag`, `TagEvent`, `Photo`, `PhotoReport`, `RateCounter`, `DailySalt`, `SiteState`). Enum values
  `snake_case`.
- Error codes `snake_case`. Workspace packages `@iwb/web`, `@iwb/admin`, `@iwb/server`, `@iwb/shared`. Path alias `@/` =
  the app root.

**Errors and HTTP.**
- Throw `AppError(code)` from `@iwb/shared` for anything a visitor can cause. `errorResponse` maps it:

  | code | status | message |
  |---|---|---|
  | `invalid` | 400 | Something was wrong with that request. |
  | `bot` | 403 | We couldn't check your browser. Reload the page and try again. |
  | `not_allowed` | 403 | Only the person who tagged this bike can add its photo. |
  | `not_found` | 404 | Not found. |
  | `conflict` | 409 | That request clashed with another. Reload and try again. |
  | `uploads_paused` | 409 | Photos are switched off for now. Your tag can still be added. |
  | `tag_gone` / `photo_gone` | 410 | This tag has already gone. / This photo has already gone. |
  | `too_large` | 413 | That photo is too big. Try a smaller one. |
  | `outside_area` | 422 | That spot is outside the Inner West. |
  | `bad_image` | 422 | That file isn't a photo we can use. |
  | `rate_limited` | 429 (+ `Retry-After`) | You've reached the limit for now. Try again later. |
  | (anything else) | 500 | Logged with `console.error`; the browser shows "Couldn't send. Check your connection and try again." |

- All API responses carry `Cache-Control: no-store`; photo responses `private, no-cache` (§4.3).

**Environment variables.**
- `process.env` is read only in `packages/server/src/env.ts`, `apps/web/lib/env.ts` (server) and
  `apps/web/lib/public-env.ts` (literal `process.env.NEXT_PUBLIC_TILES_URL`, so Next inlines it; checked without Zod,
  which stays out of the browser bundle, to be a root-relative path or an http(s) URL, and imported by
  `next.config.ts` so a bad value fails the build). ESLint (`no-restricted-properties`) enforces this.
- Each is Zod-parsed once. Off Vercel every variable has a safe local default (Docker URL, fixed dev secrets, Blob and
  email switched to local), so a fresh clone runs with no app env files. On Vercel (`VERCEL=1`) a missing secret
  throws the first time the code that needs it runs (so the admin app, which never hashes or emails, doesn't need
  `HASH_SECRET` or `RESEND_API_KEY`).
- `packages/server/.env` (from `.env.example`) exists only for the Prisma CLI. Each deployable has an `.env.example`
  listing its production variables; a PR that adds a variable updates it.

**Tests.**
- Unit and integration tests: `x.test.ts` beside `x.ts`, run by Vitest. Everything in `packages/server` and the web
  route tests use real Postgres (`iwb_test` database), run serially, and truncate tables in `beforeEach`.
- End-to-end: `e2e/<flow>.spec.ts`, one root `playwright.config.ts`, projects `iphone` (iPhone 13, WebKit),
  `pixel` (Pixel 7, Chromium) and `desktop` (1280×800, Chromium). Admin specs run on `desktop` only; `perf.spec.ts`
  on `pixel` only. E2E uses the `iwb_e2e` database, reset before each test by `e2e/support.ts`.
- A test that covers a §5.5 case starts its name with it: `it('§5.5 expiry: Removed one second after expires_at
  changes nothing')`. `grep -rn "§5.5"` lists the coverage.
- Test with the real thing where it runs locally (Postgres, sharp, the tiles). Mock only the seams (`blob.ts`,
  `email.ts`, `bot.ts`) and only with `vi.mock`/`vi.spyOn` inside the test.

**Server and client components.**
- Server components by default. `'use client'` only on interactive leaves: `MapScreen`, `Sheet`, `TagCard`,
  `TagActions`, `TagFlow`, `Dialog`, `TagForm`, `MatchDialog`, `StreetPicker`, `LocateButton`, `ListTagButton`,
  `ReportDialog`, `PhotoInput`, `Announcer`, and everything in `map/`.
- `TagRow`, `TagList`, `TagDetails`, `PinIcon` have no `'use client'` and no server-only imports, so they render on
  the server (`/list`, `/tag/[id]`) and inside client islands (chooser, desktop panel) alike.
- Every page is rendered per request (`await connection()` in the root layout), because the nonce-based CSP needs it
  and `/list` and `/tag/[id]` read the database anyway. "Static shell" (§11.2) means the shell never waits for data.

**Keeping the map out of pages that must not load it.**
- Only `apps/web/map/` imports MapLibre or pmtiles (ESLint).
- `MapScreen` loads `@/map/MapView` with `import()` in an effect, which runs after first paint.
- `/list` and `/tag/[id]` never render `MapScreen`. A perf test asserts their JavaScript stays under the 150 KiB
  pre-map budget, which MapLibre alone (about 275 KB) would break.
- Heavy data loads the same way: `@iwb/shared/geo` when placement or Use my location starts, `@iwb/shared/picker` when
  the street picker opens, one `addresses/<suburb>.json` when a street is chosen.

**Styling and copy.**
- Tailwind 4 utilities in components; tokens from `packages/shared/theme.css`. No CSS modules, no `clsx`.
- Sizes in `rem`. Focus style defined once in `theme.css`: 3 px outline plus a 2 px white halo, never removed.
- Visitor-facing strings live in the component that shows them, except error messages (`errors.ts`) and formatted
  values (`format.ts`). Copy follows §9's tone. English only.

### 1.7 Local development and the four seams

| Concern | Local and CI | Production (Michael's runbook, task 6.7) |
|---|---|---|
| Postgres | `docker compose up` → `postgres:18-alpine` on `localhost:54318` (volume at `/var/lib/postgresql`, the PG 18 layout). CI runs the same `pnpm db:up` | Neon via Vercel Marketplace, `DATABASE_URL` / `DATABASE_URL_UNPOOLED` |
| Map tiles | `pnpm tiles` runs `apps/web/scripts/fetch-tiles.sh`: `pmtiles extract` of a **pinned** Protomaps daily build into `apps/web/public/tiles/inner-west.pmtiles` (git-ignored). `next start` serves it with range requests. CI caches the file keyed on the script's hash | Uploaded to the public Blob store under a versioned name; `NEXT_PUBLIC_TILES_URL` points at it |
| Photos (Blob) | `blob.ts`: no `BLOB_READ_WRITE_TOKEN` → files under `<repo>/.data/blob/` (git-ignored) | Private Vercel Blob store |
| Email (Resend) | `email.ts`: no `RESEND_API_KEY` → `console.info('[email]', subject)` | Resend API over `fetch` |
| BotID | `bot.ts`: not on Vercel → every request is human | `checkBotId()` |
| Cron | `curl -H "Authorization: Bearer dev-cron-secret" localhost:3000/api/cron/hourly` | Vercel Cron hourly with `CRON_SECRET` |

Each seam is one module with one to four plain functions and an `if` on the environment. Nothing else knows which
side it is on.

Root scripts: `pnpm db:up`, `pnpm db:down`, `pnpm db:reset` (migrate reset + seed), `pnpm tiles`, `pnpm dev`
(web on 3000, admin on 3001), `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm start`, `pnpm e2e`,
`pnpm lhci`, and **`pnpm verify`** = lint → typecheck → test → build → e2e → lhci. Every task's verification
ends with `pnpm verify` green.

### 1.8 Dependencies

Runtime (each justified; nothing else is added without a line here):

| Package | Where | Why |
|---|---|---|
| `next` 16.4, `react` / `react-dom` 19 | apps | Framework (§5) |
| `maplibre-gl` **5.24** | web `map/` | Map engine (§4.1). v5 not v6: v6's main bundle plus its separate module worker is about 440 KB gzipped against the 300 KB map budget (§11.1); v5's UMD build with an inline worker is about 275 KB |
| `pmtiles` 4.5 | web `map/` | PMTiles protocol for MapLibre (§4.1), about 5 KB |
| `botid` 1.5 | web | Vercel BotID (§6) |
| `sharp` 0.35 | web `lib/image.ts` | Decode, resize, re-encode photos (§4.3); also renders the preview image |
| `zod` 4 | shared | Validation at every boundary (§6), env parsing |
| `@turf/boolean-point-in-polygon` 7 | shared | The inside-the-council check named in §4.1 |
| `@prisma/client` + `prisma` 6.19, `@prisma/adapter-pg` 6.19 | db | Prisma 6 (§5). Rust-free client (`engineType = "client"`) with the `pg` adapter: no engine binary to trace in a pnpm monorepo, and the same driver works against Docker Postgres and Neon |
| `@vercel/blob` 2.8 | db | Private photo store (§4.3 needs ≥ 2.3) |

Dev only: `typescript` ~6.0 (typescript-eslint supports < 6.1; TS 7 has no compiler API yet), `turbo` 2,
`eslint` 9 (eslint-plugin-react does not support 10 yet) with `eslint-config-next` 16 (its `typescript` config brings
typescript-eslint), `next` at the root too (eslint-config-next loads its parser from `next` without declaring it),
`prettier`, `tailwindcss` 4 + `@tailwindcss/postcss`, `vitest` **4.1** (Vitest 5 excludes Node 25, the local
runtime), `@playwright/test`, `@axe-core/playwright`, `@lhci/cli`, `pg` + `@types/pg` (E2E SQL helper),
`@turf/turf` (data build scripts only), `@types/geojson` (the GeoJSON types `geo.ts` and the data scripts use; turf
brings them, but pnpm only resolves a package's own dependencies), `@types/node`, `@types/react`.

Platform features used instead of packages: Node 24 type stripping runs `.ts` scripts (no `tsx`); `fetch` for Resend
(no SDK); `crypto.randomUUID` (no `uuid`); `Intl.DateTimeFormat` (no date library); native `<dialog>` with
`showModal()` for modal dialogs, focus containment and `inert` background (no focus-trap); native radio inputs for
chips; `navigator.geolocation`; canvas `toBlob` for resizing; `map.addImage` for pattern sprites (no sprite build);
`performance.mark` and `PerformanceObserver` for perf measurement; `useReducer` for screen state (no state library).

Node: `.nvmrc` is `24` (Active LTS until Oct 2026, now Maintenance LTS; supported by Vercel and Next 16's
`>=20.9`). `engines.node` is `">=24"` so local Node 25 runs everything. Pin exact versions in the lockfile; record
them in PR 1's description. A version used by more than one `package.json` lives once, in the `catalog` of
`pnpm-workspace.yaml`.

### 1.9 Deliberately not built

- A service, repository or use-case layer. Domain functions call Prisma directly, one file per owned table.
- A plugin or adapter system for Blob, email, BotID or cron. Four small modules with an environment `if`.
- Package build steps, `packages/ui`, `packages/config`, Turborepo remote cache, changesets.
- tRPC, generated API clients, server actions (§5 forbids them), SWR or React Query (one 40-line hook).
- A global state library, a component library, a focus-trap library, `clsx`, a date library, `uuid`, `dotenv`,
  the Resend SDK, `@vercel/functions`, `server-only`, `tsx`.
- `@protomaps/basemaps`: the Overworld style is about a dozen hand-written layers, and that package can't express
  fill patterns or `within` filters anyway.
- A sprite-sheet build pipeline (patterns are drawn into `map.addImage` from ASCII sprites at runtime), and
  `next/image` optimisation (§4.3 wants `unoptimized`).
- Redis/Upstash (limits are Postgres counters, §6), PostGIS (§4.1), a geocoding API (§10.3), a CDN cache for tag
  data (§11.3), an offline queue, PWA, dark mode, i18n (§16).
- Feature flags, a logging library, an error-tracking service, Storybook, visual-regression tests, MSW or mock
  servers, a seeding framework (`seed.sql` run by `prisma db execute`).
- A database-backed "deployment check" or health endpoint: not in §5.2.
- Operator report links (§14 open question), a stats page, visitor blocking (§4.6).

---

## 2. Assumptions

One line each; the spec section is in brackets.

1. Node 24 LTS for CI and Vercel; local Node 25 must also pass, which pins Vitest 4.1, TypeScript 6.0, ESLint 9 (§5).
2. MapLibre GL JS 5.24 rather than 6.x, because of the 300 KB map budget; budgets are re-measured in PR 2 (§11.1).
3. Every page renders per request because the strict CSP uses per-request nonces; the "static shell" still never waits for the database (§6, §11.2).
4. Rate-limit windows are fixed UTC buckets (`action:scope:hash:bucket`), so a visitor can briefly get up to twice a limit across a bucket edge (§6, "starting limits").
5. "Day" for the 10 individual report emails is the UTC day (§4.6).
6. Rate counting happens inside the write transaction after Zod, the boundary check and the repeat check, so invalid requests and repeats never use quota (§5.2, §5.3, §6).
7. The browser retries a 429 only when `Retry-After` is 30 s or less; longer limits show the limit message at once (§5.3).
8. The visitor cookie (`iwb_v`) is set by `proxy.ts` on the first request of any kind, including the request itself, so even a first write has a stable visitor for retries (§5.3, §6).
9. Visitor hash = HMAC-SHA256(`HASH_SECRET`, cookie). IP hash = HMAC-SHA256(daily salt, IPv4 or IPv6 /64). Both hex (§6).
10. The street stored for a tag is always `where()`'s nearest named street, even on the Choose by street route (§4.1, §10.3).
11. The `within` label filter uses the buffered polygon, so streets on the boundary (King St, Parramatta Rd) keep their labels (§4.1).
12. The gold council wall gets a dark (`#1f2328`) casing: gold alone is 1.6:1 on the grass and 1.2:1 on light grey, below the 3:1 in §10.2.
13. The Hello pin fill darkens from `#2f7bff` to about `#2566e6` so its white letter reaches 4.5:1; all pins get a 1 px white outer halo so they reach 3:1 on the dark greys outside the council (§10.2).
14. A report on a `hidden` photo is recorded (it still reaches Michael) but changes nothing; a report on a `deleted` photo returns 410 (§4.3).
15. Take down closes any open reports on its photo as `deleted` (§4.2, §4.3).
16. The orphan sweep treats a file whose only row is `deleted` as an orphan, so a failed file deletion is retried next hour (§5.4).
17. Admin events (`restored`, `taken_down`) get a server-made `request_id`; admin actions are naturally idempotent through their conditional updates (§5.1).
18. `/tag/[id]` for a tag that is not live returns 404 with "This tag has gone" (§5.2).
19. The map-screen List toggle is a two-item `Map | List` navigation between `/` and `/list`, so it works while the map loads or after it fails, without JavaScript (§3, §10.3).
20. A tap during placement while zoomed out past 16 zooms to 16 around the tap and asks for a second tap; it doesn't drop a pin (§12).
21. Accessibility, privacy and terms links live in the map's "i" panel (with the attributions) and in the footer of text pages and `/list`; the map header keeps only the name and "Why this page exists" (§7, §12).
22. The admin app uses the system font stack with the same colour tokens; only the public site self-hosts Atkinson Hyperlegible (§9, §10).
23. The admin app sends static security headers from `next.config.ts` without nonces; it is behind Vercel Authentication and renders no visitor content as HTML (§6).
24. The browser always re-encodes a chosen photo through canvas (even under 2048 px), so the server can reject any file with bytes after the image's end marker as a polyglot (§4.3, §5.5).
25. The static preview image is generated by `apps/web/scripts/build-preview.ts` from `council.json` and `places.json` at `dev` and `build` time; it is not committed (§11.2).
26. CI uses the real Inner West extract (about 13 MB) from a pinned Protomaps build, cached by GitHub Actions, rather than a fixture, so the tile-count and byte gates stay honest (§11.1).
27. Address points come from `NSW_Geocoded_Addressing_Theme_multiCRS` as §4.1 says; the research download used the older service and is only a cross-check (§4.1).
28. Speed Insights is not added in code; Michael checks plan inclusion and enables it (§11.4).

---

## 3. Pull requests

Each task lists: what it does, acceptance criteria, files, verification, dependencies and size (S 1–2 files, M 3–5,
L 5–8). Builders follow the "smallest complete change" rules: no speculative abstraction, platform before
dependency, and never cutting validation, security, accessibility or anything the spec asks for.

### PR 1 — `build/01-foundation` (M0)

**Goal.** Establish the whole repo architecture so every later PR only fills it in: the Turborepo workspace with
strict TypeScript, lint and format; the full Prisma schema and initial migration on Postgres 18 in Docker; the shared
config, tokens and contrast test; a web app with its layout, header, proxy (nonce CSP and security headers), the
read-only `/list` and `/tag/[id]` pages and the four text pages; an admin app showing recent tags; the Vitest,
Playwright, axe and Lighthouse harnesses; and CI running every gate. The bare build is measured and the §11.1
budgets confirmed or reset.

#### Task 1.1 — Workspace and tooling (M)
- **Does:** root `package.json` (`packageManager: pnpm@9.15.9`, `engines.node: ">=24"`, the root scripts in §1.7),
  `pnpm-workspace.yaml`, `turbo.json` (tasks `build`, `typecheck`, `test`, `dev`; declare `DATABASE_URL`,
  `TEST_DATABASE_URL` and `CI` in `globalPassThroughEnv`, because Turbo 2 hides undeclared variables, while it
  tracks `NEXT_PUBLIC_*` for Next apps by itself;
  `build`, `typecheck` and `test` depend on the same task in their workspace dependencies (`^`), because the packages
  ship source with no build, and without that edge a package change would not invalidate the apps' cached results;
  `tsconfig.base.json` is a global dependency),
  `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `moduleResolution: bundler`),
  `eslint.config.mjs` (flat: `eslint-config-next` core-web-vitals and typescript, with the Pages Router rule
  `no-html-link-for-pages` off, plus the import rules of §1.3 and the `process.env` rule of §1.6), `.prettierrc`
  (`printWidth: 120`, `semi: false`, `singleQuote: true`), `.prettierignore` (the hand-formatted `SPEC.md`,
  `tasks/plan.md` and mockups, and the lockfile), `.gitignore`, `.nvmrc`, `docker-compose.yml`, README setup section.
- **Accept:** `pnpm install` on a clean clone succeeds on Node 24 and 25; `pnpm lint` runs ESLint and
  `prettier --check` over the repo; a test import of `maplibre-gl` from `apps/web/components/` fails lint;
  `pnpm db:up` starts Postgres 18 and waits until healthy.
- **Files:** `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `eslint.config.mjs`,
  `.prettierrc`, `.prettierignore`, `.gitignore`, `.nvmrc`, `docker-compose.yml`, `README.md`.
- **Verify:** `pnpm install && pnpm lint && pnpm db:up && docker compose ps`.
- **Depends:** none.

#### Task 1.2 — Shared config, tokens and the contrast test (M)
- **Does:** `packages/shared` with `package.json` exports (`"."` and `"./theme.css"`; tasks 2.1 and 4.1 add
  `"./geo"`, `"./data/*"` and `"./picker"` with the files they point at), `config.ts` (operators Lime/Hello/Ario/Not sure with key, label, letter, `active`; the six
  problems; four report reasons; `LIMITS` exactly as the §6 table; the constants listed in §1.5), `errors.ts`
  (§1.6 table), `format.ts` (bike count "1 bike / N bikes in the graveyard", "Last seen 17 h ago", "Disappears in
  31 h", absolute "3:40 pm Tuesday" in `Australia/Sydney`, `isExpired`), `theme.css` (UI tokens from the mockup:
  ink `#1f2328`, muted `#57606a`, line `#d0d7de`, edge `#8c959f`, brand `#1d6b2a`, tint `#e8f3ea`, night
  `#1f2a36`, meter `#eaeef2`, focus; the focus style), `palette.ts` (map colours from the mockup's `T.colors`,
  `T.greys`, stamp colours, and operator pins per assumptions 12–13), `contrast.test.ts`.
- **Accept:** the contrast test parses `theme.css` and `palette.ts` and fails on any declared pair below its
  threshold: text pairs ≥ 4.5:1 (ink, muted and white-on-brand/night text); interface pairs ≥ 3:1 (edge chip border
  on white, focus ring on white, night and the map land colour); for every map colour (fills, roads, greys,
  patterns): each pin passes when the best of fill / outline / white halo is ≥ 3:1, each pin letter on its fill
  ≥ 4.5:1, label text on its halo or box ≥ 4.5:1, and the council wall passes when the best of gold / casing is
  ≥ 3:1; `format.test.ts` covers singular/plural and the Sydney time zone.
- **Files:** `packages/shared/{package.json,tsconfig.json,theme.css}`, `src/{index,config,errors,format,palette}.ts`,
  `src/{contrast,format}.test.ts`.
- **Verify:** `pnpm --filter @iwb/shared test && pnpm --filter @iwb/shared typecheck`.
- **Depends:** 1.1.

#### Task 1.3 — Database package: schema, migration, client, seed (M)
- **Does:** `packages/server` with the full §5.1 model in `schema.prisma` (generator `prisma-client`, output
  `../src/generated/prisma`, `engineType = "client"`; enums `TagStatus`, `Problem`, `TagEventType`, `PhotoStatus`,
  `ReportReason`, `ReportResolution`; uuid ids with `gen_random_uuid()` defaults except `tags.id`; `numeric(9,6)`
  lat/lng; `timestamptz` everywhere; indexes on `tags(status, expires_at)`, `tag_events(tag_id)`,
  `tag_events(at)`, `photo_reports(photo_id)`, `photo_reports(created_at)`; `site_state` single row with
  `CHECK (id = 1)` inserted by the migration). `client.ts` (adapter-pg, one client per process, cached on
  `globalThis` in dev), `env.ts`, `tags.ts` with `LIVE`, `listLiveTags()`, `getLiveTag(id)`,
  `listRecentTags()`, and the `PublicTag` select (lat/lng cast `::float8`). `prisma/seed.sql`: 14 tags (7 Lime,
  4 Hello, 3 Ario) at real points inside the council across at least six suburbs, with `created` events and
  `expires_at` spread between 2 h and 46 h ahead. Scripts `generate` (also `postinstall`), `migrate`,
  `migrate:deploy`, `seed`, `test`, `typecheck`. `vitest.config.ts` with a global setup that runs
  `prisma migrate deploy` against `TEST_DATABASE_URL` (default `postgresql://iwb:iwb@localhost:54318/iwb_test`),
  refusing any database whose name doesn't end in `_test`, and `fileParallelism: false`. Deploy, not
  `migrate reset`: it creates the database when missing and never drops anything, tests empty their own tables, and
  Prisma 6.19 refuses `migrate reset` when an AI agent runs it. `.env.example`.
- **Accept:** `prisma migrate dev` creates one initial migration; `listLiveTags` excludes removed, taken-down and
  expired tags (integration test); an enum-parity test proves `Problem` and `ReportReason` values equal the keys in
  `config.ts`; `pnpm db:reset` loads the seed.
- **Files:** `packages/server/{package.json,tsconfig.json,vitest.config.ts,.env.example}`,
  `prisma/{schema.prisma,seed.sql}`, `prisma/migrations/*`, `src/{index,client,env,tags}.ts`, `src/tags.test.ts`,
  `test/global-setup.ts`.
- **Verify:** `pnpm db:up && pnpm db:reset && pnpm --filter @iwb/server test`.
- **Depends:** 1.1, 1.2.

#### Task 1.4 — Web app shell: layout, header, proxy (M)
- **Does:** `apps/web` Next 16 app (`next.config.ts` with `transpilePackages`, `images.unoptimized`,
  `poweredByHeader: false`), `globals.css`
  (Tailwind 4 + `@iwb/shared/theme.css` + `@font-face` for Atkinson Hyperlegible 400/700 Latin woff2,
  `font-display: swap`, `color-scheme: light`), the two woff2 files plus the OFL licence in `public/fonts/` (copy once
  from the `@fontsource/atkinson-hyperlegible` tarball; ≤ 60 KB together), `layout.tsx` (`lang="en-AU"`,
  `viewport-fit=cover`, preload of the 400 woff2 only, `await connection()`, the `Announcer` live region),
  `Header.tsx` (night bar, decorative pixel headstone SVG from the mockup with `aria-hidden`, the name, "Why this page
  exists" top right), `not-found.tsx`. `proxy.ts`: per-request nonce; CSP `default-src 'self'; script-src 'self'
  'nonce-…' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self';
  connect-src 'self' <tiles origin>; worker-src blob:; child-src blob:; frame-ancestors 'none'; base-uri 'self';
  form-action 'self'; object-src 'none'` (plus `'unsafe-eval'` in dev only); `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(self)`; matcher skips
  `_next/static`, `fonts`, `glyphs`, `tiles`, `preview.webp`. `lib/env.ts`, `lib/public-env.ts`, `.env.example`.
  `/` renders the static shell: header, a fixed-size map frame, the sheet with a reserved count line and the
  `Map | List` toggle (`ViewToggle.tsx`, also on `/list`).
- **Accept:** `next build && next start` serves `/` with the CSP header and a nonce on every Next script; no CSP
  errors in the console; a 3 px focus ring shows on the header link; the page reflows at 320 px with no horizontal
  scroll.
- **Files:** `apps/web/{package.json,tsconfig.json,next.config.ts,postcss.config.mjs,proxy.ts,.env.example}`,
  `app/{layout,page,not-found}.tsx`, `app/globals.css`, `components/{Header,Announcer,ViewToggle}.tsx`,
  `lib/{env,public-env}.ts`, `public/fonts/*`.
- **Verify:** `pnpm --filter @iwb/web build && pnpm --filter @iwb/web start` then
  `curl -sI localhost:3000 | grep -i content-security-policy`.
- **Depends:** 1.2.

#### Task 1.5 — Read pages: `/list` and `/tag/[id]` (M)
- **Does:** `TagRow.tsx` (pin icon, street bold, "Operator · Problem", "22 h left"; accessible name with the
  absolute time), `PinIcon.tsx` (the mockup's 13×15 pixel pin as SVG `rect`s with operator fill, black outline,
  white halo, and the letter as real text in Atkinson Hyperlegible 700), `TagList.tsx` (grouped by suburb, groups
  and rows sorted by name, "Marrickville · 3" group headings), `TagDetails.tsx` (problem, street and suburb,
  "Last seen … · Disappears in …" with a timer bar; the page or card gives it a heading with the pin and
  `bikeName()`, "Lime e-bike"), `Footer.tsx` (links to Accessibility, Privacy, Terms).
  `/list` reads `listLiveTags()`; empty state "No bikes in the graveyard right now." `/tag/[id]` validates the id
  with Zod and reads `getLiveTag()`; not live or unknown → `notFound()`, and the route's own `not-found.tsx` says
  "This tag has gone".
- **Accept:** with the seed loaded, `/list` shows "14 bikes in the graveyard" and every tag once, grouped and
  ordered; the page works with JavaScript disabled; `/tag/<seeded id>` shows the tag; `/tag/<random uuid>` and
  `/tag/not-a-uuid` return 404.
- **Files:** `app/list/page.tsx`, `app/tag/[id]/{page,not-found}.tsx`,
  `components/{TagRow,PinIcon,TagList,TagDetails,Footer}.tsx`, `packages/shared/src/schemas.ts` (`PublicTag`,
  `TagParams`), `packages/shared/src/format.ts` (`bikeName`).
- **Verify:** `pnpm db:reset && pnpm build && pnpm start`, then the PR 1 browser checks.
- **Depends:** 1.3, 1.4.

#### Task 1.6 — Text pages (S)
- **Does:** `/why` with clearly marked placeholder copy ("Placeholder — Michael will supply this text", §14);
  `/accessibility` (statement per §10.6: target, the list view and Choose by street as the map's equivalents,
  contact address placeholder, known limits); `/privacy` (§7 list: what is collected and how it is hashed,
  retention per §6, providers and regions, BotID signals, location used only in the browser, contact);
  `/terms` (§7 list: photos must show share bikes, people and plates not the subject, licence to display, removal
  right, no affiliation). One centred column ≤ 70ch, `Footer` on each, both from the route group's layout. The
  copy is the launch copy, so the layout also shows "This site is still being built. This page describes how it will
  work at launch." until task 6.7 removes it.
- **Accept:** each page has one `<h1>`, headings in order, and passes axe; every page shows the still-being-built
  notice, so no copy claims the current build does something it doesn't.
- **Files:** `app/(text)/layout.tsx`, `app/(text)/{why,accessibility,privacy,terms}/page.tsx`.
- **Verify:** `pnpm e2e e2e/pages.spec.ts`.
- **Depends:** 1.4.

#### Task 1.7 — Admin app shell (S)
- **Does:** `apps/admin` Next 16 app on port 3001; `next.config.ts` with static security headers (assumption 23),
  `X-Robots-Tag: noindex` and the `/` → `/tags` redirect; layout with nav "Reported photos" and "Tags"; `/tags` shows
  `listRecentTags()` in a table (status, live or not, suburb, street, operator, problem, created, expires).
  `.env.example`.
- **Accept:** `pnpm dev` starts both apps; admin `/tags` lists the seeded tags; admin passes axe.
- **Files:** `apps/admin/{package.json,tsconfig.json,next.config.ts,postcss.config.mjs,.env.example}`,
  `app/{layout.tsx,globals.css}`, `app/tags/page.tsx`, `app/reports/page.tsx` (empty-state heading only),
  `packages/shared/src/format.ts` (`dateTime`).
- **Verify:** `pnpm dev`, open `localhost:3001/tags`.
- **Depends:** 1.3.

#### Task 1.8 — Test harness: Playwright, axe, Lighthouse, perf sizes (M)
- **Does:** root `playwright.config.ts` (projects `iphone`, `pixel`, `desktop`; `webServer` array starting web on
  3000 and admin on 3001 with `DATABASE_URL` = `iwb_e2e`, each checked on a page that doesn't read the database,
  because Playwright starts them before global setup; `workers: 1`, because the tests share one database and
  one IP), `e2e/global-setup.ts` (`prisma migrate deploy` of `iwb_e2e`, as in task 1.3; its teardown reloads the seed
  for Lighthouse), root `tsconfig.json` for `e2e/`, `e2e/support.ts` (`sql()` via `pg`, `resetDb()` =
  truncate + `seed.sql`, `expectNoAxeViolations(page)` with tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`,
  `wcag22aa`, failing on any violation whatever its impact), `e2e/pages.spec.ts` (list, tag page, empty state,
  text pages, 404, each with axe), `e2e/admin.spec.ts` (admin tags + axe), `e2e/perf.spec.ts` (on `/` and
  `/list`: JavaScript transferred ≤ 150 KiB (reset at M0) and fonts = 2 files ≤ 60 KB, from `request.sizes()`),
  `lighthouserc.json` (`/` and `/list`, mobile preset, 3 runs, `startServerCommand`, assertions on the median run
  LCP ≤ 2500 ms, CLS ≤ 0.1, TBT ≤ 200 ms, upload to filesystem only).
- **Accept:** `pnpm e2e` passes on all three projects; `pnpm lhci` passes; a deliberately added axe violation
  fails the run (checked once, then removed).
- **Files:** `playwright.config.ts`, `lighthouserc.json`, `tsconfig.json`, `e2e/{global-setup,support}.ts`,
  `e2e/{pages,admin,perf}.spec.ts`.
- **Verify:** `pnpm build && pnpm e2e && pnpm lhci`.
- **Depends:** 1.5, 1.6, 1.7.

#### Task 1.9 — CI workflow and M0 measurement (S)
- **Does:** `.github/workflows/ci.yml` on `pull_request` (any base, so stacked PRs run) and `push` to `main`, with a
  concurrency group. Job `check`: `pnpm install --frozen-lockfile`, `pnpm db:up`, `pnpm lint`,
  `pnpm typecheck`, `pnpm test`. Job `e2e`: `pnpm db:up`, Playwright browsers cached by version and installed
  with `--with-deps chromium webkit`, `pnpm build`, `pnpm e2e`, `pnpm lhci` (after the E2E run, against the same
  migrated and seeded `iwb_e2e` database), upload the Playwright report and
  `.lighthouseci/` on failure. Then measure the bare build (LCP, CLS, TBT, pre-map JS, fonts) and either confirm the
  §11.1 numbers or reset the constants in `perf.spec.ts` and `lighthouserc.json` with a comment citing the
  measurement.
- **Accept:** both jobs green on the PR; measurements and pinned versions recorded in the PR description.
- **M0 result (2026-11-09, local production build, Lighthouse mobile preset, median of 3):** `/` LCP 758 ms,
  CLS 0, TBT 49 ms; `/list` LCP 608 ms, CLS 0, TBT 50 ms, so those budgets stand. Fonts: 2 files, 34,732 B.
  JavaScript: 138,644 B gzipped, all of it Next and React, so its gate was reset in task 1.8 (see §5).
- **Files:** `.github/workflows/ci.yml`, possibly `e2e/perf.spec.ts`, `lighthouserc.json`.
- **Verify:** the PR's checks are green.
- **Depends:** 1.8.

**Browser verification — PR 1.** Run `pnpm db:up && pnpm db:reset && pnpm build && pnpm start`.

Phone (390×844, touch):
1. `/`: night header with headstone icon, the name, "Why this page exists" top right; reserved map frame; sheet
   with the `Map | List` toggle. No horizontal scroll.
2. Tap "Why this page exists" → placeholder copy, clearly marked. Back.
3. Tap List → "14 bikes in the graveyard", rows grouped by suburb, each with pin, street, operator · problem and
   hours left. Footer links work.
4. Tap a row → its tag page. Open `/tag/00000000-0000-4000-8000-000000000000` → "This tag has gone".
5. Set the largest text size (or 200% zoom): nothing clipped; at 320 px wide, no horizontal scroll.

Desktop (1280×800, mouse and keyboard):
1. Tab through `/list` and a text page: a 3 px focus ring on every link, in order. Text column ≤ 70ch, centred.
2. `localhost:3001/tags` shows the seeded tags; Tab through the table and nav with a visible focus ring.

**Checkpoint after PR 1.** `pnpm verify` green locally and in CI; M0 measurements in the PR description; browser
checks done at both sizes; `tasks/todo.md` ticked.

---

### PR 2 — `build/02-browse-map` (M1)

**Goal.** Browsing works end to end. The map page paints a static council preview, then loads MapLibre after first
paint with the self-hosted tiles and the Overworld style (patterns, grey dithered outside, gold wall, Atkinson
labels). Live tags arrive from `GET /api/tags` as focusable pixel-pin buttons; tapping one opens the tag card in the
sheet, which can be shrunk by tap or flick; overlapping pins open a chooser. Zoom and Move map buttons replace every
gesture. At 768 px and wider the sheet becomes the 380 px side panel with the tag list. If the map can't load, the
list is offered. The NSW boundary, suburb and street data and `where()` land here because the mask and the card need
them.

#### Task 2.1 — NSW boundary, suburb and street data, and `where()` (L)
- **Does:** `packages/shared/scripts/fetch-nsw.ts`, a TypeScript port of the research `fetch_geo.py` (NSW Spatial
  Services ArcGIS REST, paging 2,000, retries): council (`NSW_Administrative_Boundaries_Theme` layer 8,
  `lganame='INNER WEST'`), suburbs (layer 2) and **all** road segments (`NSW_Transport_Theme` layer 5, every
  `functionhierarchy`; the research run fetched only major roads) inside the council bbox padded by 2 km, into
  `data/raw/` (git-ignored). `scripts/build-data.ts`: `@turf/buffer` 20 m → `council-buffered.json`;
  `council.json` with the true boundary, the bbox, the padded `maxBounds` box (2 km north and south, 4 km east and
  west, because MapLibre keeps the whole view inside it and a 1920 × 1080 screen needs that width to show all the
  council: about 151.069, −33.952 to 151.240, −33.828), the **mask** polygon (outer ring = padded box, hole =
  council ring, wound correctly; a test checks signed areas) and a label point for each suburb at least a quarter
  inside the council (the tiles carry suburb names only from zoom 12, and MapLibre fits the whole council on a phone
  at about 11.7, so the map names suburbs from this list); `places.json` with the suburbs that intersect the buffered polygon (including neighbours
  that only touch the buffer) and named road segments inside it (open and not in a tunnel, so a bike above the
  WestConnex tunnels gets the street on top), titled and abbreviated as in `process_geo.py` (Street → St, Road → Rd,
  …), each street's segments joined end to end, simplified at about 2 m with coordinates at 6 dp. `src/geo.ts`: `where(lat, lng)`
  returns `{ inside, suburb, street }`, inside by `booleanPointInPolygon` on the buffered polygon, suburb by
  point-in-polygon (or the nearest suburb, for the metre-wide slivers that simplifying each suburb leaves between
  them), street by nearest segment in local metres.
- **Accept:** `where.test.ts` passes for a point on Llewellyn St (inside, Marrickville, Llewellyn St); the far
  footpath of King St opposite the boundary (inside, Newtown); a point 30 m outside the buffer (outside); a point on
  Parramatta Rd's midline (inside). The suburb list contains the 17 wholly-inside and 9 partly-inside suburbs of
  §4.1. File sizes recorded in the PR (`places.json` gzipped target ≤ 100 KB; if over, raise the simplification
  tolerance, never drop streets).
- **Files:** `packages/shared/scripts/{fetch-nsw,build-data}.ts`, `data/{council,council-buffered,places}.json`,
  `src/geo.ts`, `src/geo.test.ts`, `package.json` (scripts `data:fetch`, `data:build`).
- **Verify:** `pnpm --filter @iwb/shared data:fetch && pnpm --filter @iwb/shared data:build && pnpm --filter @iwb/shared test`.
- **Depends:** 1.2. Reference inputs: the research scripts and raw files listed in the brief (optional cross-check).

#### Task 2.2 — Tiles: fetch, local serving, CI cache (S)
- **Does:** `apps/web/scripts/fetch-tiles.sh`: `pmtiles extract https://build.protomaps.com/20261108.pmtiles
  public/tiles/inner-west.pmtiles --bbox=<padded box> --maxzoom=15`; fails loudly with "bump the pinned build" if
  the source is gone. Root script `pnpm tiles`. `NEXT_PUBLIC_TILES_URL` defaults to `/tiles/inner-west.pmtiles`.
  The box is `council.json`'s `maxBounds`, read by the script. CI `e2e` job: cache `apps/web/public/tiles` keyed on
  `hashFiles('apps/web/scripts/fetch-tiles.sh', 'packages/shared/data/council.json')`; on a miss, install the
  go-pmtiles v1.31 Linux release binary and run the script.
- **Accept:** the file is about 9.7 MB (measured: 13,035,057 B from build `20261108` with the wider box of 2.1); `curl -s -r 0-126 -o /dev/null -w '%{http_code}'
  localhost:3000/tiles/inner-west.pmtiles` prints `206` under `next start` (if not, serve tiles with a 15-line
  range-capable route handler and note why); the CI cache hits on the second run.
- **Files:** `apps/web/scripts/fetch-tiles.sh`, `package.json`, `.github/workflows/ci.yml`.
- **Verify:** `pnpm tiles && pnpm build && pnpm start` and the curl above.
- **Depends:** 1.9.

#### Task 2.3 — Overworld style: base layers and labels (M)
- **Does:** `apps/web/map/style.ts` builds the MapLibre style in code against the Protomaps v4 tile schema
  (layers `earth`, `water`, `landuse`/`landcover` parks, `roads` by kind with brown casing and sandy fill, `transit`
  rail dashed, `places` suburb labels in ink with a 2 px white halo, `roads` street labels in white label boxes),
  using `palette.ts`. Source `pmtiles://<TILES_URL>` with `maxzoom: 15` (above 15 MapLibre overzooms). Label layers
  filtered with `["within", councilBuffered]`. Glyphs: generate Atkinson Hyperlegible Regular and Bold PBFs for
  range 0–255 once (`cargo install build_pbf_glyphs`, or MapLibre's font-maker) and commit them to
  `public/glyphs/<fontstack>/0-255.pbf`; record the command in the README. Labels 13–16 px, bold where needed;
  no `pixelRatio` override.
- **Accept:** at zoom 16 street names render in Atkinson Hyperlegible at device resolution; nothing outside the
  council is labelled except streets on the boundary; no glyph 404s.
- **Files:** `apps/web/map/style.ts`, `public/glyphs/**`, `README.md`.
- **Verify:** `pnpm dev`, open `/`, inspect the network panel for glyph requests.
- **Depends:** 2.1, 2.2.

#### Task 2.4 — Map art: patterns, mask and council wall (M)
- **Does:** `apps/web/map/patterns.ts`: grass tufts, trees, and a 4×4 Bayer-dithered grey defined as ASCII sprites
  (from the mockup's `stamps`), turned into RGBA arrays and added with `map.addImage(id, image, { pixelRatio: 2 })`
  before the pattern layers; `fill-pattern` on land, parks and the mask. Mask layer from `council.json`'s mask
  polygon in greyscale with the dither pattern. Council wall from the true boundary: a dark `#1f2328` casing line
  under a gold line (assumption 12). Extend `contrast.test.ts` with every pattern colour.
- **Accept:** the council area is green with tufts and trees, the outside is dithered grey, the wall is gold with a
  dark edge; the council itself is not greyed (winding correct); the contrast test passes.
- **Files:** `apps/web/map/{patterns,style}.ts`, `packages/shared/src/{palette.ts,contrast.test.ts}`.
- **Verify:** `pnpm --filter @iwb/shared test`, then look at `/` at zooms 12, 14 and 16.
- **Depends:** 2.3.

#### Task 2.5 — Map screen: preview, lazy load, failure, controls (L)
- **Does:** `apps/web/scripts/build-preview.ts` renders an SVG of the council (land, grey outside, wall, dashed
  suburb lines) from the shared data and writes `public/preview.webp` (≈ 40 KB) with sharp; `dev` and `build` run it
  first. `components/MapScreen.tsx` (client): the preview `<img>` with fixed size and `fetchpriority="high"` plus a
  "Loading map…" status; after first paint, `import('@/map/MapView')`. `map/MapView.tsx`: one map,
  `maplibregl.addProtocol('pmtiles', …)`, `maxBounds`, `minZoom: 12`, `maxZoom: 18`, rotation and pitch off
  (`dragRotate`, `touchZoomRotate.disableRotation()`, `pitchWithRotate: false`), `fadeDuration: 0`, a modest
  `maxTileCacheSize`, `attributionControl: false`; `performance.mark('map-ready')` and `data-map-ready` on the
  container at the first `idle` after markers are added. Failure: constructor throws (no WebGL), style or tile
  `error`, or not ready after 15 s → keep the preview and show "The map couldn't load. Use the list instead." with a
  link. `map/MapControls.tsx`: + and − buttons; Move map opens four arrow buttons that `panBy` half the visible map;
  all 44×44 px, 8 px apart. The map region: labelled, a one-line summary ("Map of the Inner West with 14 tagged
  bikes. A list view is available.") and a skip link to the list. An "i" button opens a small panel with
  "© OpenStreetMap contributors", "© State of New South Wales (Spatial Services, DCS NSW), CC BY 4.0" and the
  Accessibility, Privacy and Terms links. Map padding follows the sheet height so camera moves centre in the visible
  area.
- **Accept:** LCP is the preview image; swapping in the map causes no layout shift; with tiles blocked the failure
  message appears and the List link works; a pin that starts off screen can be reached with Move map and zoom taps
  only.
- **Files:** `apps/web/scripts/build-preview.ts`, `components/MapScreen.tsx`, `map/{MapView,MapControls}.tsx`,
  `app/page.tsx`, `package.json`.
- **Verify:** `pnpm build && pnpm start`; Lighthouse on `/` via `pnpm lhci`.
- **Depends:** 2.4.

#### Task 2.6 — Live tags: `GET /api/tags`, refresh, count and legend (M)
- **Does:** `GET /api/tags` returns `{ tags: PublicTag[] }` from `listLiveTags()` with `Cache-Control: no-store`.
  `lib/use-live-tags.ts`: fetch on mount, when the tab becomes visible or regains focus, every 5 minutes while
  visible, and after the page's own writes (an exported `refresh()`); every minute drop tags with `isExpired`.
  JSON turns the two timestamps into strings, so `PublicTag` in `schemas.ts` becomes a Zod schema (`z.coerce.date()`
  for `lastConfirmedAt` and `expiresAt`, the type inferred from it) and `use-live-tags.ts` parses the response
  through it before any date logic runs.
  Sheet peek content: "N bikes in the graveyard", "Tags disappear 48 hours after the last sighting.", the operator
  key (`Legend.tsx` with `PinIcon` and counts).
- **Accept:** the count updates within one refresh after a tag is expired with SQL; the response for 100 tags is
  ≤ 15 KB gzipped (perf test inserts 100 tags with SQL); first paint never waits for this request. A unit test
  parses a JSON-serialised tag through `PublicTag` and gets `Date` objects back.
- **Files:** `app/api/tags/route.ts`, `lib/use-live-tags.ts`, `components/{Legend,MapScreen}.tsx`,
  `packages/shared/src/schemas.ts`.
- **Verify:** `pnpm e2e e2e/perf.spec.ts --project=pixel`.
- **Depends:** 2.5.

#### Task 2.7 — Pins: HTML markers, chooser, focus (M)
- **Does:** in `MapView`, one `maplibregl.Marker({ element, anchor: 'bottom' })` per live tag (at most 200, with the
  §11.3 `shortcut:` comment), rendered through `createPortal` with `PinIcon` inside a `<button>`. Accessible name
  from `format.ts`: "Lime e-bike, blocking footpath, Denison St, Newtown, disappears in 31 hours, at 3:40 pm
  Tuesday". Markers are inserted sorted by suburb then street, so tab order follows. Focusing a pin pans it into the
  visible map area. Tapping a pin whose centre is within 44 px of another opens `CrowdChooser` ("N bikes here") built
  from `TagRow`s. The selected pin bobs twice, only under `prefers-reduced-motion: no-preference`. Hover: pointer
  cursor and the focus outline only.
- **Accept:** every live tag is one focusable button; Enter opens its card; overlapping pins at zoom 12 open the
  chooser; no pin is drawn on the canvas.
- **Files:** `map/MapView.tsx`, `components/{CrowdChooser,PinIcon}.tsx`, `packages/shared/src/format.ts`.
- **Verify:** `pnpm e2e e2e/browse.spec.ts`.
- **Depends:** 2.6.

#### Task 2.8 — Sheet, tag card and desktop panel (L)
- **Does:** `Sheet.tsx`: below 768 px a white bottom sheet with heights peek / half / full set by what it shows, max
  height inside the header and safe areas, `overflow-y: auto`, `overscroll-behavior: contain`; at 768 px and wider
  a 380 px full-height left panel. `touch-action` on the map only; the page never scrolls while the map shows.
  `TagCard.tsx` (non-modal): `TagDetails` + Close at the top; focus moves to its heading on open; Esc or Close closes
  and focus returns to the pin; a handle button "Shrink card" / "Expand card" with `aria-expanded` that shrinks to
  one line ("Lime e-bike · Blocking footpath · Denison St"); a vertical pointer flick of ≥ 30 px that starts on the
  handle toggles on release; switch ≤ 200 ms, instant under reduced motion; while shrunk, other buttons are `inert`
  except the handle and Close; no handle at ≥ 768 px. Desktop panel: count, key, then `TagList` (rows scroll in the
  panel); clicking a row opens the card in the panel, pans to the pin and outlines it; Close returns to the list; no
  List toggle at this width. Landscape phones get the panel layout.
- **Accept:** card opens at half height on phones; shrink and restore by tap and by flick; scrolling the card's
  content never toggles it; at 1280×800 the panel shows the grouped list and opens cards in place.
- **Files:** `components/{Sheet,TagCard,MapScreen}.tsx`, `components/TagList.tsx`.
- **Verify:** `pnpm e2e e2e/browse.spec.ts`.
- **Depends:** 2.7.

#### Task 2.9 — Browse E2E, axe states and map perf gates (M)
- **Does:** `e2e/browse.spec.ts`: map loads; open a card by tap (phones) and by keyboard (desktop); shrink/restore
  by tap and flick (pointer events with `pointerType: 'touch'`); chooser; Move map reaches an off-screen pin;
  desktop row → card → Close; map-failed state (abort tile requests with `page.route`). axe on map, open card,
  chooser, map-failed. `perf.spec.ts` on `pixel` with CPU throttling ×4 and a 4G profile: map ready ≤ 6 s; first
  view ≤ 40 tile requests and ≤ 1.5 MB; map bundle (all JS after first paint, including the worker) ≤ 300 KB
  transferred; open a card and a zoom-button tap each ≤ 200 ms to next paint (Event Timing entries via
  `PerformanceObserver`); `/list` and `/tag/[id]` JS ≤ 150 KiB. Record the map-bundle measurement and confirm or
  reset its budget per §11.1.
- **Accept:** all green on three projects; measurements in the PR description.
- **Files:** `e2e/{browse,perf}.spec.ts`.
- **Verify:** `pnpm verify`.
- **Depends:** 2.8.

**Browser verification — PR 2.** Run `pnpm tiles && pnpm db:reset && pnpm build && pnpm start`.

Phone (390×844, touch):
1. Open `/`: the council preview appears at once with "Loading map…", then the map replaces it without a jump.
2. The map shows grass with tufts and trees inside, dithered grey outside, a gold wall with a dark edge, pixel pins
   with L/H/A/? letters. "14 bikes in the graveyard" and the operator key show in the sheet.
3. Pinch and double-tap to street level: street names are crisp and legible; a two-finger twist doesn't rotate.
4. Use + and −. Open Move map and reach a pin that started off screen with taps only.
5. Tap a pin: the card opens at half height with operator, problem, street, last seen, disappears-in and the timer
   bar. Tap the handle: it shrinks to one line; tap again: it restores. Flick the handle up and down: same.
   Scroll inside the card: it doesn't toggle. Close.
6. Zoom right out and tap overlapping pins: "N bikes here" lists them; choose one.
7. Tap List → `/list`; tap Map → back.
8. Block `*.pmtiles` in DevTools and reload: "The map couldn't load. Use the list instead."
9. Tap "i": both attributions and the three links.

Desktop (1280×800, mouse and keyboard):
1. The panel is on the left, 380 px, with count, key and the grouped list; the map fills the rest.
2. Click a row: its card opens in the panel, the map pans and outlines the pin. Close returns to the list.
3. Hover a pin or row: pointer and outline only.
4. Keyboard: skip link to the list works; Tab into the pins in suburb/street order, each panned into view; Enter
   opens the card with focus on its heading; Esc closes and focus returns to the pin.
5. Drag pans, wheel zooms; + / − and Move map work by keyboard.
6. Narrow the window below 768 px: the bottom sheet returns.

**Checkpoint after PR 2.** As PR 1, plus the map-bundle and tile measurements recorded and the budget confirmed
or reset with evidence.

---

### PR 3 — `build/03-tag-on-map` (M2, part 1)

**Goal.** A visitor can tag a bike on the map, and anyone can mark a tag Still there or Removed, on the card, the
list and the tag page. This PR builds the whole write path once (§1.4): visitor identity, BotID, rate limits in the
write transaction, safe retries, every tag lifecycle transition in one file (admin undo and take down included at
the domain level, with their tests), the browser's retry policy and the live-region announcements. The placement
step covers tap and the keyboard crosshair; the nearby-tag question and the form are modal dialogs.

#### Task 3.1 — Visitor identity and rate limits (M)
- **Does:** `proxy.ts` sets the `iwb_v` cookie (random 128-bit, base64url, HttpOnly, Secure, SameSite=Lax, one
  year) when missing, on the response and on the forwarded request (assumption 8). `packages/server/src/visitors.ts`:
  `visitorFrom(cookie, ip)` → `{ visitorHash, ipHash }` (assumption 9; IPv6 reduced to /64; today's salt from
  `daily_salts`, created with `INSERT … ON CONFLICT (day) DO NOTHING` and cached per process per day).
  `packages/server/src/limits.ts`: `countAction(tx, action, visitor, tagId?)` upserts one counter per `LIMITS` rule
  (`INSERT … ON CONFLICT (key) DO UPDATE SET count = rate_counters.count + 1 RETURNING count`, window start from
  Postgres) and throws `AppError('rate_limited', { retryAfter })` when any count passes its maximum.
- **Accept:** `limits.test.ts`: §5.5 two at once — six concurrent Removed counts for one visitor give exactly three
  successes; per-IP limits apply across different cookies; "1 per tag per 12 h" for Still there; `Retry-After`
  equals the seconds to the bucket end. Raw IPs never appear in the database or logs.
- **Files:** `apps/web/proxy.ts`, `packages/server/src/{visitors,limits,index}.ts`, `src/limits.test.ts`.
- **Verify:** `pnpm --filter @iwb/server test`.
- **Depends:** PR 2.

#### Task 3.2 — Tag lifecycle in one file (L)
- **Does:** in `packages/server/src/tags.ts`: `claimRequest`, `createTag` (Zod-checked input; `where()` from
  `@iwb/shared/geo` sets suburb and street and throws `outside_area`; `INSERT … ON CONFLICT (id) DO NOTHING
  RETURNING`; `created` event with `request_id` = tag id; `count('create')`), `confirmStillThere`
  (`last_confirmed_at = now()`, `expires_at = now() + 48 h`, `confirm_count + 1`), `markRemoved`, `undoRemoval`
  (`status = 'removed' AND expires_at > now()`; returns `expired` or `not_removed` reasons for the admin), `takeDown`
  (`status <> 'taken_down'`, final). Each per §1.4.
- **Accept:** `tags.test.ts` covers §5.5 expiry edges (Still there and Removed work one second before `expires_at`
  and change nothing one second after; undo refused after `expires_at`), two at once (two simultaneous Removed write
  one removal), repeats (create, Still there and Removed with the same ID return the first result with one event and
  one count), a repeat from another visitor → 409, Still there never adds time on top, undo returns only the time
  left, take down is final.
- **Files:** `packages/server/src/{tags,index}.ts`, `src/tags.test.ts`.
- **Verify:** `pnpm --filter @iwb/server test`.
- **Depends:** 3.1.

#### Task 3.3 — Write routes with BotID (M)
- **Does:** `lib/write.ts` (§1.4, `identify()`, `errorResponse()`), `lib/bot.ts` (`isBot()`: `checkBotId()` on
  Vercel, otherwise `false`, with a `shortcut:` comment), `instrumentation-client.ts` (`initBotId` protecting the five
  public POST routes), `withBotId` in `next.config.ts`, routes `POST /api/tags`, `POST /api/tags/[id]/still-there`,
  `POST /api/tags/[id]/removed`. Schemas `CreateTagBody` (`id` uuid, lat/lng rounded to 6 dp, active operator key,
  problem) and `ActionBody` (`requestId` uuid) in `schemas.ts`.
- **Accept:** route tests (Vitest, real Postgres, `vi.mock('@/lib/bot')`): a bot gets 403 and no database row is
  written; invalid JSON or fields → 400 with the error shape; outside the buffer → 422; a non-live tag → 410
  `tag_gone`; over a limit → 429 with `Retry-After`; every response has `Cache-Control: no-store`.
- **Files:** `apps/web/lib/{write,bot}.ts`, `instrumentation-client.ts`, `next.config.ts`,
  `app/api/tags/route.ts`, `app/api/tags/[id]/{still-there,removed}/route.ts`, `*.test.ts` beside the routes,
  `apps/web/vitest.config.ts`, `packages/shared/src/schemas.ts`.
- **Verify:** `pnpm --filter @iwb/web test`.
- **Depends:** 3.2.

#### Task 3.4 — Browser sending: IDs, retries, announcements (S)
- **Does:** `lib/send.ts`: `send(path, body)` with the request ID made once per user action and reused by every
  retry; retries network failures and 5xx, and 429 when `Retry-After` ≤ 30 s; at most three tries with backoff
  (0.5 s, 1.5 s); never other 4xx; returns `{ ok, data } | { ok: false, error }`. The tag form keeps its tag id until
  success, so a manual resubmit is also a repeat. `Announcer.tsx` exports `announce(text)` for the one polite live
  region. `use-live-tags` applies a write result optimistically and reconciles on the next refresh.
- **Accept:** `send.test.ts` (mocked `fetch`): retries 3× on network error then reports "Couldn't send. Check your
  connection and try again."; no retry on 400/409/410; waits for `Retry-After` on 429.
- **Files:** `apps/web/lib/{send,send.test,use-live-tags}.ts`, `components/Announcer.tsx`.
- **Verify:** `pnpm --filter @iwb/web test`.
- **Depends:** 3.3.

#### Task 3.5 — Placement step on the map (M)
- **Does:** "Tag a dumped bike" in the sheet (and panel) starts placement: zoom to 16 first if further out; the
  placement bar (not a dialog) reads "Tap the map where the bike is", then "Pin on Llewellyn St, Marrickville"
  from `where()` (loaded with `import('@iwb/shared/geo')`), with **Use this spot** and **Cancel**. Tapping or
  clicking places or moves the pin with its tip on the point; outside the buffer → "That spot is outside the Inner
  West. Tap inside the gold line." and no pin; a tap below zoom 16 follows assumption 20. Keyboard crosshair while
  the map has focus: arrows move the pin 10 m, Shift+arrows 50 m, Enter = Use this spot, Esc = Cancel (MapLibre's
  own keyboard panning is disabled during placement). The readback is announced.
- **Accept:** the pin lands exactly where tapped; keyboard-only placement works; the whole map stays usable.
- **Files:** `components/{Placement,MapScreen}.tsx`, `map/MapView.tsx`.
- **Verify:** `pnpm e2e e2e/tag-map.spec.ts`.
- **Depends:** 3.4.

#### Task 3.6 — Dialogs: "Is it one of these?" and the tag form (L)
- **Does:** `Dialog.tsx` on native `<dialog>` + `showModal()`: heading focused on open (`tabIndex=-1`), Cancel at
  the top, Esc closes, focus returns to the opener, positioned as the full-height sheet over a short untouchable map
  strip on phones and over the left panel at ≥ 768 px with the map dimmed; sized to the visual viewport.
  `TagFlow.tsx` owns the steps after a spot is chosen (match → form) and keeps the draft (operator, problem, tag id)
  across Change location. `MatchDialog.tsx`: when `nearbyTags()` finds live tags within 25 m, "Is it one of
  these?" with `TagRow`s; **Yes, this bike** → Still there on that tag, "Marked still there"; **No, it's another
  bike** → form. `TagForm.tsx`: chosen street with **Change location**, "Whose bike?" and "What's wrong?" as native
  radios in `fieldset`/`legend` styled as 44 px chips with a tick and tint, errors in text, **Cancel** and **Add to
  the map**. Success: close, "Tag added" announced, pin appears, count updates.
- **Accept:** nearby tags never block; Change location returns to placement and back with answers kept; Tab stays
  inside each dialog; the rest of the page is inert.
- **Files:** `components/{Dialog,TagFlow,MatchDialog,TagForm}.tsx`, `packages/shared/src/near.ts`.
- **Verify:** `pnpm e2e e2e/tag-map.spec.ts`.
- **Depends:** 3.5.

#### Task 3.7 — Still there and Removed on the card, list and tag page (S)
- **Does:** `TagActions.tsx` (client): "Is it still there?" with **Still there** (primary) and **Removed**, each
  sending one action; success announces "Marked still there" or "Removed" and updates the card; `tag_gone` announces
  "This tag has already gone" and drops the tag; `rate_limited` shows the message. Used in `TagCard`, on each `/list`
  row and on `/tag/[id]`.
- **Accept:** reading `/list` still works without JavaScript; actions work from all three places.
- **Files:** `components/{TagActions,TagCard,TagRow}.tsx`, `app/list/page.tsx`, `app/tag/[id]/page.tsx`.
- **Verify:** `pnpm e2e e2e/tag-map.spec.ts`.
- **Depends:** 3.6.

#### Task 3.8 — Tagging E2E and interaction perf (M)
- **Does:** `e2e/tag-map.spec.ts`: create → Still there → Removed by touch (`iphone`, `pixel`) and by keyboard
  (`desktop`); the nearby question both ways; outside rejection; Change location keeps answers; offline submit shows
  the error and keeps the form, then succeeds once online with one tag. axe on placement, match dialog, form, form
  errors. `perf.spec.ts`: pick a chip and open the form each ≤ 200 ms.
- **Accept:** green on three projects.
- **Files:** `e2e/{tag-map,perf}.spec.ts`.
- **Verify:** `pnpm verify`.
- **Depends:** 3.7.

**Browser verification — PR 3.** Run `pnpm db:reset && pnpm build && pnpm start`.

Phone (390×844, touch):
1. Zoomed out, tap "Tag a dumped bike": the map zooms to street level and the bar asks for a tap.
2. Tap a street: the pin's tip sits on the spot; the bar reads "Pin on …, …". Tap elsewhere: the pin moves.
3. Tap outside the gold line (beyond 20 m): a friendly message, no pin.
4. Place within 25 m of a seeded tag: "Is it one of these?". Choose "No, it's another bike" → form. Repeat and
   choose "Yes, this bike" → "Marked still there".
5. In the form pick Lime and Blocking footpath, tap Change location, move the pin, Use this spot: the answers are
   still selected. Add to the map → "Tag added", a new pin, count +1.
6. Open the new pin: Still there → disappears-in resets to 48 h. Removed → the pin goes.
7. Mark Removed on three more tags: the fourth shows the limit message.
8. Set DevTools offline, submit a new tag: "Couldn't send…" and the form keeps its answers. Go online, resubmit:
   exactly one new tag.
9. On `/list`, use Still there and Removed on rows.

Desktop (1280×800, mouse and keyboard):
1. Keyboard only: Tag a dumped bike, focus the map, arrows move the pin 10 m, Shift+arrows 50 m, Enter opens the
   next step, Esc cancels.
2. The form opens in the left panel as a modal; the map is dimmed; Tab stays inside; Esc closes and focus returns
   to "Tag a dumped bike".
3. Click to place, submit, and open the new tag's card.

**Checkpoint after PR 3.** As before; the §5.5 expiry, two-at-once and repeat tests for tags pass.

---

### PR 4 — `build/04-tag-without-map` (M2, rest)

**Goal.** Tagging never needs the map: Choose by street (street, then house number or nearest corner) and Use my
location work from the map screen and from `/list`, which still never loads MapLibre. Michael gets the admin Tags
screen with lookup, events, Undo removal and Take down. The hourly job route exists with its token check and the
retention steps (3 and 4), and `vercel.json` files are added. This PR closes M2.

#### Task 4.1 — House-number and corner data, and matching (L)
- **Does:** extend `fetch-nsw.ts` with address points from `NSW_Geocoded_Addressing_Theme_multiCRS` (AddressPoint
  layer; read the layer id from the service root; fields `address`, `housenumber`; `outSR=4326`; padded bbox).
  Extend `build-data.ts`: keep points inside the buffered polygon; split street and suburb from `address` using the
  known suburb names (longest suffix match) and normalise the street the same way as roads; "707/16" → "16"; keep one
  point per (street, suburb, number); write `addresses/<suburb-slug>.json` (`{ "Llewellyn St": [["12", lat, lng],
  ["12A", …], ["10-14", …]] }`) and a generated `addresses/index.ts` with one explicit `() => import('./x.json')`
  per suburb. Corners: where two differently named streets share a vertex (clustered within 15 m), ordered along each
  street's main axis → `picker.json` (`[{ street, suburb, corners: [[cross, lat, lng], …] }]`). `src/picker.ts`:
  `searchStreets(query)`, `cornersOf(entry)`, `loadAddresses(suburb)`, `matchHouseNumber(numbers, typed)`.
- **Accept:** totals close to §4.1's measurement (about 53,548 numbers on about 1,482 streets) are logged and
  recorded; `picker.json` ≤ 100 KB and the largest suburb file ≤ 40 KB gzipped; `picker.test.ts` covers §5.5 house
  numbers (12 matches 12, 12A and 10–14; an unknown number returns null).
- **Files:** `packages/shared/scripts/{fetch-nsw,build-data}.ts`, `data/picker.json`, `data/addresses/*`,
  `src/picker.ts`, `src/picker.test.ts`.
- **Verify:** `pnpm --filter @iwb/shared data:fetch && pnpm --filter @iwb/shared data:build && pnpm --filter @iwb/shared test`.
- **Depends:** PR 3.

#### Task 4.2 — Street picker on the map screen and on `/list` (M)
- **Does:** `StreetPicker.tsx` (modal `Dialog`, loads `@iwb/shared/picker` on open): a labelled search box over
  "Street, Suburb" entries (typed text never leaves the browser); then **House number** (input with
  `inputmode="numeric"`; no match → "We don't have number 12 on Llewellyn St. Try another number, or pick the
  nearest corner.") or **Nearest corner** (radio list "near Marrickville Rd" in order); then the readback
  "12 Llewellyn St, Marrickville" or "Near the corner of Llewellyn St and Marrickville Rd, Marrickville" with **Use
  this spot**. Inputs sit at the top with results beneath; the dialog follows `visualViewport` so the on-screen
  keyboard never covers them. From the placement step: "Choose by street", and on success the map centres there with
  the pin so it can be fine-tuned. `ListTagButton.tsx` on `/list`: "Tag a dumped bike" offers Use my location and
  Choose by street, then `TagFlow` without a map.
- **Accept:** the house number is never sent or stored; `/list` tagging loads no MapLibre (perf assertion); the
  readback is announced.
- **Files:** `components/{StreetPicker,ListTagButton,TagFlow,Placement}.tsx`, `app/list/page.tsx`.
- **Verify:** `pnpm e2e e2e/tag-no-map.spec.ts`.
- **Depends:** 4.1.

#### Task 4.3 — Use my location (S)
- **Does:** `LocateButton.tsx` in the placement step and in `ListTagButton`: asks for permission only on tap;
  `getCurrentPosition` once with `timeout: 10000`, `enableHighAccuracy: true`, `maximumAge: 0`; accuracy ≤ 50 m
  inside the buffer → propose the pin (map centres there; on `/list` the readback "Near Llewellyn St, Marrickville,
  accurate to about 15 metres" with **Use this spot**); worse than 50 m → centre with no pin and "Your location is
  only accurate to about 80 m. Tap where the bike is, or choose a street."; outside → "You're outside the Inner
  West. Tap the map or choose a street."; refused or timed out → a plain message. Nothing submits automatically and
  the position is never sent except as the confirmed pin.
- **Accept:** §5.5 Use my location in Playwright (`context.setGeolocation`, granted and denied permissions): an
  accurate inside position proposes a pin; rough, outside and refused leave no pin and the other ways work.
- **Files:** `components/{LocateButton,Placement,ListTagButton}.tsx`, `e2e/tag-no-map.spec.ts`.
- **Verify:** `pnpm e2e e2e/tag-no-map.spec.ts`.
- **Depends:** 4.2.

#### Task 4.4 — Admin Tags screen (M)
- **Does:** `apps/admin/lib/action.ts` (§1.4). `/tags`: recent tags and recent removals; a lookup box that accepts a
  tag id or a pasted `/tag/<id>` URL. `/tags/[id]`: the tag, its events (type, time, shortened hashes) and, per
  hash, the number of actions that hash made that day (`countActionsByHashOnDay` in `tags.ts`). **Undo removal**
  (shown while `status = 'removed'`; an expired one shows "Expired, can't undo") and **Take down** (with a
  confirmation step, final) as form posts to `POST /api/tags/[id]/undo` and `/take-down`. A skipped-unless-configured
  `e2e/admin-access.spec.ts` that asserts an unauthenticated request to `ADMIN_PREVIEW_URL` is refused.
- **Accept:** a cross-origin POST is rejected; undo makes the tag live again with only its remaining time; admin
  pages pass axe.
- **Files:** `apps/admin/lib/action.ts`, `app/tags/page.tsx`, `app/tags/[id]/page.tsx`,
  `app/api/tags/[id]/{undo,take-down}/route.ts`, `components/*`, `packages/server/src/tags.ts`,
  `e2e/{admin,admin-access}.spec.ts`.
- **Verify:** `pnpm e2e e2e/admin.spec.ts --project=desktop`.
- **Depends:** PR 3 (`undoRemoval`, `takeDown` in 3.2).

#### Task 4.5 — Hourly job route, retention steps, `vercel.json` (S)
- **Does:** `GET /api/cron/hourly`: `Authorization: Bearer <CRON_SECRET>` compared with `timingSafeEqual`, else
  401 and nothing runs; no BotID. `hourly.ts` `runHourly()` runs each step in a `try`, collects errors and returns a
  summary; in this PR step 3 (`clearOldHashes` in `visitors.ts`: null both hashes in `tag_events` and
  `photo_reports` older than 30 days, only where not already null) and step 4 (`deleteOldCounters` in `limits.ts`,
  `deleteOldSalts` in `visitors.ts`, older than 48 h). `apps/web/vercel.json`: `{"regions": ["syd1"], "crons":
  [{"path": "/api/cron/hourly", "schedule": "0 * * * *"}]}`; `apps/admin/vercel.json`: `{"regions": ["syd1"]}`.
  `CRON_SECRET` in `lib/env.ts` (local default `dev-cron-secret`) and `.env.example`.
- **Accept:** §5.5 access: 401 without or with a wrong token; §5.5 hourly job twice: two runs in a row and two at
  once (`Promise.all`) leave the same rows as one run.
- **Files:** `app/api/cron/hourly/route.ts` (+ test), `packages/server/src/{hourly,visitors,limits}.ts`,
  `src/hourly.test.ts`, `apps/*/vercel.json`, `apps/web/.env.example`, `lib/env.ts`.
- **Verify:** `pnpm --filter @iwb/server test && pnpm --filter @iwb/web test`.
- **Depends:** PR 3.

#### Task 4.6 — M2 exit E2E (M)
- **Does:** `e2e/tag-no-map.spec.ts` and `e2e/admin.spec.ts`: create → confirm → remove → admin undo, by touch, by
  keyboard, by Use my location, and by Choose by street with no map (house number and corner), across the projects.
  At an SE-sized viewport (375×667) with `html { font-size: 200% }`, the form's Add to the map and Cancel can be
  scrolled to and pressed. axe on the street picker in each step and on admin tags. `perf.spec.ts`: picker data
  ≤ 100 KB and one suburb's numbers ≤ 40 KB, each loaded only when needed.
- **Accept:** green on three projects; M2 exit criteria in §15 that can run here are all covered.
- **Files:** `e2e/{tag-no-map,admin,perf}.spec.ts`.
- **Verify:** `pnpm verify`.
- **Depends:** 4.2–4.5.

**Browser verification — PR 4.**

Phone (390×844, touch):
1. Tag a dumped bike → Choose by street → type "llew" → "Llewellyn St, Marrickville" → House number "12" →
   "12 Llewellyn St, Marrickville" → Use this spot: the map centres there with the pin; continue to the form.
2. Type number 9999: the "We don't have number 9999…" message, no pin.
3. Choose Nearest corner: cross streets in order; pick one; readback names the corner.
4. With the on-screen keyboard open, the search box, number box and results stay visible.
5. Use my location (DevTools sensors on desktop Chrome in device mode, or a real phone): accurate → pin proposed;
   rough (80 m) → message and no pin; a CBD position → "You're outside the Inner West…"; permission blocked →
   plain message, other ways work.
6. On `/list`: Tag a dumped bike → Choose by street → form → "Tag added". Network panel shows no MapLibre.

Desktop (1280×800, mouse and keyboard):
1. Street picker by keyboard only: type, arrow/Tab through results, choose, Enter.
2. Admin `localhost:3001/tags`: recent tags and removals; paste a tag URL into lookup; the detail shows events and
   same-day counts. Undo removal on a removed tag → it reappears on the public map after refresh. Expire a removed
   tag with SQL → "Expired, can't undo". Take down → confirm → gone for good.
3. `curl -i localhost:3000/api/cron/hourly` → 401; with `-H "Authorization: Bearer dev-cron-secret"` → 200 and a
   summary.

**Checkpoint after PR 4.** As before; M2's automated exit criteria pass; the remaining M2 criteria are in Left for
Michael.

---

### PR 5 — `build/05-photos` (M3, part 1)

**Goal.** A visitor can add one photo to the tag they created. The tag is saved first and the photo after it; a
failed photo can be retried on its own. Photos are resized in the browser, validated and re-encoded on the server,
stored in a private Blob store (a local folder in dev), and streamed only while visible and the tag is live. The
hourly job deletes photos whose tag has expired and sweeps orphan files; Take down deletes the photo at once.

#### Task 5.1 — Blob seam (S)
- **Does:** `packages/server/src/blob.ts`: `putFile(path, bytes, contentType)`, `getFile(path)` (stream or `null`),
  `deleteFiles(paths)`, `listFiles()` (`{ path, uploadedAt }[]`). With `BLOB_READ_WRITE_TOKEN`, use `@vercel/blob`
  with `access: 'private'` (confirm the private read call in the Vercel Blob private-storage docs linked from the
  spec); without it, a folder at `LOCAL_BLOB_DIR` (default `<repo>/.data/blob`, resolved as `../../.data/blob` from
  each package's working directory). `env.ts` requires the token on Vercel.
- **Accept:** `blob.test.ts` round-trips put/get/list/delete on the local folder; `deleteFiles` on a missing path
  succeeds.
- **Files:** `packages/server/src/{blob,env}.ts`, `src/blob.test.ts`, `.gitignore`.
- **Verify:** `pnpm --filter @iwb/server test`.
- **Depends:** PR 4.

#### Task 5.2 — Image pipeline and bad-image tests (M)
- **Does:** `apps/web/lib/image.ts` `processPhoto(file: File)`: reject `content-length` or `file.size` over 4 MB
  (`too_large`); check magic bytes (JPEG `FF D8 FF`, PNG signature, `RIFF….WEBP`) and ignore the declared type;
  reject bytes after the end marker (JPEG `FF D9`, PNG `IEND`, RIFF size) as a polyglot (assumption 24); decode with
  `sharp(buf, { limitInputPixels: 50e6, failOn: 'warning', autoOrient: true })`; full = max 1600 px WebP q75; thumb
  = 320 px WebP; return buffers, width, height, bytes. Any sharp error → `bad_image`.
- **Accept:** `image.test.ts` (fixtures generated in the test with sharp) covers §5.5 bad images: oversized, wrong
  magic bytes, truncated, a decompression bomb (a 20,000 × 20,000 single-colour PNG), and polyglots (JPEG + appended
  ZIP or HTML) are all rejected; a valid JPEG with EXIF GPS comes out as WebP with no metadata.
- **Files:** `apps/web/lib/{image,image.test}.ts`, `apps/web/package.json`.
- **Verify:** `pnpm --filter @iwb/web test`.
- **Depends:** 5.1.

#### Task 5.3 — Attach rule and photo route (M)
- **Does:** `photos.ts` `attachPhoto({ tagId, visitor, image })`: if the tag already has a photo and the visitor is
  its creator (the `created` event's hash) → return it (repeat, no count); another visitor → `not_allowed`; tag not
  live → `tag_gone`; uploads paused (`site_state`) → `uploads_paused`. Otherwise write both files under random UUID
  paths, then in one transaction `countAction('photo')` and `INSERT … SELECT … WHERE` the tag is live, created by this
  visitor and uploads aren't paused `ON CONFLICT (tag_id) DO NOTHING RETURNING`; on any failure delete both files.
  `uploadsPaused()` lives here. `POST /api/tags/[id]/photo` uses `write()` with `request.formData()` and
  `processPhoto`. `PublicTag.photo` = `{ id, width, height }` only while `visible`. `GET /api/tags` becomes
  `{ tags, uploadsPaused }`, and `/list` passes `uploadsPaused()` to its tagging flow as a prop.
- **Accept:** `photos.test.ts` covers §5.5 photo attach (refused for another visitor, a tag that isn't live, a second
  photo, and while paused) and §5.5 outside failures for Blob (`vi.spyOn` makes `putFile` throw: tag saved, no row,
  no stray files); §5.5 repeats: a repeated upload returns the first photo with one count.
- **Files:** `packages/server/src/{photos,index}.ts`, `src/photos.test.ts`, `app/api/tags/[id]/photo/route.ts` (+ test),
  `packages/shared/src/schemas.ts`.
- **Verify:** `pnpm --filter @iwb/server test && pnpm --filter @iwb/web test`.
- **Depends:** 5.2.

#### Task 5.4 — Private serving routes (S)
- **Does:** `GET /photo/[id]` and `/photo/[id]/thumb` stream the file only when the photo is `visible` and its tag
  is live (one query in `photos.ts` using `LIVE` from `tags.ts`); otherwise 404. Headers `Content-Type: image/webp`,
  `Cache-Control: private, no-cache`, `X-Content-Type-Options: nosniff`.
- **Accept:** §5.5 photo and tag together, first half: the URL returns 404 once the tag is removed, expired or taken
  down, and 200 again after an undo while the photo is still visible.
- **Files:** `app/photo/[id]/route.ts`, `app/photo/[id]/thumb/route.ts` (+ tests), `packages/server/src/photos.ts`.
- **Verify:** `pnpm --filter @iwb/web test`.
- **Depends:** 5.3.

#### Task 5.5 — Photo in the form, card and tag page (M)
- **Does:** `PhotoInput.tsx` in `TagForm`: `<input type="file" accept="image/jpeg,image/png,image/webp">` behind a
  dashed "Add a photo (optional)" button; always re-encode through `createImageBitmap` + canvas `toBlob` (JPEG, max
  2048 px); preview; beside it "Photos are public. Leave out people, faces and number plates." with a link to
  `/terms`. Submit = create the tag, then attach the photo; if the photo fails: "Tag added, but the photo didn't
  upload" with **Try again** (photo only, same tag) and **Skip**. While uploads are paused the input is replaced by
  "Photos are switched off for now." Card and tag page: the 320 px thumbnail loads only when the card opens, with
  explicit width and height; tapping it opens the full size; alt text from `format.ts` ("Photo of a Lime e-bike
  reported as blocking the footpath"); a photo that 404s is replaced by text, never a broken image.
- **Accept:** the tag exists even when the photo fails; Try again attaches to the same tag; no layout shift when the
  thumbnail loads.
- **Files:** `components/{PhotoInput,TagForm,TagFlow,TagDetails}.tsx`, `lib/photo.ts`,
  `packages/shared/src/format.ts`.
- **Verify:** `pnpm e2e e2e/photos.spec.ts`.
- **Depends:** 5.4.

#### Task 5.6 — Photo deletion: hourly steps 1–2 and Take down (S)
- **Does:** `photos.ts` `deleteExpiredPhotos()` (step 1: mark every non-deleted photo whose tag's `expires_at` has
  passed as `deleted` with `RETURNING` paths, then delete the files), `sweepOrphanFiles()` (step 2: files older than
  an hour with no non-deleted row, assumption 16); both wired into `runHourly()` in order. `takeDown` and admin tag
  detail: taking a tag down marks its photo deleted, then deletes the files; admin tag detail shows the photo through
  an admin-only `GET /photo/[id]` route in `apps/admin` that streams any non-deleted photo with `Cache-Control:
  private, no-store`.
- **Accept:** §5.5 hourly job twice still holds with photos; a half-failed deletion (spy makes `deleteFiles` throw
  once) is finished by the next run; a taken-down tag's files are gone.
- **Files:** `packages/server/src/{photos,tags,hourly}.ts`, `src/hourly.test.ts`, `apps/admin/app/photo/[id]/route.ts`,
  `apps/admin/app/tags/[id]/page.tsx`.
- **Verify:** `pnpm --filter @iwb/server test`.
- **Depends:** 5.3.

#### Task 5.7 — Photo E2E (S)
- **Does:** `e2e/photos.spec.ts`: add a photo via `setInputFiles` (a JPEG generated in the test), see the thumbnail
  and full size; block the photo request with `page.route` → "Tag added, but the photo didn't upload" → unblock →
  Try again → attached; Skip leaves the tag without a photo; after Removed the photo URL is 404. axe on the form with
  a photo and on the failure state.
- **Accept:** green on three projects.
- **Files:** `e2e/photos.spec.ts`.
- **Verify:** `pnpm verify`.
- **Depends:** 5.5, 5.6.

**Browser verification — PR 5.**

Phone (390×844, touch):
1. Tag a bike; in the form tap "Add a photo (optional)" and choose an image (on a real phone: camera or library).
   The preview and the "Photos are public…" notice with the Terms link show.
2. Add to the map → "Tag added"; open the pin: the thumbnail appears without the card jumping; tap it for full size.
3. Block `/api/tags/*/photo` in DevTools, tag another bike with a photo → "Tag added, but the photo didn't upload".
   Unblock and tap Try again → attached. Repeat and tap Skip → tag without photo.
4. Copy the photo URL, mark the tag Removed, open the URL → 404.

Desktop (1280×800, mouse and keyboard):
1. Reach the photo input by keyboard, open the file picker with Enter, choose a file, submit.
2. Inspect the card image: alt text from the tag's fields, explicit width and height.
3. Admin tag detail shows the photo; Take down → the public and admin photo URLs both stop working.

**Checkpoint after PR 5.** As before; the §5.5 photo-attach, bad-image and Blob-failure tests pass.

---

### PR 6 — `build/06-moderation-launch` (M3 rest + M4 build work)

**Goal.** Anyone can report a photo; it stops loading from the next request and Michael is emailed (one email per
report for the first 10 a day, then the hourly digest, with failed sends retried). More than 15 reports in an hour
pause photo uploads until Michael resumes them. The admin Reported photos screen restores or deletes each photo, and
both admin screens carry the uploads switch. The PR closes with the launch documents: the deploy runbook,
the accessibility checklist, the eSafety response procedure and the final `.env.example` review.

#### Task 6.1 — Reports: rule, route and tests (M)
- **Does:** `reports.ts` `reportPhoto({ photoId, requestId, reason, visitor })`: `claimRequest` on the report row;
  `countAction('report')`; `UPDATE photos SET status = 'hidden', hidden_at = now() WHERE id = … AND status =
  'visible' AND NOT EXISTS (a report on it resolved as 'restored')`; a `deleted` photo → `photo_gone` (assumption
  14). `restorePhoto` (`hidden` → `visible`, open reports resolved `restored`) and `deletePhoto` (mark `deleted`,
  delete files, open reports resolved `deleted`) in `photos.ts`. `deleteExpiredPhotos` now also closes open reports as
  `expired`. `POST /api/photos/[id]/report` via `write()` with `ReportBody` (`requestId`, `reason`).
- **Accept:** §5.5 photo and tag together: report → remove → undo leaves the photo hidden; a restored photo isn't
  hidden by a later report (but the report is recorded); §5.5 repeats for reports (one row, one count); the photo URL
  is 404 on the very next request after a report.
- **Files:** `packages/server/src/{reports,photos,index}.ts`, `src/reports.test.ts`,
  `app/api/photos/[id]/report/route.ts` (+ test), `packages/shared/src/schemas.ts`.
- **Verify:** `pnpm --filter @iwb/server test && pnpm --filter @iwb/web test`.
- **Depends:** PR 5.

#### Task 6.2 — Email: per-report alerts, digest and retry (S)
- **Does:** `email.ts` `sendEmail(subject, text)`: with `RESEND_API_KEY`, `fetch('https://api.resend.com/emails')`
  from `ALERT_EMAIL_FROM` (default `onboarding@resend.dev`) to `ALERT_EMAIL_TO`, throwing on a non-2xx; without it,
  `console.info`. After a report commits: if it is one of the first 10 reports created today (UTC), claim it
  (`notified_at = now() WHERE notified_at IS NULL RETURNING`), send, and release on failure. Step 5 of `runHourly`:
  claim every unsent report, send one digest, release on failure. Emails link to the admin queue and contain no
  visitor data.
- **Accept:** §5.5 repeats: a repeated report sends no second email; §5.5 outside failures for Resend: a throwing
  send leaves the report saved with `notified_at` null and the next hourly run sends it in the digest; two
  overlapping hourly runs send one digest.
- **Files:** `packages/server/src/{email,reports,hourly,env}.ts`, `src/{reports,hourly}.test.ts`,
  `apps/web/.env.example`.
- **Verify:** `pnpm --filter @iwb/server test`.
- **Depends:** 6.1.

#### Task 6.3 — Circuit breaker and paused uploads (S)
- **Does:** inside `reportPhoto`'s transaction: if more than 15 reports were created in the last hour site-wide,
  `UPDATE site_state SET uploads_paused_at = now(), uploads_paused_reason = 'circuit breaker' WHERE
  uploads_paused_at IS NULL RETURNING` → after commit, email Michael once. `pauseUploads(reason)` and
  `resumeUploads()` in `photos.ts` (the form already reacts to `uploadsPaused`, task 5.5). Nothing resumes
  automatically.
- **Accept:** the 16th report in an hour pauses uploads and sends one email; a 17th sends no second email; attach is
  refused while paused; tagging without a photo still works.
- **Files:** `packages/server/src/{reports,photos,index}.ts`, `src/reports.test.ts`.
- **Verify:** `pnpm --filter @iwb/server test`.
- **Depends:** 6.2.

#### Task 6.4 — Report dialog (S)
- **Does:** a low-key "Report this photo" link on the card and tag page (only when a photo shows) opens
  `ReportDialog` (modal `Dialog`): the four reasons as radios, **Cancel** and **Report**. Success: the photo is
  replaced by text ("Photo hidden while we check it"), "Photo reported and hidden" announced.
- **Accept:** focus returns to the link's place (the card heading if the link is gone); axe clean.
- **Files:** `components/{ReportDialog,TagDetails,TagCard}.tsx`, `app/tag/[id]/page.tsx`.
- **Verify:** `pnpm e2e e2e/moderation.spec.ts`.
- **Depends:** 6.1.

#### Task 6.5 — Admin Reported photos and the uploads switch (M)
- **Does:** `/reports`: each photo with an open report, newest first: the photo (admin route), reasons with counts,
  total report count, and the tag with its recent events; **Restore** and **Delete** (confirm step) form posts. The
  uploads switch (status line plus **Pause uploads** / **Resume uploads**, with the pause reason and time) at the top
  of both `/reports` and `/tags`.
- **Accept:** restore makes the photo load publicly again; delete removes the files and resolves its reports; the
  switch reflects `site_state` on both screens; admin passes axe.
- **Files:** `apps/admin/app/reports/page.tsx`, `app/api/photos/[id]/{restore,delete}/route.ts`,
  `app/api/uploads/{pause,resume}/route.ts`, `components/UploadsSwitch.tsx`, `app/tags/page.tsx`.
- **Verify:** `pnpm e2e e2e/admin.spec.ts --project=desktop`.
- **Depends:** 6.3.

#### Task 6.6 — Moderation E2E and admin axe (S)
- **Does:** `e2e/moderation.spec.ts`: report on phone and desktop → photo replaced by text and its URL 404 →
  admin restores → visible again → report again → still visible; admin pause → form says photos are off → resume.
  axe on the report dialog, the hidden-photo state and every admin screen.
- **Accept:** green; every axe state listed in §10.6 is now covered somewhere in the suite.
- **Files:** `e2e/{moderation,admin}.spec.ts`.
- **Verify:** `pnpm verify`.
- **Depends:** 6.4, 6.5.

#### Task 6.7 — Launch documents and the deploy runbook (M)
- **Does:** `docs/launch.md` with two parts. **Deploy runbook**, in order: create Vercel projects `web` (root
  `apps/web`) and `admin` (root `apps/admin`) in `michael-lebot's projects`, Node 24.x, region `syd1` (from
  `vercel.json`); Neon through the Vercel Marketplace in Sydney (`aws-ap-southeast-2`), linked to both projects, with
  branch-per-preview on; web build command `DATABASE_URL=$DATABASE_URL_UNPOOLED pnpm --filter @iwb/server migrate:deploy
  && pnpm turbo run build --filter=@iwb/web`; Blob: a **public** store for tiles (upload `inner-west-<build>.pmtiles`
  with a one-year immutable cache, set `NEXT_PUBLIC_TILES_URL`) and a **private** photo store connected to both
  projects as `BLOB_READ_WRITE_TOKEN`; BotID with Deep Analysis on `web`; firewall rule `POST /api/*` 20 per 60 s per
  IP → 429; Resend account and API key (`RESEND_API_KEY`, `ALERT_EMAIL_TO`); `HASH_SECRET` and `CRON_SECRET`
  (random 32 bytes each); Vercel Authentication "All deployments" on `admin`; spend-management alert; Speed Insights
  check; domain later. Then the post-deploy checks: §11.2 PMTiles checks, `admin-access.spec.ts` against a preview,
  cron 401 in production. **Launch checklist**: every item in Left for Michael. `docs/accessibility-checklist.md`:
  the §10.6, §12 and §13 manual checks as a ticklist per milestone. `docs/esafety.md`: the §7 one-page response
  procedure, with an empty "Classification" section for Michael. Review every `.env.example` against `env.ts`
  files; update the README's Status section; re-read `/accessibility`, `/privacy` and `/terms` against what was
  built, then remove the "still being built" notice from `app/(text)/layout.tsx`.
- **Accept:** every environment variable read in code appears in exactly one `.env.example` and the runbook; no
  step in the runbook is needed for local dev or CI; the text pages no longer show the "still being built" notice.
- **Files:** `docs/{launch,accessibility-checklist,esafety}.md`, `apps/*/.env.example`, `README.md`,
  `app/(text)/layout.tsx`, `app/(text)/{accessibility,privacy,terms}/page.tsx` if copy changed.
- **Verify:** `grep -rhoE "env\.[A-Z_]+|NEXT_PUBLIC_[A-Z_]+" apps packages --include=*.ts | sort -u` compared with
  the `.env.example` files; `pnpm verify`.
- **Depends:** 6.6.

**Browser verification — PR 6.**

Phone (390×844, touch):
1. Open a tag with a photo → "Report this photo" → choose a reason → Report: "Photo reported and hidden"; the photo
   is replaced by text. Open the photo URL in another tab → 404.
2. Remove and undo (admin) that tag: the photo stays hidden.
3. With uploads paused from admin, open the form: "Photos are switched off for now."; tagging still works.

Desktop (1280×800, mouse and keyboard):
1. Admin `/reports` by keyboard only: the reported photo, its reasons and count, the tag and its events. Restore →
   the public photo loads again. Report it again from the public site → it stays visible; the server log shows the
   email.
2. Delete a reported photo → gone from public and admin; reports resolved.
3. Pause uploads, then Resume, from both screens.
4. Run a loop of 16 reports (script or SQL plus one real report) → uploads pause and one alert email is logged.
5. Read `/privacy`, `/terms`, `/accessibility`: they match the behaviour.

**Checkpoint after PR 6.** As before; every automated M3 exit criterion passes; `docs/launch.md` is complete;
everything else is in Left for Michael.

---

## 4. Traceability

**§5.5 tests → tasks.**

| §5.5 case | Task |
|---|---|
| Expiry edges (Still there, Removed, undo) | 3.2 |
| Two at once (rate limit; Removed) | 3.1, 3.2 |
| Repeats: create, Still there, Removed / photo / report (+ one email) | 3.2 / 5.3 / 6.1, 6.2 |
| Photo and tag together: 404 when not live / report → remove → undo / restored not re-hidden | 5.4 / 6.1 / 6.1 |
| Photo attach (other visitor, not live, second photo, paused, failure leaves no files) | 5.3 |
| Bad images | 5.2 |
| Outside failures: Blob / Resend | 5.3 / 6.2 |
| Access: hourly 401 / admin behind Vercel Authentication | 4.5 / 4.4 (spec written, run by Michael) |
| Hourly job twice | 4.5, extended in 5.6 and 6.2 |
| House numbers | 4.1 |
| Use my location (Playwright, mocked position) | 4.3 |

**CI gates → tasks.**

| Gate | Task |
|---|---|
| Lint, typecheck, Vitest with real Postgres, production build | 1.1, 1.3, 1.9 |
| Contrast unit test (§10.2, §10.6) | 1.2, extended 2.4 |
| axe on every page and state (§10.6): list, tag page, empty state, text pages, admin | 1.8 |
| … map, open card, chooser, map-failed | 2.9 |
| … placement, match dialog, form, form errors | 3.8 |
| … street picker, admin tags | 4.6 |
| … photo form and failure state | 5.7 |
| … report dialog, hidden photo, admin queue | 6.6 |
| Lighthouse CI: LCP, CLS, TBT (§11.4) | 1.8 |
| Playwright perf: JS before map, fonts | 1.8 |
| … map ready, first-view tiles and bytes, map bundle, open card, zoom, `/api/tags` size | 2.6, 2.9 |
| … pick a chip, open the form | 3.8 |
| … corner list and one suburb's house numbers | 4.6 |
| Playwright mobile projects for every flow (§12) | 1.8 onward |

---

## 5. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Next 16's App Router baseline alone exceeds the 120 KB pre-map JS budget | Fired | Measured at M0: Next 16.4.5 + React 19.3.1 transfer 138,644 B gzipped (118,598 B Brotli) with no client components. Per §11.1 the gate in `e2e/perf.spec.ts` was reset to 150 KiB gzipped; task 2.9 re-measures |
| MapLibre 5 + pmtiles + style data land just over 300 KB | Med | Task 2.9 measures; simplify `council.json` further for display; reset per §11.1 with evidence |
| Headless WebKit on Linux CI lacks WebGL, so the `iphone` project sees the map-failed state | Med | If so, run the iPhone 13 descriptor on Chromium for map flows and keep WebKit for the rest; note it in the PR |
| The pinned Protomaps build is removed | Low | Script fails with a clear message; bump the date; CI cache keeps working builds |
| Prisma's rust-free client with the `prisma-client` generator doesn't bundle under Turbopack | Med | Task 1.5 proves it with `next build && next start` reading Postgres; fallback is `prisma-client-js` with `@prisma/client` left in `serverExternalPackages` |
| BotID behaves differently off Vercel | Low | Seam treats non-Vercel as human; runbook verifies on a preview |
| `places.json` is too big to load at placement | Low | Measured in 2.1; raise simplification tolerance |
| Pattern fills look less game-like at native resolution (§4.1) | Low | Judged by Michael on real phones |

---

## 6. Left for Michael

These need a deployment, a real device, assistive-technology hardware, an account or a decision. The build prepares
each one; `docs/launch.md` repeats the list as a checklist.

- **Accounts and infrastructure (M0):** Vercel projects and region; Neon via the Marketplace; both Blob stores and
  the tiles upload; BotID Deep Analysis; the firewall rule; Resend and domain verification; `HASH_SECRET`,
  `CRON_SECRET`; Vercel Authentication on admin; spend alert; Speed Insights check; "empty apps deploy" and
  "Prisma migration runs on Neon".
- **On the deployment:** §11.2 PMTiles checks (206, CORS, cache headers, repeat requests from cache) on Safari 16.4
  and current Android Chrome; `e2e/admin-access.spec.ts` against a preview (§5.5 access); cron 401 in production.
- **Real devices (M1–M3):** the §11.1 budgets including "map ready" on a mid-range Android over throttled 4G; street
  names legible at zoom 16 on a 320 px phone; label and pin contrast judged on the real map on a phone; whether the
  pattern fills look game-like; the largest system text size, landscape and toolbar states on an SE-size iPhone, a
  current iPhone and a mid-range Android; the on-screen keyboard with the street picker; camera and library photos
  on iOS and Android, including HEIC conversion on current iOS; Use my location outdoors, allowed and refused; the
  map on Safari 16.4.
- **Assistive technology (every milestone, §10.6):** VoiceOver on iOS Safari and TalkBack on Android Chrome,
  including tagging start to finish by Choose by street and by Use my location, and reaching every pin;
  keyboard-only passes in Chrome, Safari and Firefox; touch without dragging; 200% zoom and 320 px.
- **Content and legal (M4):** the `/why` copy (§14.1); privacy and terms review; the eSafety classification in
  `docs/esafety.md`; the address-data licence confirmation (§14.4); the contact address.
- **Decisions:** operator report links (§14.2, not built); the domain (§14.3).
- **Launch sign-off (M4).**
