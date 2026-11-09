# Build checklist

Details, acceptance criteria and verification for every item are in `tasks/plan.md`. Tick an item only when its
acceptance criteria pass and `pnpm verify` is green.

## PR 1 — `build/01-foundation` (from `main`)

- [x] 1.1 Workspace and tooling (pnpm, Turbo, strict TS, ESLint import rules, Prettier, Docker Postgres 18)
- [ ] 1.2 Shared config, tokens and the contrast test
- [ ] 1.3 Database package: full §5.1 schema, initial migration, client, `LIVE`, seed, DB test setup
- [ ] 1.4 Web app shell: layout, header, fonts, proxy with nonce CSP and security headers
- [ ] 1.5 Read pages: `/list` and `/tag/[id]` (TagRow, PinIcon, TagList, TagDetails, Footer)
- [ ] 1.6 Text pages: `/why` (placeholder), `/accessibility`, `/privacy`, `/terms`
- [ ] 1.7 Admin app shell with the recent-tags table
- [ ] 1.8 Test harness: Playwright (3 projects), axe helper, Lighthouse CI, perf sizes
- [ ] 1.9 CI workflow; M0 measurements recorded, budgets confirmed or reset
- [ ] Checkpoint: CI green, browser verification at 390×844 and 1280×800, PR opened against `main`

## PR 2 — `build/02-browse-map` (from `build/01-foundation`)

- [ ] 2.1 NSW boundary, suburb and street data (fetch + build) and `where()`
- [ ] 2.2 Tiles: pinned extract script, local range serving, CI cache
- [ ] 2.3 Overworld style: base layers, labels, Atkinson PBF glyphs, `within` filters
- [ ] 2.4 Map art: pattern sprites, mask, gold wall with dark casing; contrast test extended
- [ ] 2.5 Map screen: preview image, lazy MapLibre, ready mark, failure fallback, zoom and Move map, "i" panel
- [ ] 2.6 Live tags: `GET /api/tags`, refresh hook, count and legend
- [ ] 2.7 Pins: HTML marker buttons, accessible names, tab order, focus pan, crowd chooser, bob
- [ ] 2.8 Sheet, tag card (handle, tap and flick) and desktop side panel
- [ ] 2.9 Browse E2E, axe states, map perf gates; map-bundle budget confirmed or reset
- [ ] Checkpoint: CI green, browser verification at both sizes, PR opened against `build/01-foundation`

## PR 3 — `build/03-tag-on-map` (from `build/02-browse-map`)

- [ ] 3.1 Visitor cookie and hashes; rate limits in Postgres (two-at-once test)
- [ ] 3.2 Tag lifecycle in `tags.ts`: create, still there, removed, undo, take down (expiry, two-at-once, repeat tests)
- [ ] 3.3 Write wrapper, BotID seam and the three tag write routes
- [ ] 3.4 Browser `send()` with retries, request IDs and announcements
- [ ] 3.5 Placement step: tap, readback, outside message, keyboard crosshair
- [ ] 3.6 Native dialog, "Is it one of these?", tag form with Change location
- [ ] 3.7 Still there and Removed on the card, `/list` and `/tag/[id]`
- [ ] 3.8 Tagging E2E (touch and keyboard), axe on dialogs, interaction perf
- [ ] Checkpoint: CI green, browser verification at both sizes, PR opened against `build/02-browse-map`

## PR 4 — `build/04-tag-without-map` (from `build/03-tag-on-map`)

- [ ] 4.1 House-number and corner data (multiCRS address points) and `matchHouseNumber` test
- [ ] 4.2 Street picker on the map screen and on `/list` (no MapLibre on `/list`)
- [ ] 4.3 Use my location with Playwright mocked-position tests
- [ ] 4.4 Admin Tags screen: lookup, events, same-day counts, Undo removal, Take down; admin-access spec
- [ ] 4.5 Hourly job route (401, steps 3–4, twice and concurrent), `vercel.json` for both apps
- [ ] 4.6 M2 exit E2E: create → confirm → remove → admin undo by touch, keyboard, location and street
- [ ] Checkpoint: CI green, browser verification at both sizes, PR opened against `build/03-tag-on-map`

## PR 5 — `build/05-photos` (from `build/04-tag-without-map`)

- [ ] 5.1 Blob seam (Vercel Blob private / local folder)
- [ ] 5.2 Image pipeline and bad-image tests
- [ ] 5.3 Attach rule and photo route (attach, repeat and Blob-failure tests); `uploadsPaused` in the API
- [ ] 5.4 Private serving routes (404 unless visible and live)
- [ ] 5.5 Photo input, two-step submit with Try again / Skip, thumbnail, full size, alt text
- [ ] 5.6 Hourly steps 1–2, Take down deletes the photo, admin photo route
- [ ] 5.7 Photo E2E
- [ ] Checkpoint: CI green, browser verification at both sizes, PR opened against `build/04-tag-without-map`

## PR 6 — `build/06-moderation-launch` (from `build/05-photos`)

- [ ] 6.1 Reports: rule, route, restore and delete; photo-and-tag-together tests
- [ ] 6.2 Email seam, first 10 a day, hourly digest (step 5), claim and release; Resend-failure test
- [ ] 6.3 Circuit breaker and pause / resume
- [ ] 6.4 Report dialog
- [ ] 6.5 Admin Reported photos screen and uploads switch on both screens
- [ ] 6.6 Moderation E2E and admin axe
- [ ] 6.7 `docs/launch.md` (deploy runbook + launch checklist), accessibility checklist, eSafety procedure, `.env.example` review
- [ ] Checkpoint: CI green, browser verification at both sizes, PR opened against `build/05-photos`

## After the build (Michael)

- [ ] Work through "Left for Michael" in `tasks/plan.md` §6, using `docs/launch.md`
