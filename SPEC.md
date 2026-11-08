# SPEC — Inner West Bikes (working title)

> Status: **draft for review** · Author: Michael Levot (with Claude) · 2026-11-09
> Source of decisions: product interview on 2026-11-09, plus four research passes (map stack, payments and cost APIs,
> abuse protection, share-bike operators). Sources are listed at the end.

## 1. What we're building

A no-login website showing a cute, 90s-video-game-style map of the **Inner West Council** area of Sydney. Anyone can
tap the map to tag a dumped or badly parked **share bike** (Lime, Hello, Ario), optionally with a photo.

- A tag disappears automatically **48 hours** after it was last confirmed.
- Other visitors can mark a tag **Still there**, which restarts the 48 hours, or **Removed**, which hides the tag
  straight away.
- Anyone can report a photo. It is hidden immediately and queued for the owner to restore or delete.
- The site shows its **weekly hosting cost** and lets visitors chip in. When contributions reach 100% of the week's
  cost, the button greys out and reads **"Costs covered by our generous community"**.
- A **"Why this page exists"** link leads to a page whose copy Michael will supply.

**Why now.** NSW's shared e-bike laws took effect on 14 August 2026. They let councils set parking rules and fine
operators that don't move bikes. Complaints are rising sharply: Snap Send Solve reports +931% in Marrickville. Yet
there's no public map just for dumped share bikes. Inner West Council tells residents to report bikes to the
operators, and has no reporting channel of its own.

## 2. Decisions from the interview

| Topic | Decision |
|---|---|
| Bike type | Share-scheme bikes and e-bikes only (Lime, Hello, Ario, plus "Other / not sure") |
| Who acts on tags | **Public visibility only** in v1. No operator or council integrations |
| Map realism | **Real streets and real street names, with a retro game skin**. Must be accurate enough to walk to |
| Placing a tag | **Tap the map** only. No GPS prompt, and no reading location from photos |
| Tag fields | Operator picker + problem pick-list + optional photo. **No free text** |
| "Removed" | Instant, but **rate-limited per visitor**. Every removal is logged so the admin can undo it |
| Photo screening | **Published instantly**. Community reports are the safety net; no automated scan |
| Report review | **Email alert + a protected admin page** |
| Hosting | New projects **inside StoryCraft's existing paid Vercel team and Neon org** |
| Cost figure | **Pulled automatically** from the providers' APIs |
| Contribution cycle | **Resets weekly** (Monday 00:00 Australia/Sydney) |
| Who gets paid | **Michael personally.** No ABN and no existing payment accounts |
| History | **Keep anonymous records** of expired and removed tags (location, operator, problem, times). Photos and visitor data are deleted |
| Domain | Michael will buy one. Use `*.vercel.app` until then |
| Repo | **Public**, under `michael-lebot` |
| Expected traffic | Under 100 visits a day at first |
| Mockups | Five distinct style directions (see §9) |

## 3. Core user flows

1. **Browse.** The map opens on the whole council area, with everything outside it greyed out and active tags shown as
   pixel pins. Each pin is coloured by operator and also carries a letter (L/H/A/?), so colour is never the only cue.
   Visitors can zoom down to street level.
2. **Tag a bike.**
   1. Tap "+ Tag a dumped bike". The map enters placement mode with a crosshair.
   2. Tap the spot. Taps outside the council are rejected with a friendly message.
   3. Pick the operator, pick the problem, optionally add a photo, then submit.
   4. If an active tag already exists within about 25 m, the app asks "Is it this one?" and offers **Still there** on
      that tag instead of creating a duplicate.
3. **Confirm.** Tap a pin to open a card showing the photo, operator, problem, suburb, "spotted Xh ago" and
   "vanishes in Yh". The card offers **Still there** and **Removed** buttons, and a **Report this photo** link.
4. **Report a photo.** Choose a reason. The photo is hidden for everyone at once, and Michael gets an email.
5. **Chip in.** The tracker shows "$X this week · N% covered". The button opens the contributions provider. At 100% it
   greys out and reads "Costs covered by our generous community".
6. **Admin (Michael).** Review the queue of reported photos and restore or delete each one. Review recent removals and
   undo any that were malicious. Glance at costs and contributions.

## 4. Functional requirements

### 4.1 Map

- **Engine:** MapLibre GL JS, with a self-hosted **Protomaps PMTiles** extract of OpenStreetMap.
  - The Inner West plus a 1–3 km buffer at zoom 0–15 is about **9.7 MB**.
  - Host it in a **public** Vercel Blob store, separate from the photo store.
  - There is no map API key, no vendor quota and no "is this commercial?" question.
  - Google Maps was considered and rejected:
    - Its styling can't change fonts or pixelate the map.
    - Its terms forbid restyling tiles beyond colours, caching, re-hosting, and using it alongside non-Google maps.
    - It would cost about US$140/month at 30K loads, against about $0 for PMTiles.
- **Retro look**, as prototyped in the mockups:
  - a custom MapLibre style with a 12–16 colour palette;
  - an open-licence pixel font for labels (as PBF glyphs, or a web font on MapLibre ≥ 5.11);
  - `pixelRatio: 0.5` with `image-rendering: pixelated` on the canvas, so the map draws at half resolution and is
    scaled up in hard pixels;
  - pixel-art PNG pins.

  **Risk:** label legibility on real phones. Labels need to be at least about 8 canvas pixels (about 16 CSS pixels).
  This is the first thing to prototype (milestone M1).
- **Mask:** a fill layer with a local rectangle as the outer ring and the council boundary as the hole. Check the ring
  winding, or MapLibre will grey out the council area too.
  - Grey with a dither pattern, to match the chosen direction.
  - Label layers are filtered with `within` so places outside the council don't get labels.
  - The boundary line is drawn from the same polygon.
- **Bounds:** `maxBounds` set to the padded extract box. Min zoom about 12, max zoom about 18; above zoom 15 the
  map enlarges the zoom-15 data.
- **Boundary data:** the NSW Spatial Services gazetted council polygon (`NSW_Administrative_Boundaries_Theme`, layer 8,
  `lganame='INNER WEST'`; 4,461 points, about 35 km², last modified 2026-02-04).
  - Ships as a static GeoJSON file in `packages/shared`.
  - Attribution: "© State of New South Wales (Spatial Services, DCS NSW)", CC BY 4.0.
  - Map data attribution: "© OpenStreetMap contributors".
  - Don't use the ABS statistical boundaries for validation; they drift up to about 760 m from the gazetted line.
- **Suburbs:** worked out by overlapping the NSW suburb polygons with the council polygon. This is used for the tag
  card's "Denison St, Newtown" style line, which we derive from the tap position with no geocoding API.
  - **Wholly inside (17):** Ashfield, Balmain, Balmain East, Birchgrove, Dulwich Hill, Enmore, Haberfield, Leichhardt,
    Lewisham, Lilyfield, Marrickville, Petersham, Rozelle, Stanmore, Summer Hill, Sydenham, Tempe.
  - **Partly inside (9):** Annandale 94%, St Peters 83%, Newtown 57%, Croydon 38%, Camperdown 28%,
    Hurlstone Park 9%, Croydon Park 7%, Ashbury 6%, Mascot 2%.
  - Street names come from the nearest named road segment, using the same NSW data bundled as a small lookup.
- **Inside-the-council check:** turf `booleanPointInPolygon` against the bundled polygon, run in the browser for
  instant feedback and again on the server as the rule that counts. PostGIS isn't needed in v1.
  - **Open:** add a ~20 m buffer for streets that form the boundary, such as King St and Parramatta Rd.
- **Accessibility:** a keyboard placement mode (arrow keys move the crosshair, Enter places the tag). Pins carry
  letters as well as colours. Bobbing and blinking animations respect `prefers-reduced-motion`.

### 4.2 Tags

- **Fields:** location (lat/lng, computed suburb, nearest street), operator, problem, optional photo, timestamps.
- **Operators:** Lime, Hello (HelloBike), Ario, Other / not sure. All three operate in the Inner West per the council
  page updated 2 October 2026. The list lives in config, so operators can be added or retired without a deploy.
- **Problems (pick-list):** Blocking footpath · Blocking ramp / driveway · Knocked over · In park or reserve ·
  In waterway · Damaged / vandalised.
- **Expiry:** `expires_at = last_confirmed_at + 48h`.
  - Reads filter on `status = 'active' AND expires_at > now()`, so tags vanish on time even if a scheduled job is late.
  - An hourly cron job marks them expired and deletes their photos.
- **Still there:** sets `last_confirmed_at = now()`, which resets the expiry to 48h from now; it never adds time on
  top. Limited to one per tag per visitor per 12h.
- **Removed:** sets `status = 'removed'` and hides the tag at once. The removal is logged with the visitor's hashed
  identifiers so the admin can undo it. Its photo is hidden at once and deleted after 7 days unless the tag is
  restored.
- **History:** expired and removed tags keep only location, suburb, operator, problem and timestamps. Event logs that
  hold hashed visitor identifiers are purged after 30 days.

### 4.3 Photos

- **In the browser:**
  - The file input uses `accept="image/jpeg,image/png,image/webp"`, which makes iOS convert HEIC to JPEG.
  - A canvas shrinks the photo to at most 2048 px before upload (about 1 MB).
  - **Verify on current iOS before launch.**
- **Server route** (multipart, through an API route, never uploaded straight to Blob):
  1. Reject anything over 4 MB.
  2. Check the magic bytes; ignore the Content-Type header.
  3. Decode with `sharp(buf, { limitInputPixels: 50e6, failOn: 'warning', autoOrient: true })`.
  4. Resize to at most 1600 px, save as WebP at quality ~75, and make a 320 px thumbnail. Re-encoding strips all EXIF
     and GPS data and defeats polyglot files.
  5. Store under random UUID paths in a **private** Vercel Blob store (needs `@vercel/blob` ≥ 2.3; a store's access
     mode can't be changed after creation).
- **Serving:** `/photo/[id]` and `/photo/[id]/thumb` check that the photo is visible in Postgres, then stream it with
  `Cache-Control: private, no-cache`. No Vercel image optimisation (`unoptimized`). The result is that a hidden photo
  stops loading on the very next request, and restoring it is just a status flip.
- **One photo per tag** in v1, uploaded when the tag is created. Allowing a fresh photo on "Still there" is out of
  scope.
- **Report reasons:** Not a share bike · Shows a person, face or number plate (privacy) · Offensive or inappropriate ·
  Other.

### 4.4 "Why this page exists"

- A static page at `/why`, linked from the header on every screen. Michael will supply the copy; launch is blocked
  until it arrives.

### 4.5 Hosting cost tracker and contributions

**Contributions provider — recommended: Ko-fi (free plan) paid out to a personal PayPal account.**
- Ko-fi takes 0% on one-off tips. PayPal's donation rate for non-charities is 2.9% + A$0.30 (+1% for overseas
  payers).
- No ABN or account is needed for donors. The page can be priced in AUD, and there's a tip panel or overlay embed.
- A webhook delivers `amount`, `currency`, `timestamp` and `kofi_transaction_id` for each payment.
- **Weaknesses:**
  - Ko-fi can't stop taking money once the week is covered; we can only grey out our button. That matches the brief.
  - The webhook is authenticated by a shared token rather than a signature.
  - Ko-fi doesn't document a retry policy.
  - **Mitigations:** constant-time token comparison, storing each transaction ID only once, and a weekly manual
    reconciliation against Ko-fi in admin.

**Runner-up: Stripe Checkout.**
- Lowest fees (1.65% + A$0.30 for Australian cards).
- The server can refuse payment or cap the amount once the week is covered, and webhooks are signed and retried.
- **Blocked:** Stripe's Australian policy "cannot support donations which are not linked to a specific good or
  service". Only build on Stripe if Stripe confirms in writing that tips for a free public map are acceptable.
- Rejected: Buy Me a Coffee (5% fee, USD base), GitHub Sponsors (donors need a GitHub account, USD only),
  Open Collective (no usable Australian host), Liberapay (no webhooks).

**Weekly cost (automatic):**
- **Vercel:** a daily cron job calls `GET /v1/billing/charges` (FOCUS v1.3 JSONL). It keeps rows whose `Tags` hold
  this project's ID and whose `ChargeCategory = Usage`.
  - It uses a token from a dedicated **Billing**-role user (free, read-only on projects, one per Pro team).
  - It re-pulls the last 7 UTC days each run, because usage arrives late, and the previous month on the 3rd.
- **Neon:** `GET /consumption_history/v2/projects`, hourly data for this project, priced at Launch rates:
  - US$0.106 per CU-hour
  - US$0.35 per GB-month of storage
  - **Requires a paid Neon plan; check StoryCraft's org plan.**
- **Other items:**
  - domain, spread evenly as annual cost × 7/365;
  - Resend ($0 while within its free tier);
  - BotID Deep Analysis (US$1 per 1K checks);
  - payment-processor fees on that week's contributions.
- **Currency:** convert USD with the RBA's daily rate. Prices live in a table with effective dates, so a price
  change never rewrites past weeks.
- **Formula:**
  `week = Σ Vercel_project + α · share_of_unused_Pro_credit + Neon_project + other_items`
  - α = 1 adds this project's share of whatever is left of the $20/month Pro credit after the team's usage.
  - α = 0 shows usage only. **Open decision; default α = 0** (honest marginal cost).
- **Rough estimate:** about A$1.50–4/week. That's mostly Neon compute (scale-to-zero, about 40–50 CU-hours/month),
  the domain, and BotID checks. The real figure comes from M4.

**What "100%" measures:** a week's cost isn't final until the week ends.
- The target is the larger of the **cost so far this week** and the **average of the last 4 completed weeks**, so the
  bar can't hit 100% on Monday morning by accident.
- The tracker reads "$X this week · N% covered", with N capped at 100.
- **Open:** what happens to any surplus. The suggestion is to show "Thanks! Extra goes to next week" and stay
  honest about it.

### 4.6 Admin

- A separate Next.js app (`apps/admin`), deployed as its own Vercel project with **Vercel Authentication on every
  deployment, including production** (free on all plans since 9 September 2026).
  - Michael signs in with his Vercel passkey and 2FA, so there's no login code to write.
  - The public app has **no** admin endpoints.
  - Both apps share the Neon database and the Blob stores.
- **Screens:**
  - **Reported photos:** photo, reasons, report count and tag, with Restore and Delete buttons.
  - **Removals log:** with Undo.
  - **Costs:** daily lines and weekly totals.
  - **Contributions:** list and reconciliation.
  - **Abuse dashboard:** top hashed visitors and IPs by action.
- **Email alerts (Resend):**
  - One email per report for the first 10 each day, then an hourly digest, so a flood can't use up the free tier
    (3,000/month, 100/day).
  - Until the domain is verified, send from `onboarding@resend.dev`, which can only email the account owner. That's
    fine, because Michael is the only recipient.
- **Circuit breaker:** if more than 15 reports arrive site-wide in an hour, pause new photo uploads and alert Michael.

## 5. Architecture

| Layer | Choice (mirrors StoryCraft where sensible) |
|---|---|
| Repo | Turborepo monorepo: `apps/web` (public), `apps/admin` (protected), `packages/db` (Prisma schema and client), `packages/shared` (Zod schemas, boundary GeoJSON, operator and problem config, cost formula) |
| Framework | Next.js 16 App Router, TypeScript strict, route handlers (no server actions), Tailwind 4 |
| Database | Neon Postgres in a **new project in StoryCraft's org**, region AWS ap-southeast-2 (Sydney), Prisma 6 |
| Functions | Vercel, **region `syd1`** (Vercel's default is Washington DC, iad1) |
| Storage | Vercel Blob: a **public** store for PMTiles and a **private** store for photos |
| Map | MapLibre GL JS + `pmtiles` protocol + custom pixel style |
| Bot defence | Vercel BotID (Basic free; Deep Analysis on) |
| Email | Resend |
| Contributions | Ko-fi webhook (see §4.5) |
| Tests | Vitest (unit and integration) + Playwright (end-to-end), as in StoryCraft |

### 5.1 Data model (first cut)

```
tags            id uuid · lat/lng numeric(9,6) · suburb · street · operator enum · problem enum
                status enum(active, removed, expired) · created_at · last_confirmed_at · expires_at
                removed_at · confirm_count
tag_events      id · tag_id · type enum(created, still_there, removed, restored, expired) · at
                visitor_hash · ip_hash            ← hashes purged after 30 days
photos          id uuid · tag_id (unique) · blob_path · thumb_path · width · height · bytes
                status enum(visible, hidden, deleted) · created_at · hidden_at · deleted_at
photo_reports   id · photo_id · reason enum · created_at · visitor_hash · ip_hash
                resolved_at · resolution enum(restored, deleted)
rate_counters   key (action:subject:window) PK · count · window_start
cost_lines      day · source enum(vercel, neon, domain, resend, botid, processor) · sku
                amount_usd · amount_aud · raw jsonb · fetched_at        unique(day, source, sku)
prices          provider · metric · unit_price_usd · effective_from
fx_rates        day PK · usd_aud
contributions   provider_txn_id PK · provider · amount · currency · amount_aud · fee_aud · received_at · raw
```

### 5.2 Endpoints (`apps/web`)

| Route | Notes |
|---|---|
| `GET /api/tags` | Active tags. Cached at the CDN under a `tags` cache tag and refreshed whenever a tag is created or changed. This keeps the database mostly asleep. The client hides tags locally as they pass `expires_at` |
| `POST /api/tags` | BotID → rate limit → Zod validation → inside-council check → duplicate check (~25 m) → insert |
| `POST /api/tags/:id/still-there` | BotID → rate limit → reset expiry |
| `POST /api/tags/:id/removed` | BotID → rate limit → soft remove and log |
| `POST /api/tags/:id/photo` | Accepted only within a few minutes of creating the tag, from the same visitor. Then the §4.3 pipeline |
| `GET /photo/:id[/thumb]` | Visibility check, then stream from the private store |
| `POST /api/photos/:id/report` | BotID → rate limit → hide → log → email |
| `GET /api/costs/week` | Current week's cost, contributions and % covered (cached for 5 minutes) |
| `POST /api/webhooks/kofi` | Token check → store each transaction once |
| `GET /api/cron/expire` (hourly) | Expire tags, delete photos due for deletion, purge old hashes |
| `GET /api/cron/costs` (daily, ~03:00 Sydney) | Vercel charges, Neon consumption, RBA exchange rate → `cost_lines` |

## 6. Abuse protection and privacy

**Layers:**
- BotID runs first on every write route.
- Then a Vercel WAF rule: at most 20 `POST /api/*` requests per 60 seconds per IP, else 429.
- Then per-action counters in Postgres, updated in the same transaction as the write
  (`INSERT … ON CONFLICT DO UPDATE … RETURNING count`).

**Starting limits** (to be tuned from real usage). The per-IP limits are about 3× the per-visitor limits, because many
mobile users share one IP.

| Action | Per visitor | Per IP | Extra |
|---|---|---|---|
| Create tag | 5/hour, 15/day | 40/day | Duplicate check within ~25 m |
| Upload photo | 1 per tag, 10/day | 25/day | Paused by the circuit breaker |
| Still there | 1 per tag per 12h, 30/day | 60/day | Resets to 48h; never adds time |
| Removed | 3/day | 8/day | Soft delete; admin can undo |
| Report | 5/day | 10/day | More than 15/hour site-wide: alert Michael and pause uploads |

**Visitor identity without accounts:**
- **Cookie:** a random 128-bit HttpOnly cookie (Secure, SameSite=Lax). Only a keyed hash of it is stored.
- **IP:** stored as HMAC-SHA256 with a daily salt (the /64 prefix for IPv6). Each salt is deleted after 48h, and raw
  IPs are never logged.
- **Retention:** all hashes are purged from events after 30 days.

**Other measures:**
- Security headers: strict CSP (map tiles from our own Blob domain only), `X-Content-Type-Options: nosniff`, and
  `Referrer-Policy: strict-origin-when-cross-origin`.
- All input is validated with Zod at the boundary.
- No user-generated text exists anywhere, by design.

## 7. Legal and content (not legal advice)

- **Terms:**
  - Photos must show share bikes; people and number plates must not be the subject.
  - Visitors grant a licence to display their uploads, and we may remove anything.
  - The site isn't affiliated with Lime, Hello, Ario, Inner West Council or Transport for NSW.
- **Privacy note:**
  - what we collect and how it's hashed;
  - how long it's kept (§4.2, §6);
  - providers and regions: Vercel `syd1`, Neon Sydney, Resend, Ko-fi/PayPal;
  - BotID's browser signals;
  - a contact address.

  The site is likely exempt from the Australian Privacy Principles (under $3M turnover) but should follow APPs
  1, 3, 5 and 11 anyway. The statutory privacy tort applies to everyone.
- **eSafety:**
  - Keep the report button and a monitored contact email, and be able to delete within hours. A removal notice must
    be met within 24h.
  - Keep a one-page self-assessment placing the site in the lowest risk tier (Tier 3).
- **Attribution:** © OpenStreetMap contributors (collapsible "i" button); © State of NSW (Spatial Services), CC BY 4.0.
- **Tax:** pure donations to an individual running a hobby site are generally not assessable income, per ATO
  crowdfunding guidance. Keep records, and check with an adviser if contributions regularly exceed costs.

## 8. Costs and limits (inside StoryCraft's teams)

- **No hard pauses.** The Hobby and Neon Free limits discussed in the interview don't apply.
- **Neon:**
  - compute about 40–50 CU-hours/month thanks to scale-to-zero and CDN-cached reads, roughly US$4–5/month;
  - storage well under 1 GB.
- **Vercel:**
  - functions and CDN usage are tiny at under 100 visits a day;
  - PMTiles requests (an estimated ~30 tiles per map load, to be measured) are covered by Pro's included CDN
    allowance;
  - watch team-wide CDN requests if traffic grows, because the included allowance is shared with StoryCraft.
- **Blob:** about 10 MB of tiles plus a few MB of live photos (they're deleted on expiry).
- **Other:** Resend $0. BotID Deep Analysis about US$0.30–2/month. Domain: `.com.au` or `.au`, about A$20–40/year
  (to confirm at purchase).

## 9. Visual direction — choose one

Five mockups were made with **real NSW boundary, suburb, road, rail and park data**. They're rendered at low
resolution and snapped to each palette, which is the same technique the production map would use. They're in
`docs/mockups/`, and each shows the council view and a street-level view with a selected tag and a covered tracker.

| # | Direction | One line | Main risk |
|---|---|---|---|
| 1 | **Overworld Quest** | 16-bit RPG world map, gold council wall, dialogue-box UI | Busiest palette; pins must stand out against the grass |
| 2 | **Pocket LCD** | Four-shade green handheld screen, dithered outside, segmented bars | Operators can't be colour-coded; the letter does the work |
| 3 | **Sim Council** | Isometric city-builder with pixel houses; cost tracker as the council "Budget" window | Tilt makes precise tapping and north-up reading harder |
| 4 | **Neon Arcade** | Glowing vector streets on black; "INSERT COIN" to contribute | Dark map is harder to read in bright sun |
| 5 | **Sunset Kart (Mode 7)** | Tilted view looking east to a pixel CBD; pins stand upright | Far pins shrink; needs a flat mode for precise tagging |

Directions 1, 2 and 4 are straightforward with MapLibre styling. Directions 3 and 5 rely on MapLibre's bearing and
pitch, and would flatten automatically in tag-placement mode.

## 10. Open questions

1. **Style direction:** which of the five, or a mix (for example, Overworld's map with LCD's restraint)?
2. **Product name and domain.** "Inner West Bikes" is a placeholder.
3. **Contributions:** go with Ko-fi + PayPal for v1, or first ask Stripe whether tips for a free public map are
   acceptable?
4. **Cost allocation:** α = 0 (marginal usage only) or α = 1 (include a share of the unused Pro credit)? And what
   should happen to any surplus?
5. **Neon org plan:** the consumption API needs Launch or above. Is StoryCraft's org on a paid plan?
6. **Boundary streets:** accept tags up to ~20 m outside the line (for example, the far footpath of King St)?
7. **Operator report links:** should the tag card show a "Report to Lime" contact link? It's still public-visibility
   only, but it helps the bike actually get moved.
8. **"Why this page exists" copy:** to be supplied by Michael; launch is blocked until then.

## 11. Milestones

| Milestone | Scope | Exit criteria |
|---|---|---|
| **M0 Infra** | GitHub repo; Turborepo skeleton; Vercel projects (`web`, `admin`) in StoryCraft's team, region `syd1`; Neon project (Sydney); Blob stores (public and private); Resend; CI (lint, typecheck, Vitest) | Empty apps deploy; Prisma migration runs on Neon |
| **M1 Map prototype** | PMTiles extract on Blob; chosen pixel style; mask; pixel font; pins; tested on real iPhone and Android | Street names legible at street zoom on a 390 px phone; tile requests per load measured |
| **M2 Tags** | Create, still-there, removed, expiry, duplicate check, BotID, rate limits, CDN cache and refresh | Playwright: create → confirm → remove → admin undo |
| **M3 Photos and moderation** | Upload pipeline, private serving, reports, email, admin queue, circuit breaker | Reported photo returns 404 on the next request; restore works |
| **M4 Costs and contributions** | Cost cron (Vercel, Neon, FX), prices table, Ko-fi webhook, tracker, 100% state | Tracker matches a hand-calculated week; covered state greys out the button |
| **M5 Launch** | `/why` page, terms, privacy note, eSafety self-assessment, domain, OSM and NSW attribution, launch checklist | Michael signs off |

## 12. Out of scope for v1

Accounts; free-text notes; automated image moderation; GPS or photo-location placement; operator or council
integrations and notifications; multiple photos per tag; a stats or heat-map page (the data is kept for later);
other councils.

## Sources

- **Share-bike context:**
  - [NSW shared e-bike laws (14 Aug 2026)](https://www.nsw.gov.au/ministerial-releases/australian-first-shared-e-bike-laws-come-into-effect-nsw)
  - [Transport for NSW sharing schemes](https://www.nsw.gov.au/driving-boating-and-transport/bikes-e-bikes-e-scooters/sharing-schemes)
  - [Inner West Council bike share page](https://www.innerwest.nsw.gov.au/walking-and-cycling/bike-share)
  - [Snap Send Solve e-bike complaints](https://snapsendsolve.com/media/smh-e-bike-complaints-surge)
- **Map:**
  - [Google Maps pricing](https://developers.google.com/maps/billing-and-pricing/pricing)
  - [Google Maps Platform terms](https://cloud.google.com/maps-platform/terms)
  - [Protomaps PMTiles CLI](https://docs.protomaps.com/pmtiles/cli)
  - [Protomaps downloads](https://docs.protomaps.com/basemaps/downloads)
  - [MapLibre MapOptions (`pixelRatio`)](https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/MapOptions/)
  - [MapLibre `within`](https://maplibre.org/maplibre-style-spec/expressions/#within)
  - [OSM attribution guidelines](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines)
  - [NSW Spatial Services copyright](https://www.spatial.nsw.gov.au/copyright)
  - [Neon extensions](https://neon.com/docs/extensions/pg-extensions)
- **Platform limits:**
  - [Vercel fair use](https://vercel.com/docs/limits/fair-use-guidelines)
  - [Vercel pricing](https://vercel.com/docs/pricing)
  - [Vercel WAF rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)
  - [Vercel Sydney pricing](https://vercel.com/docs/pricing/regional-pricing/syd1)
  - [Neon plans](https://neon.com/docs/introduction/plans)
- **Costs:**
  - [Vercel FOCUS billing charges](https://vercel.com/docs/rest-api/reference/endpoints/billing/list-focus-billing-charges)
  - [Vercel Pro plan](https://vercel.com/docs/plans/pro-plan)
  - [Vercel access roles](https://vercel.com/docs/rbac/access-roles)
  - [Neon consumption API v2](https://neon.com/docs/reference/api/consumption/get-consumption-history-per-project-v2)
  - [Neon pricing](https://neon.com/pricing)
  - [RBA exchange rates](https://www.rba.gov.au/statistics/frequency/exchange-rates.html)
- **Contributions:**
  - [Ko-fi fees](https://help.ko-fi.com/hc/en-us/articles/360002506494)
  - [Ko-fi webhook schema](https://apis.io/asyncapis/ko-fi/ko-fi-asyncapi/)
  - [PayPal AU fees](https://www.paypal.com/au/webapps/mpp/merchant-fees)
  - [Stripe tips and donations policy](https://support.stripe.com/questions/requirements-for-accepting-tips-or-donations)
  - [Stripe AU pricing](https://stripe.com/au/pricing)
  - [ATO crowdfunding](https://www.ato.gov.au/businesses-and-organisations/income-deductions-and-concessions/income-and-deductions-for-business/assessable-income/what-income-to-include/crowdfunding)
- **Security:**
  - [Vercel BotID](https://vercel.com/docs/botid)
  - [Vercel Blob private storage](https://vercel.com/docs/vercel-blob/private-storage)
  - [Vercel protect production deployments](https://vercel.com/changelog/protect-production-deployments-for-free-on-every-plan)
  - [sharp constructor](https://sharp.pixelplumbing.com/api-constructor)
  - [OWASP file upload](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
  - [Resend pricing](https://resend.com/pricing)
  - [OAIC small business](https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/organisations/small-business)
  - [eSafety cyberbullying scheme guidance](https://www.esafety.gov.au/sites/default/files/2025-01/Cyberbullying-Scheme-Regulatory-Guidance-Updated-January2025_0.pdf)
