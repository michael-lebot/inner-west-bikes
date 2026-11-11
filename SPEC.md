# SPEC — The Inner West E-bike Graveyard

> Status: **draft for review, rev 5** · Author: Michael Levot (with Claude) · 2026-11-09
> - **Rev 2** added the name and the chosen visual direction. It dropped the cost tracker and contributions,
>   recorded the verified Neon plan, and added the boundary buffer.
> - **Rev 3** removed every pixel and dot-matrix font and kept the retro look in the map art only. It also added the
>   accessibility (§10), performance (§11) and mobile usability (§12) plans.
> - **Rev 4** applies an independent review of rev 3 (gpt-6-astra, 22 findings).
>   - It sets out what each action may do and when (§4.2, §4.3), and makes retried requests safe (§5.3).
>   - It drops the CDN cache for tag data (§11.3) and protects the hourly job (§5.4).
>   - It fixes the placement, dialog and sheet behaviour that conflicted with the accessibility target (§3, §10,
>     §12).
>   - It made five rulings on open product questions. Michael has confirmed all five (§2).
> - **Rev 5** records Michael's decisions after that review:
>   - **Use my location** as a third way to place a pin (§4.1);
>   - a handle that shrinks the tag card with a tap or a flick (§12);
>   - house-number entry in the street picker, using NSW address data (§4.1, §10.3);
>   - a desktop section and mockup screen (§13).
>
> Sources are listed at the end.

## 1. What we're building

A no-login website showing a cute, 90s-video-game-style map of the **Inner West Council** area of Sydney. Anyone can
tap the map to tag a dumped or badly parked **share bike** (Lime, Hello, Ario), optionally with a photo.

- A tag disappears automatically **48 hours** after it was last confirmed.
- Other visitors can mark a tag **Still there**, which restarts the 48 hours, or **Removed**, which hides the tag
  straight away.
- Anyone can report a photo. It stops being shown straight away and is queued for Michael to restore or delete.
- A **"Why this page exists"** link leads to a page whose copy Michael will supply.

**Why now.** NSW's shared e-bike laws took effect on 14 August 2026. They let councils set parking rules and fine
operators that don't move bikes. Complaints are rising sharply: Snap Send Solve reports +931% in Marrickville. Yet
there's no public map just for dumped share bikes. Inner West Council tells residents to report bikes to the
operators, and has no reporting channel of its own.

## 2. Decisions

| Topic | Decision |
|---|---|
| Name | **The Inner West E-bike Graveyard** |
| Visual direction | The **Overworld** palette and pixel-art textures appear in the **map artwork only**. The interface is plain, and **no pixel or dot-matrix fonts are used anywhere**, including map labels (§9) |
| Accessibility target | **WCAG 2.2 AA**, plus a list view and a street picker, so neither reading nor tagging needs the map (§10) |
| Bike type | Share-scheme bikes and e-bikes only (Lime, Hello, Ario, plus "Not sure") |
| Who acts on tags | **Public visibility only** in v1. No operator or council integrations |
| Map realism | **Real streets and real street names, with a retro game skin**. Must be accurate enough to walk to |
| Placing a tag | Three ways: **tap the map**; **Use my location**, which proposes a pin to confirm; or pick a street and then a house number or the nearest corner, which needs no map (§4.1, §10.3). Tags up to **20 m outside the council boundary** are accepted |
| Tag fields | Operator picker + problem pick-list + optional photo. **No free text** is stored or published |
| "Removed" | Instant, but **rate-limited per visitor**. Every removal is logged so the admin can undo it. An undo gives the tag back only the time it had left, and **can't revive it once its 48 hours have run out**; the bike has to be tagged again (§4.2) |
| Bikes close together | A tag within about 25 m of another is **a suggestion, never a block**. The visitor is asked "Is it one of these?" and can always add a separate tag (§4.2) |
| Photo screening | **Published instantly**. Community reports are the safety net; no automated scan. The risk this leaves is accepted and recorded in §6 |
| Reported photos | A reported photo **stops loading from the next request**. Pages that already had it open catch up within 5 minutes (§4.3) |
| Paused photo uploads | After a flood of reports, uploads **stay off until Michael resumes them**. There is no automatic restart (§4.6) |
| Report review | **Email alert + a protected admin page** |
| Hosting | New projects inside StoryCraft's existing Vercel team and its **Vercel-managed Neon organisation, which is on the paid Launch plan** (verified, §5) |
| Cost tracker and contributions | **Dropped.** Estimated running cost is about A$1.50–4 a week. Revisit only if that changes (§4.5) |
| History | **Keep anonymous records** of expired and removed tags (location, operator, problem, times). Photos and visitor data are deleted |
| Domain | **innerwestbikegraveyard.com**, with DNS at Crazy Domains. `www` and the old `inner-west-bikes.vercel.app` redirect to it. The hourly cron is unaffected: Vercel calls it on the deployment's own address, and the redirect skips `/api/cron/` too. The admin stays on `inner-west-bikes-admin.vercel.app` |
| Repo | **Public**, under `michael-lebot` |
| Expected traffic | Under 100 visits a day at first |

## 3. Core user flows

The three main phone screens and the desktop layout are shown in `docs/mockups/graveyard-v3.html`.

1. **Browse.** The map opens on the whole council area, with everything outside it greyed out and live tags shown as
   pins. A tag is live until it is removed or its 48 hours run out (§4.2).
   - Each pin is coloured by operator and also carries a letter (L/H/A/?), so colour is never the only cue.
   - The panel below the map shows "N bikes in the graveyard", the operator key and one primary action.
   - Visitors can zoom down to street level.
   - Where pins overlap, tapping them opens a short list to choose from (§4.1).
   - A **List** toggle shows the same tags as a list grouped by suburb (§10.3).
2. **Tag a bike.** Going back a step never loses what was already entered.
   1. **Start.** Tap "Tag a dumped bike". If the map is zoomed out, it zooms in to street level (zoom 16) first.
   2. **Place.** The whole map stays usable. There are three ways to set the spot:
      - tap it on the map;
      - **Use my location**, which proposes a pin where the visitor is standing (§4.1);
      - **Choose by street**, which picks a street, then a house number or the nearest corner, without the map
        (§10.3).
   3. **Check the pin.** A bar under the map reads "Pin on Llewellyn St, Marrickville", with **Use this spot** and
      **Cancel**. Tapping somewhere else moves the pin. Spots outside the council plus 20 m are rejected with a
      friendly message.
   4. **Check for a match.** If live tags sit within about 25 m, the app asks "Is it one of these?" and lists them.
      **Yes, this bike** marks that tag Still there. **No, it's another bike** carries on. Nearby tags never block a
      new one (§4.2).
   5. **Describe.** The form opens as a dialog over a short map strip. It shows the chosen street with a **Change
      location** button, which goes back to step 2. Choose **Whose bike?** (Lime / Hello / Ario / Not sure) and
      **What's wrong?**, optionally add a photo, then tap **Add to the map**.
   6. **Photo.** The tag is saved first and the photo is sent after it. If the photo fails, the tag stays and the
      photo can be retried on its own (§4.3).
3. **Confirm.** Tap a pin to open a card showing:
   - the photo, operator, problem and street;
   - "Last seen Xh ago · Disappears in Yh", with a timer bar;
   - "Is it still there?" with **Still there** and **Removed** buttons;
   - a low-key **Report this photo** link;
   - a handle at the top, which shrinks the card to one line to show more of the map, and brings it back (§12).
4. **Report a photo.** Choose a reason. The photo stops loading for everyone from their next request, and Michael gets
   an email. A page that already had it open drops it at its next refresh (§4.3).
5. **Admin (Michael).** Review the queue of reported photos and restore or delete each one. Undo removals that were
   malicious, and take down tags that are malicious themselves (§4.6).

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
- **Overworld map art** (the map only):
  - a custom MapLibre style with the Overworld palette (§9);
  - texture from `fill-pattern` sprites authored as pixel art at 2× (grass tufts, trees, a dithered grey outside the
    council);
  - pixel-art pin images.
- **Map text:** rendered at the device's full resolution. There is no `pixelRatio` downscale, because that would
  pixelate every label.
  - Labels use **Atkinson Hyperlegible** glyphs (PBF, ranges 0–255): 13–16 px, bold where needed, with a 2 px white
    halo or white label boxes.
  - No pixel, bitmap or dot-matrix font is used anywhere.
- **Pins are MapLibre HTML markers** (`<button>`s), not a symbol layer, so they're focusable and have accessible names
  (§10.4).
  - **Crowded pins:** pins sit where the bikes are, so at the council-wide zoom two of them can overlap. Tapping a
    pin whose centre is within 44 px of another opens "N bikes here", a short list built from the same rows as the
    list view, to choose from.
  - Focusing a pin with the keyboard pans the map to bring it into view.
- **Risk:** pattern fills at native resolution may look less "game-like" than the chunky mockups. Judge this on real
  phones in M1.
- **Mask:** a fill layer with a local rectangle as the outer ring and the council boundary as the hole. Check the ring
  winding, or MapLibre will grey out the council area too.
  - Greyscale with a dither pattern.
  - Label layers are filtered with `within` so places outside the council don't get labels.
  - The boundary line (the gold "council wall") is drawn from the same polygon.
- **Bounds:** `maxBounds` set to the padded extract box. Min zoom about 12, max zoom about 18; above zoom 15 the
  map enlarges the zoom-15 data.
- **Boundary data:** the NSW Spatial Services gazetted council polygon (`NSW_Administrative_Boundaries_Theme`, layer 8,
  `lganame='INNER WEST'`; 4,461 points, about 35 km², last modified 2026-02-04).
  - Ships as a static GeoJSON file in `packages/shared`.
  - Attribution: "© State of New South Wales (Spatial Services, DCS NSW)", CC BY 4.0.
  - Map data attribution: "© OpenStreetMap contributors".
  - Don't use the ABS statistical boundaries for validation; they drift up to about 760 m from the gazetted line.
- **20 m buffer for tags (decided).** Some boundary lines run down the middle of streets such as King St and
  Parramatta Rd, so a bike on the far footpath should still count.
  - At build time, generate a second polygon by buffering the council outline outwards by 20 m with turf `buffer`.
  - Accept tags inside that **buffered** polygon. The mask and the gold wall still use the true boundary.
  - A pin in the buffer strip sits on the grey side of the wall. That's acceptable, and the hint text still names
    the street.
- **Suburbs:** worked out by overlapping the NSW suburb polygons with the council polygon. They give the card's street
  and suburb line without a geocoding API.
  - **Wholly inside (17):** Ashfield, Balmain, Balmain East, Birchgrove, Dulwich Hill, Enmore, Haberfield, Leichhardt,
    Lewisham, Lilyfield, Marrickville, Petersham, Rozelle, Stanmore, Summer Hill, Sydenham, Tempe.
  - **Partly inside (9):** Annandale 94%, St Peters 83%, Newtown 57%, Croydon 38%, Camperdown 28%,
    Hurlstone Park 9%, Croydon Park 7%, Ashbury 6%, Mascot 2%.
  - The bundled suburb set must include the neighbouring suburbs that touch the buffer. A pin on the far side of
    King St is in Newtown's City of Sydney half, but it is still "Newtown".
  - Street names come from the nearest named road segment, using the same NSW data bundled as a small lookup.
  - The same build step lists every corner where two named streets meet, for the street picker (§10.3).
- **House numbers,** also for the street picker: the NSW Spatial Services address points (Geocoded Addressing Theme,
  AddressPoint layer), from the same publisher as the boundaries and roads.
  - **Build step:** keep the points inside the buffered polygon, drop unit numbers ("707/16" becomes "16"), and keep
    one point per street number.
  - **Measured on 2026-11-09:** 100,241 address points give 53,548 street numbers on 1,482 streets.
  - **Shipped as one file per suburb** (30 files). The largest is 34 KB gzipped (Marrickville) and the median is
    6 KB. A file loads only when a street in that suburb is chosen.
  - Pull from the newer service, `NSW_Geocoded_Addressing_Theme_multiCRS`. The older one is marked as retiring.
  - **Licence:** the dataset's record says "Creative Commons", with attribution to the State of New South Wales
    (Spatial Services), but gives no version. Confirm CC BY 4.0 with Spatial Services before launch (§14). The
    attribution line the site already carries covers it.
  - The OpenStreetMap tiles can't do this job. They hold about 8,000 house numbers for the council against 53,548
    here, and each is a bare number with no street attached.
- **Inside-the-council check:** turf `booleanPointInPolygon` against the buffered polygon, run in the browser for
  instant feedback and again on the server as the rule that counts. PostGIS isn't needed in v1.
- **Use my location (optional).** A button in the placement step, for someone standing beside the bike.
  - The browser asks for permission only when the button is tapped, never when the page loads.
  - The location is read once and never tracked. It stays in the browser. Only the pin the visitor confirms is sent,
    as for any tag.
  - **Accurate to 50 m or better:** the map centres there and a pin is proposed. The visitor confirms it with **Use
    this spot** or taps to move it. Nothing is submitted automatically.
  - **Worse than 50 m:** the map centres there with no pin, and a message says "Your location is only accurate to
    about 80 m. Tap where the bike is, or choose a street."
  - **Outside the council plus 20 m:** "You're outside the Inner West. Tap the map or choose a street."
  - **Permission refused, or no location within 10 seconds:** a plain message, and the other two ways still work.
  - It is a convenience, not proof that the visitor was there. The server doesn't check it.
- **Accessibility, performance and mobile behaviour** of the map are specified in §10–§12.

### 4.2 Tags

- **Fields:** location (lat/lng, computed suburb, nearest street), operator, problem, optional photo, timestamps.
- **Operators:** Lime, Hello (HelloBike), Ario, Not sure. All three operate in the Inner West per the council page
  updated 2 October 2026.
  - The list is a small static config file. Each operator has a short text key and an active or retired flag.
  - Adding or retiring an operator is a config change and a deploy. A retired operator stays in the file, so old
    records still display.
- **Problems (pick-list):** Blocking footpath · Knocked over · Blocking ramp / driveway · In waterway ·
  In park or reserve · Damaged.
- **Nearby tags are a suggestion, never a block.** Two dumped bikes can sit a metre apart.
  - When a visitor picks a spot within about 25 m of live tags, the app lists those tags and asks "Is it one of
    these?"
  - **Yes, this bike** marks that tag Still there. **No, it's another bike** carries on to the form.
  - The check runs in the browser against the tags already loaded. The server never refuses a tag for being near
    another.

**What each action may do.** A tag is **live** when `status = 'active'` and `expires_at > now()`. Expiry is never
stored as a status. A tag simply stops being live when its time passes, so nothing depends on when a scheduled job
runs.

| Action | Who | Allowed when | Effect |
|---|---|---|---|
| Create | Visitor | The spot is inside the buffered boundary | A new `active` tag with `expires_at` = now + 48h |
| Still there | Visitor | The tag is live | `last_confirmed_at` = now and `expires_at` = now + 48h. It resets the clock; it never adds time on top |
| Removed | Visitor | The tag is live | `status = 'removed'`. `expires_at` is left alone |
| Undo removal | Admin | The tag is `removed` and `expires_at > now()` | `status = 'active'`. The tag gets back only the time it had left, because an undo is not a new sighting |
| Take down | Admin | The tag isn't already taken down | `status = 'taken_down'` and its photo is deleted. Final: no action brings it back |
| Expire | Time | `expires_at` has passed | Nothing is written. The tag is no longer live, for good |

- **One statement per write.** Each write is a single conditional update that tests the "Allowed when" column in the
  same statement, for example `UPDATE … WHERE id = $1 AND status = 'active' AND expires_at > now()`.
  - If no row matches, nothing changes. The visitor is told "This tag has already gone" and it leaves their map.
  - So a tag can't be confirmed back to life a minute after it expired, and an undo can't report success on a tag
    that stays invisible. The admin sees "Expired, can't undo" instead.
- **Reads** return live tags only, so tags vanish on time with no scheduled job involved.
- **Limits:** Still there is limited to one per tag per visitor per 12h. Removed is rate-limited per visitor (§6).
  Every removal is logged with the visitor's hashed identifiers, so the admin can see who did it and undo it.
- **History:** tags that are no longer live keep only location, suburb, operator, problem and timestamps. Hashed
  visitor identifiers are cleared after 30 days (§6).

### 4.3 Photos

- **In the browser:**
  - The file input uses `accept="image/jpeg,image/png,image/webp"`, which makes iOS convert HEIC to JPEG.
  - A canvas shrinks the photo to at most 2048 px before upload (about 1 MB).
  - **Verify on current iOS before launch.**
  - Beside the photo input: "Photos are public. Leave out people, faces and number plates.", with a link to the
    terms (§7).
- **Server route** (multipart, through an API route, never uploaded straight to Blob):
  1. Reject anything over 4 MB.
  2. Check the magic bytes; ignore the Content-Type header.
  3. Decode with `sharp(buf, { limitInputPixels: 50e6, failOn: 'warning', autoOrient: true })`.
  4. Resize to at most 1600 px, save as WebP at quality ~75, and make a 320 px thumbnail. Re-encoding strips all EXIF
     and GPS data and defeats polyglot files.
  5. Store under random UUID paths in a **private** Vercel Blob store (needs `@vercel/blob` ≥ 2.3; a store's access
     mode can't be changed after creation).
  6. Save the two files first, then insert the photo row. If the insert fails, delete the files. The hourly job
     also deletes any stored file more than an hour old that has no row (§5.4).
- **One photo per tag** in v1. To the visitor it is one form. Underneath it is two requests: the tag is saved first,
  then the photo is attached to it.
  - **Attaching is allowed when** the tag is live and has no photo, the request comes from the visitor who created
    the tag, and uploads aren't paused (§4.6). There is no deadline.
  - **If the photo fails,** the tag is still saved. The visitor sees "Tag added, but the photo didn't upload", with
    **Try again** and **Skip**. Try again sends only the photo, to the same tag.
- **A photo's status records moderation only:** `visible`, `hidden` (reported and waiting for Michael) or `deleted`.
  It never changes because its tag changed.
  - **Report:** `visible` → `hidden`.
  - **Admin restore:** `hidden` → `visible`. Later reports on a restored photo still reach Michael but don't hide it
    again, so one person can't keep hiding a legitimate photo.
  - **Admin delete:** any status → `deleted`. This is final, and the files are removed.
- **Serving:** `/photo/[id]` and `/photo/[id]/thumb` stream a photo only when it is `visible` **and** its tag is
  live. Otherwise they return 404. Responses carry `Cache-Control: private, no-cache`, and Vercel image optimisation
  is off (`unoptimized`).
  - A reported photo, and the photo of a removed or expired tag, therefore stops loading on the very next request.
  - Undoing a removal makes the tag live again. Its photo comes back only if it is still `visible`, so an undo can
    never republish a reported photo.
  - A page that already had the photo open keeps showing it until that page next refreshes its data: when the tab
    regains focus, or within 5 minutes while it is visible (§11.3). The refresh removes hidden photos and tags that
    are no longer live.
- **Deleting the files:** the hourly job deletes a photo once its tag's `expires_at` has passed, whatever the tag's
  status. Take down and admin delete remove it straight away.
  - The row is marked `deleted` first and the files are removed second, so a half-deleted photo is never served.
  - A tag past `expires_at` can never become live again (§4.2), so deletion can't collide with an undo or a restore.
  - Reports still open on a photo deleted this way are closed as `expired`.
- **Report reasons:** Not a share bike · Shows a person, face or number plate (privacy) · Offensive or inappropriate ·
  Other.

### 4.4 "Why this page exists"

- A static page at `/why`. It's linked from the header, top right, on every screen. Michael will supply the copy;
  launch is blocked until it arrives.

### 4.5 Hosting costs and contributions — dropped (deferred)

- The weekly cost tracker and Chip in button are **out of v1**. The estimated cost is about A$1.50–4 a week (§8),
  which doesn't justify the build.
- **How we'll notice if costs change:**
  - Set a Vercel spend-management alert on the team. Neon is Vercel-managed, so its usage appears on the same Vercel
    invoice.
  - Check this project's line items monthly.
- **Trigger to revisit:** sustained cost above A$10 a week. The research to reuse then is in Appendix A.

### 4.6 Admin

- A separate Next.js app (`apps/admin`), deployed as its own Vercel project with **Vercel Authentication on every
  deployment, including production** (free on all plans since 9 September 2026).
  - Michael signs in with his Vercel passkey and 2FA, so there's no login code to write.
  - The public app has **no** admin endpoints.
  - Both apps share the Neon database and the Blob stores.
- **Screens:**
  - **Reported photos:** photo, reasons, report count, and the tag with its recent events. Restore and Delete
    buttons.
  - **Tags:** recent tags and removals, plus lookup by tag ID or tag URL. Each tag shows its events, and how many
    actions the same hashed visitor or IP made that day. Two buttons:
    - **Undo removal**, available until the tag's 48 hours run out (§4.2);
    - **Take down**, for a tag that is malicious itself, such as a made-up tag outside someone's house. It is final.
  - **Photo uploads switch**, shown on both screens: Pause or Resume.
  - There is no separate abuse dashboard and no visitor blocking in v1. Rate limits cap what one visitor can do. Add
    blocking only if a repeat abuser turns up.
- **Email alerts (Resend):**
  - One email per report for the first 10 each day. After that, reports go into an hourly digest, so a flood can't
    use up the free tier (3,000/month, 100/day).
  - Each report records when a sender claimed it for an email, and when Resend accepted that email. The hourly job
    sends a digest of every report not yet emailed, so a failed send is retried within the hour (§5.4). A claim 10
    minutes old with no email sent, as a server that stopped mid-send leaves, is taken again by the digest.
  - Every email goes to Resend with an idempotency key, so a request tried again after its reply was lost doesn't
    send it twice.
  - Emails send from an address on innerwestbikegraveyard.com, verified with Resend on 10 November 2026.
- **Pausing photo uploads:**
  - **Circuit breaker:** if more than 15 reports arrive site-wide in an hour, photo uploads pause and Michael is
    emailed.
  - Uploads stay paused until Michael presses **Resume**, so a person has looked before photos flow again.
  - Michael can also pause uploads by hand, for example before going away (§7).
  - While uploads are paused, tagging without a photo works as normal, and the form says photos are switched off for
    now.

## 5. Architecture

| Layer | Choice (mirrors StoryCraft where sensible) |
|---|---|
| Repo | Turborepo monorepo: `apps/web` (public), `apps/admin` (protected), `packages/server` (runs only on the server: the Prisma schema and client plus every server-side rule), `packages/shared` (runs anywhere: Zod schemas, boundary and buffered GeoJSON, street, corner and house-number lookups, operator and problem config) |
| Framework | Next.js 16 App Router, TypeScript strict, route handlers (no server actions), Tailwind 4 |
| Database | Neon Postgres 18, Prisma 6 — **new project in Sydney (`aws-ap-southeast-2`)**, created through the **Vercel Marketplace Neon integration** in the `michael-lebot's projects` Vercel team. It then lands in the Vercel-managed org "Vercel: michael-lebot's projects", which is on the **Launch** plan (verified 2026-11-09 with `neonctl orgs list`) and billed through Vercel |
| Functions | Vercel, **region `syd1`** (Vercel's default is Washington DC, iad1) |
| Storage | Vercel Blob: a **public** store for PMTiles and a **private** store for photos |
| Map | MapLibre GL JS + `pmtiles` protocol + custom Overworld pixel style |
| Bot defence | Vercel BotID (Basic free; Deep Analysis on) |
| Email | Resend |
| Tests | Vitest (unit, and integration against a real Postgres) + Playwright (end-to-end), as in StoryCraft. Required cases are in §5.5 |

### 5.1 Data model (first cut)

```
tags            id uuid (made in the browser, so a retried create can't make a second tag)
                lat/lng numeric(9,6) · suburb · street · operator text · problem enum
                status enum(active, removed, taken_down) · created_at · last_confirmed_at · expires_at
                removed_at · confirm_count
tag_events      id · tag_id · type enum(created, still_there, removed, restored, taken_down) · at
                request_id uuid unique · visitor_hash · ip_hash       ← hashes cleared after 30 days
photos          id uuid · tag_id (unique) · blob_path · thumb_path · width · height · bytes
                status enum(visible, hidden, deleted) · created_at · hidden_at · deleted_at
photo_reports   id · photo_id · reason enum · request_id uuid unique · created_at
                visitor_hash · ip_hash                                ← hashes cleared after 30 days
                claimed_at · notified_at · resolved_at · resolution enum(restored, deleted, expired)
rate_counters   key (action:subject:window) PK · count · window_start ← row deleted 48h after window_start
daily_salts     day date PK · salt                                    ← row deleted after 48h
site_state      one row: uploads_paused_at · uploads_paused_reason
```

- There is no `expired` status. A tag is expired when `expires_at` has passed (§4.2).
- `operator` is a short text key checked against the config file, not a database enum, so adding an operator needs
  no migration (§4.2).
- `photos.status` is moderation state only (§4.3).

### 5.2 Endpoints (`apps/web`)

| Route | Notes |
|---|---|
| `/` | Map page: a static shell and a static council preview. The count and pins arrive from one `GET /api/tags` request, and MapLibre loads after first paint (§11.2) |
| `/list` | All live tags grouped by suburb, rendered on the server for each request; never loads MapLibre (§10.3) |
| `/tag/[id]` | One tag, rendered on the server for each request, shareable; used by the list and the map card |
| `/why`, `/accessibility`, `/privacy`, `/terms` | Static pages |
| `GET /api/tags` | Live tags, read from the database on every request (`Cache-Control: no-store`). There is no CDN cache, so nothing needs clearing when the admin app changes a tag (§11.3) |
| `POST /api/tags` | BotID → rate limit → Zod validation → buffered-boundary check → insert. The browser supplies the tag's ID (§5.3) |
| `POST /api/tags/:id/still-there` | BotID → rate limit → conditional update (§4.2) |
| `POST /api/tags/:id/removed` | BotID → rate limit → conditional update and log (§4.2) |
| `POST /api/tags/:id/photo` | BotID → rate limit → the attach rules and pipeline in §4.3. No deadline |
| `GET /photo/:id[/thumb]` | Streams from the private store only if the photo is `visible` and its tag is live (§4.3) |
| `POST /api/photos/:id/report` | BotID → rate limit → hide → log → email |
| `GET /api/cron/hourly` | Needs the `CRON_SECRET` bearer token; anything else gets 401 (§5.4) |

### 5.3 Safe retries

A phone on a poor connection can lose the reply to a write that actually worked. Sending it again must not act twice;
it returns the current state.

- **Every write carries an ID made in the browser.**
  - **Create:** the ID is the tag's own `id`. The insert uses `ON CONFLICT (id) DO NOTHING`, and a repeat returns the
    existing tag.
  - **Still there, Removed, Report:** the ID is a `request_id`, held under a unique constraint on the event or
    report row. That row is inserted first, inside the write's transaction.
  - **Photo:** a tag has at most one photo (`tag_id` is unique), so a repeat returns the photo already attached.
- **A repeat does nothing new.** If the ID is already stored, the server returns the tag's or photo's current state.
  It adds nothing to a rate limit, writes no second event and sends no second email.
- **A repeat only counts from the same visitor.** The same ID from a different visitor gets a 409.
- **The browser retries only what could succeed:** network failures, 5xx replies, and 429 replies after waiting for
  `Retry-After`. It tries at most three times with backoff, never retries any other 4xx reply, and keeps the form
  filled in.

### 5.4 The hourly job

`GET /api/cron/hourly` is called by Vercel Cron, which sends `Authorization: Bearer $CRON_SECRET`. A request without
that token gets 401 and does nothing. The route skips BotID, because the caller isn't a browser.

Every step acts only on rows still in their "before" state. Running the job twice, or two runs overlapping, gives the
same result as running it once.

1. Delete photos whose tag's `expires_at` has passed: mark each row `deleted`, then remove its files (§4.3). Close any
   reports still open on them as `expired`.
2. Delete stored files more than an hour old that have no photo row.
3. Clear visitor and IP hashes older than 30 days from `tag_events` and `photo_reports` (§6).
4. Delete `rate_counters` rows and `daily_salts` rows older than 48h.
5. Email a digest of the reports that haven't been emailed yet (§4.6).

### 5.5 Tests beyond the happy path

These are exit criteria for M2 and M3 (§15). They run in Vitest against a real Postgres unless marked Playwright.

- **Expiry edges:** Still there and Removed work one second before `expires_at` and change nothing one second after.
  Undo is refused after `expires_at`.
- **Two at once:** two simultaneous requests can't take a visitor past a rate limit. Two simultaneous Removed
  requests write one removal.
- **Repeats:** sending each kind of write again with the same ID returns the current state, with one event, one
  rate-limit count and one email.
- **Photo and tag together:** report → remove → undo leaves the photo hidden. A photo URL returns 404 once its tag
  is removed, expired or taken down. A restored photo isn't hidden by a later report.
- **Photo attach:** refused for another visitor, for a tag that isn't live, for a second photo, and while uploads are
  paused. A failed attach leaves the tag saved and no stray files.
- **Bad images:** oversized files, wrong magic bytes, truncated files, decompression bombs and polyglot files are all
  rejected.
- **Outside failures:** a Blob failure and a Resend failure each leave the database consistent. The unsent report
  goes out in the next digest.
- **Access:** the hourly job returns 401 without the token. The admin app can't be reached without Vercel
  Authentication (Playwright, against a preview deployment).
- **Hourly job twice:** two runs in a row, and two runs at once, give the same result as one.
- **House numbers** (unit test): the same number, a lettered number (12A) and a range that contains the number
  (10–14) all match. An unknown number gives the message and no pin.
- **Use my location** (Playwright, with a mocked position): an accurate position inside the council proposes a pin. A
  rough position, one outside the council, and a refused permission each leave no pin and the other ways working.

## 6. Abuse protection and privacy

**Layers:**
- BotID runs first on every write route.
- Then a Vercel WAF rule: at most 20 `POST /api/*` requests per 60 seconds per IP, else 429.
- Then per-action counters in Postgres, updated in the same transaction as the write
  (`INSERT … ON CONFLICT DO UPDATE … RETURNING count`). A repeat of an earlier request isn't counted (§5.3).
- The hourly job is not a browser route. It is protected by `CRON_SECRET` instead (§5.4).

**Starting limits** (to be tuned from real usage). The per-IP limits are about 3× the per-visitor limits, because many
mobile users share one IP.

| Action | Per visitor | Per IP | Extra |
|---|---|---|---|
| Create tag | 5/hour, 15/day | 40/day | Nearby tags are suggested, never blocked (§4.2) |
| Upload photo | 1 per tag, 10/day | 25/day | Stops while uploads are paused (§4.6) |
| Still there | 1 per tag per 12h, 30/day | 60/day | Resets to 48h; never adds time |
| Removed | 3/day | 8/day | Soft delete; admin can undo until the tag's 48h run out |
| Report | 5/day | 10/day | More than 15/hour site-wide: uploads pause until Michael resumes them |

**Visitor identity without accounts:**
- **Cookie:** a random 128-bit HttpOnly cookie (Secure, SameSite=Lax). Only a keyed hash of it is stored.
- **IP:** stored as HMAC-SHA256 with a daily salt (the /64 prefix for IPv6). Each salt is deleted after 48h, and raw
  IPs are never logged.

**What is kept, and for how long.** Every place that holds a visitor identifier is listed here. The hourly job does
the clearing (§5.4).

| Where | What | Kept for |
|---|---|---|
| `tag_events` | Visitor and IP hashes | Cleared after 30 days. The anonymous event stays |
| `photo_reports` | Visitor and IP hashes | Cleared after 30 days. The anonymous report and its outcome stay |
| `rate_counters` | A hash inside the row's key | The whole row is deleted 48h after its window starts |
| `daily_salts` | The day's IP salt | Deleted after 48h. IP hashes from that day can't be tied to an IP after that |
| Photo store | Image files | Deleted when the tag's 48 hours run out, on take down, or on admin delete (§4.3) |

**Other measures:**
- Security headers: strict CSP (map tiles from our own Blob domain only), `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy: geolocation=(self)`.
- All input is validated with Zod at the boundary.
- No visitor-written text is stored or published, by design. The street search and house number boxes (§10.3) are
  typed into, but their text never leaves the browser.

**Known risk, accepted.** Photos publish instantly, so an unsuitable photo is public until someone reports it or
Michael sees it. Reporting stops it loading from then on, but can't undo views or downloads that already happened.
- **What limits the damage:** one photo per tag, 10 uploads a day per visitor, the circuit breaker, and deletion when
  the tag's 48 hours run out.
- **Fallback if this proves too loose:** hold photos for Michael's approval before they show.

## 7. Legal and content (not legal advice)

- **Terms:**
  - Photos must show share bikes; people and number plates must not be the subject.
    - That rule is a request to the uploader. It is not consent from anyone who ends up in a photo, which is why a
      report of "Shows a person, face or number plate" hides the photo at once.
  - The notice beside the photo input (§4.3) links to these terms, so "photos are public" and the licence are seen
    before anything is submitted.
  - Visitors grant a licence to display their uploads, and we may remove anything.
  - The site isn't affiliated with Lime, Hello, Ario, Inner West Council or Transport for NSW.
- **Privacy note:**
  - what we collect and how it's hashed;
  - how long it's kept (§4.2, §6);
  - providers and regions: Vercel `syd1`, Neon Sydney, Resend;
  - BotID's browser signals;
  - the optional location button: the location is used in the browser and never stored (§4.1);
  - a contact address.

  The site is likely exempt from the Australian Privacy Principles (under $3M turnover) but should follow APPs
  1, 3, 5 and 11 anyway. The statutory privacy tort applies to everyone.
- **eSafety:**
  - Keep the report button and a monitored contact email, and be able to delete within hours. A removal notice must
    be met within 24h.
  - **Do the classification for real.** Before launch, work out which online-safety codes or standards apply to an
    anonymous site that publishes visitors' photos. Cover both the unlawful-material rules and the
    age-restricted-material rules, using eSafety's guidance as it stands at the time
    ([overview](https://www.esafety.gov.au/industry/codes)). Write down the category and risk tier that result,
    with the reasons.
    - The lowest tier is the expected answer, not an assumed one. If the assessment lands anywhere else, the extra
      obligations become launch blockers.
  - **A one-page response procedure,** kept with the assessment:
    - who receives notices: the contact address, forwarded to Michael's phone;
    - how to remove something urgently: Take down or Delete in the admin app (§4.6);
    - what happens while Michael is away: he pauses photo uploads before leaving (§4.6). Reported photos stay hidden
      until reviewed, and every photo is deleted when its tag's 48 hours run out.
- **Attribution:** © OpenStreetMap contributors (collapsible "i" button); © State of NSW (Spatial Services), CC BY 4.0.
- **Name:** "Graveyard" is tongue-in-cheek. The `/why` copy should make clear the site is about getting bikes
  collected, not shaming operators or riders.

## 8. Expected costs (for awareness; no tracker)

- **No hard pauses.** The Hobby and Neon Free limits discussed in the interview don't apply.
- **Neon (Launch):**
  - compute is billed only while the database is awake, and it sleeps after 5 idle minutes;
  - tag reads are no longer cached (§11.3), so each visit can wake it for about 5 minutes. At 100 visits a day that
    is at most about 65 CU-hours a month at the smallest size: roughly US$5–7 a month at US$0.106 per CU-hour;
  - this stays inside the A$1.50–4 a week estimate in §4.5;
  - storage well under 1 GB.
- **Vercel:**
  - functions and CDN usage are tiny at under 100 visits a day;
  - PMTiles requests (an estimated ~30 tiles per map load, to be measured) are covered by Pro's included CDN
    allowance;
  - watch team-wide CDN requests if traffic grows, because the included allowance is shared with StoryCraft.
- **Blob:** about 10 MB of tiles plus a few MB of live photos (they're deleted on expiry).
- **Other:** Resend $0. BotID $0 at its Basic level. Domain: innerwestbikegraveyard.com, registered
  through Crazy Domains on 10 November 2026, renewing yearly.

## 9. Visual direction — Overworld map, plain interface

The reference is **`docs/mockups/graveyard-v3.html`**. The five original explorations are kept in
`docs/mockups/explorations/` for the record.

- **The retro look lives in the map art only:**
  - grass-green council and sandy roads with brown edging;
  - dashed suburb borders and a gold council line;
  - tree and tuft patterns, with greyscale and dither outside the council;
  - black-outlined pixel-art pins.
  - These are graphics, not text.
- **Everything you read is plain:**
  - one typeface, Atkinson Hyperlegible (400 and 700), for the interface, map labels and pin letters;
  - no pixel, bitmap or dot-matrix fonts anywhere;
  - suburb labels in dark text with a white halo, and street names in white label boxes.
- **Interface:**
  - a white bottom sheet with a night-slate header (`#1f2a36`) holding the name, a small pixel headstone icon
    (decorative) and "Why this page exists";
  - one green primary button per screen (`#1d6b2a` with white text, about 6.9:1 contrast);
  - secondary buttons outlined;
  - option chips with a tick and a tinted fill when selected;
  - no game windows, bevels or 3D shadows.
- **Copy tone:** plain and friendly — "14 bikes in the graveyard", "Disappears in 31 h", "Is it still there?".

## 10. Accessibility plan

**Target: WCAG 2.2 Level AA** on every public page and state, and on the admin app. The section numbers in brackets
are WCAG success criteria. Where our own rule is stricter than the criterion, the text says so.

### 10.1 Type and text

- One typeface: **Atkinson Hyperlegible** 400 and 700, self-hosted as woff2.
  - No pixel, bitmap or dot-matrix fonts anywhere: interface, map labels, pin letters or name.
  - The headstone icon is decorative (`alt=""`).
- **Sizes:**
  - body 16 px, secondary text at least 14 px;
  - map labels at least 13 px, bold where needed, with a 2 px halo;
  - line height at least 1.4.
- **Scaling:**
  - Sizes are set in `rem`.
  - The layout holds at 200% browser zoom and at the largest iOS and Android text sizes (1.4.4).
  - It reflows at 320 CSS px wide with no horizontal scrolling (1.4.10).
  - Text-spacing overrides don't clip anything (1.4.12).
- Map text is rendered at full device resolution, never upscaled (§4.1).

### 10.2 Colour and contrast

- **Text:** at least 4.5:1 contrast.
- **Large text and interface parts:** at least 3:1 (1.4.3, 1.4.11). That covers buttons, chip borders, the focus ring,
  pins against the map, and the council line against both the inside and the greyed outside.
- **Tested:** a unit test computes the contrast of every declared foreground/background pair in the colour tokens and
  fails CI on a regression. It also checks pin and label colours against every colour used in the map's patterns,
  because those sit on textured backgrounds.
- **Never colour alone (1.4.1):**
  - pins carry operator letters;
  - selected chips carry a tick;
  - outside the council is greyed *and* bounded by a line;
  - errors are always stated in text.
- **Dark mode:** `color-scheme: light` is declared, so OS dark mode doesn't half-invert form controls. A real dark
  mode is out of scope for v1.

### 10.3 The map is never the only way

- **List view** (`/list`, plus a toggle on the map screen):
  - Every live tag, rendered on the server and grouped by suburb.
  - Each item shows street, operator, problem, last seen and disappears-in, with **Still there** and **Removed**
    buttons.
  - Reading works without JavaScript.
  - This is the main path for screen-reader and keyboard users (1.1.1, 2.1.1).
  - The List toggle stays on screen while the map loads and if the map fails (§11.2).
- **Tag pages** (`/tag/[id]`): each tag has its own server-rendered, shareable page, which both the list and the map
  card use.
- **Tagging without the map: Choose by street.** A VoiceOver user on a phone has no arrow keys and can't judge a spot
  on a canvas, so tagging has its own complete route. It opens from the placement step on the map screen, and from
  "Tag a dumped bike" on `/list`.
  1. **Street:** a labelled search box over the streets inside the council, each shown with its suburb ("Llewellyn
     St, Marrickville"). Typing narrows the list. The typed text is never stored or sent.
  2. **Where on the street,** one of:
     - **House number:** type the number of the nearest house ("12"). A typed number matches the same number, a
       lettered one (12A) or a range that contains it (10–14). If nothing matches, the message is "We don't have
       number 12 on Llewellyn St. Try another number, or pick the nearest corner."
     - **Nearest corner:** the cross streets along that street, in order ("near Marrickville Rd"). This is what
       tells one end of a long road from the other.
  3. **Confirm:** the spot is read back as "12 Llewellyn St, Marrickville" or "Near the corner of Llewellyn St and
     Marrickville Rd, Marrickville", with **Use this spot**. The usual form follows.
  - With a house number the pin lands on that property, not on the footpath. With a corner it lands on the corner.
    Both are accepted on this route.
  - The house number only finds the spot. It isn't stored, sent or shown. The tag records the point and the street,
    like any other tag.
  - On the map screen the map also centres there, so a sighted visitor can tap to fine-tune the spot.
  - The street, corner and house-number lists are built from the bundled NSW data (§4.1) and loaded only when
    needed. No geocoding API is used.
- **Use my location** (§4.1) is the quicker route for someone at the bike. It works with a screen reader, and from
  `/list` with no map.
  - The result is read back as "Near Llewellyn St, Marrickville, accurate to about 15 metres", with **Use this
    spot**.
  - If the location isn't accurate enough, the visitor is pointed to Choose by street.
  - It never replaces Choose by street, because permission can be refused.
- **Placing on the map without precise pointing:**
  - **Keyboard crosshair:** arrow keys move 10 m, Shift+arrows 50 m, Enter places the tag, Esc cancels.
  - **Move map buttons** pan the map with single taps (§10.5).
  - The placement is read back as "Pin on Llewellyn St, Marrickville".

### 10.4 Keyboard, focus and screen readers

- **Pins** are `<button>` HTML markers with a full accessible name, for example "Lime e-bike, blocking footpath,
  Denison St, Newtown, disappears in 31 hours". Their tab order follows suburb and then street. A canvas symbol layer
  would be invisible to assistive technology.
  - Overlapping pins open a chooser, and a focused pin is panned into view (§4.1).
- **The map region** is labelled, with a one-line summary ("Map of the Inner West with 14 tagged bikes. A list view is
  available.") and a skip link to the list.
- **Which sheets are dialogs:**
  - **Not dialogs:** the browse panel and the placement bar. The map stays usable beside them, by pointer and by
    keyboard alike.
  - **Non-modal:** the tag card. Focus moves to its heading, Esc or its Close button closes it, and focus returns to
    the pin. The map stays usable.
    - Its handle is a button named "Shrink card" or "Expand card", and it reports its state with `aria-expanded`
      (§12).
  - **Modal dialogs** (2.4.3): the tag form, the report form, the "Is it one of these?" question and the street
    picker.
    - Focus moves to the heading, and Tab stays inside.
    - The rest of the page is `inert`, so pointer and keyboard users are held to the same rule.
    - Esc or a visible Cancel button closes the dialog, and focus returns to the control that opened it.
  - The tag form never asks anyone to reach past it to the map. Its **Change location** button goes back to the
    placement step and keeps the answers already given.
- **Visible focus** (2.4.7). Our own rule is stricter than the criterion: a 3 px outline at 3:1 contrast that is never
  removed.
- **Focus not hidden** (2.4.11). The criterion asks that a focused item is not entirely hidden. Our own rule is that
  the sheet never covers any part of it.
- **Forms:**
  - Option chips are native radio inputs in `<fieldset>`/`<legend>` groups.
  - Results and errors ("Tag added", "Marked still there", "Photo reported and hidden", "That spot is outside the
    Inner West") are announced through one polite `aria-live` region (4.1.3).
- **Times:** relative times include the absolute time in their accessible name ("disappears at 3:40 pm Tuesday").
- **Photos:**
  - Alt text is generated from the tag's fields ("Photo of a Lime e-bike reported as blocking the footpath").
  - A hidden photo is replaced by text, never a broken image.
- **Page structure:** `lang="en-AU"`, one `<h1>` per page, headings in order, plain-language copy.

### 10.5 Motion and input

- **Motion:**
  - Transitions are 200 ms or less, and nothing loops by default.
  - The pin bob plays only under `prefers-reduced-motion: no-preference` and stops after two cycles.
  - The map's loading bike and its "Map loading" dots are the one exception. They show the map is still coming, so
    they repeat until it is ready or fails (at most 15 s, §11.2), and stand still under `prefers-reduced-motion: reduce`.
  - Nothing flashes (2.3.1).
- **Touch targets:** at least 44 × 44 CSS px, well above the 24 px minimum in 2.5.8. Interface controls sit at least
  8 px apart. Pins can't promise that spacing, because they sit where the bikes are; overlapping pins open a chooser
  (§4.1).
- **Nothing needs a drag or a multi-finger gesture** (2.5.1, 2.5.7):
  - **Zoom:** + and − buttons.
  - **Pan:** a **Move map** button opens four arrow buttons, and each tap moves the map half a screen. Keyboard
    arrows alone don't meet 2.5.7, because a touch user who can't drag has no keyboard.
  - **Placing:** tap, keyboard, Use my location, or Choose by street (§10.3).
  - **The sheet never needs a drag.** Its height follows what it is showing. The tag card's handle shrinks and
    restores it with a tap; a flick on the handle is an optional extra (§12).
  - Map rotation is off.
- **No time limits** on any action (2.2.1). That includes the photo: the server sets no deadline for attaching it
  (§4.3).

### 10.6 Testing and ownership

- **Automated:**
  - `@axe-core/playwright` runs in the Playwright suite on every page and state: map, list, tag page, open card,
    each dialog, form errors, empty state, the map-failed state and admin. **Any** violation of a WCAG A or AA rule
    fails CI, whatever severity axe gives it.
  - The contrast unit test from §10.2.
- **Automated checks are not proof of AA.** axe covers only part of WCAG, so the manual pass below is a release gate
  too. Any A or AA failure it finds blocks the release until it is fixed.
- **Manual, at every milestone:**
  - VoiceOver on iOS Safari and TalkBack on Android Chrome, including tagging a bike from start to finish with Choose
    by street and with Use my location;
  - keyboard only on desktop;
  - touch without dragging: reach a spot that starts off screen and tag it using taps alone, then shrink and
    restore a tag card the same way;
  - 200% zoom, 320 px width, and the largest system text size on an SE-sized phone, checking that each form's
    submit and cancel buttons can be reached;
  - label and pin contrast judged on the real map on a phone, not only in the token test.
  - The checklist lives in `docs/accessibility-checklist.md`.
- **Accessibility statement** at `/accessibility`, with a contact address and known limits (the map artwork is
  visual-only; the list view and Choose by street are its equivalents).

## 11. Performance plan

Assumptions: phones on 4G, with a mid-range Android (Moto G class) as the reference device, and under 100 visits a
day.

### 11.1 Budgets

Every number here is **provisional until M0**. That milestone measures a bare production build with pinned
dependency versions. If Next.js and MapLibre alone don't fit, the budgets are reset from that evidence.

**Lab gates.** Measured in CI on every PR; a miss fails the build (§11.4).

| Measure | Budget |
|---|---|
| Largest Contentful Paint (LCP) | ≤ 2.5 s |
| Cumulative Layout Shift (CLS) | ≤ 0.1 |
| Total Blocking Time (the lab stand-in for INP) | ≤ 200 ms on pages without the map (set in PR 2: headless Chrome draws the map in software, and TBT on the map page measured 4.7 to 7 s in CI, while with a GPU opening a card takes 48 ms; the scripted interactions gate the map page instead) |
| Scripted interactions: open a card, pick a chip, zoom, open the form, type in the street search, choose a street | Each ≤ 200 ms to the next paint (in the lab, picking a chip and the two street-picker steps keep 200 ms, as they move no map, and the other three get 600 ms, set in PR 2: headless Chrome reads its software-drawn canvas back in each frame the map takes part in, and with a GPU opening a card takes 48 ms; the M1 real-phone check holds 200 ms) |
| **Map ready for placement:** tiles, labels and pins drawn, and taps accepted | ≤ 6 s (to be set properly from M1 measurements; the lab gate is 14.5 s over the 4G profile, set in PR 2 from 8.2 s measured: 960 KB behind four round trips) |
| JavaScript before the map loads (gzip, as transferred) | ≤ 150 KiB (reset at M0: the framework alone is 139 KB gzip, 119 KB Brotli) |
| Map bundle: MapLibre + `pmtiles` + style (compressed, as transferred) | ≤ 300 KB, loaded after first paint |
| First map view | ≤ 40 tile requests, ≤ 1.5 MB |
| Fonts | 2 woff2 files (400 and 700), Latin subset, ≤ 60 KB total |
| `GET /api/tags` response (compressed) | ≤ 15 KB for 100 tags |
| Corner list for the street picker (compressed) | ≤ 100 KB, loaded only when the picker opens |
| House numbers for one suburb (compressed) | ≤ 40 KB, loaded only when a street in that suburb is chosen |

**Field targets.** For real visitors on mobile at the 75th percentile: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1. With
under 100 visits a day there may be too little data to judge these, so they are watched, not gated.

### 11.2 Loading

- **First paint:**
  - The shell is static: header, sheet and a reserved space for the bike count.
  - Show a **static preview image** of the council (a pre-rendered WebP of about 40 KB, regenerated at build). It is
    the page's largest element, so it sets LCP.
  - MapLibre is loaded with a dynamic import after first paint and replaces the preview once the map is ready. The
    map container has a fixed size, so nothing shifts.
  - The count and pins come from one `GET /api/tags` request, so first paint never waits for the database.
- **A fast preview must not hide a slow or broken map.**
  - "Map ready for placement" has its own budget (§11.1), separate from LCP.
  - While the map loads, the preview carries a "Loading map…" status and the List toggle already works.
  - If WebGL is missing, a style or tile request fails, or the map isn't ready after 15 s, the preview stays and a
    message offers the way round: "The map couldn't load. Use the list instead." Tagging still works from the list,
    through Choose by street (§10.3).
- **`/list` and `/tag/[id]`** never load MapLibre.
- **Fonts:** self-hosted with `font-display: swap`, and the 400 weight preloaded. Map glyphs for the same font are
  served as PBF ranges 0–255 only.
- **PMTiles:**
  - versioned filename with `Cache-Control: public, max-age=31536000, immutable`;
  - byte-range requests cached at the CDN;
  - `maxBounds` and a minimum zoom of 12, so no out-of-area tiles are fetched;
  - before M1 exit, check on the deployed Blob store that range requests return 206, that the CORS and cache headers
    are right, and that repeat requests come from cache. Do this on the oldest supported Safari and on current
    Android Chrome ([Protomaps' hosting notes](https://docs.protomaps.com/pmtiles/cloud-storage)).

### 11.3 Data and runtime

- **Tag data:** `GET /api/tags` reads the database on every request, with no CDN cache.
  - **Why:** admin changes happen in a separate Vercel project, which can't clear the public project's cache. At
    under 100 visits a day, a direct read is simpler than building that link. `/list` and `/tag/[id]` read directly
    too, so every page agrees.
  - `shortcut: uncached reads, add a CDN cache of a few seconds if traffic passes a few thousand visits a day.`
  - **Refresh:** the page fetches again when the tab regains focus, after each of its own writes, and every 5 minutes
    while it is visible. Each refresh drops tags that are no longer live and photos that have been hidden.
  - Between refreshes, the browser hides tags itself as they pass `expires_at`.
- **Markers:** at most 200 HTML markers (fewer than 100 are expected).
  `shortcut: HTML markers, switch to a clustered symbol layer plus the list if live tags pass 200.`
- **Map settings:**
  - one map instance;
  - no pitch, 3D or rotation;
  - `fadeDuration: 0` and a modest tile cache;
  - no continuous animation, to save battery.
- **Photos:**
  - 320 px WebP thumbnails (about 20 KB) load only when a card opens; the full size loads on tap;
  - explicit width and height, so nothing shifts.
- **Database wake-up:** the database sleeps after 5 idle minutes and takes about 0.5 s to wake. That delay can land
  on the first read or write after a quiet spell. The static shell and preview don't wait for it. The count, the
  pins, `/list` and `/tag/[id]` do.
- **Writes:**
  - The interface updates optimistically and then reconciles.
  - Uploads are resized in the browser to at most 2048 px (about 1 MB) before sending.

### 11.4 Measuring

- **Every PR, in GitHub Actions,** against a production build served with compression:
  - **Lighthouse CI** (mobile preset, throttled) asserts LCP, CLS and Total Blocking Time. Lighthouse loads a page
    without touching it, so it can't measure INP.
  - **Playwright** times the scripted interactions and "map ready" (with the CPU at full speed since PR 2, as the map
    is drawn in software). From its network log it also asserts the transfer sizes, and the tile count and bytes of
    the first map view.
- **Real users:** Vercel Speed Insights on the web project, if the Pro plan includes it at this volume (check at M0).
  It is the only source for INP and the other field targets. Without it, the lab gates stand alone.
- **M0:** measure the bare build, then confirm or reset the budgets (§11.1).
- **M1 exit:** a test on a real mid-range Android over throttled 4G, plus the PMTiles checks in §11.2.

## 12. Mobile usability plan

- **Mobile first,** designed for 320–430 px. At 768 px and wider, the bottom sheet becomes a side panel (§13).
- **Layout:**
  - The map fills the viewport below the header (`100dvh`).
  - The sheet has three heights, set by what it is showing:
    - **peek:** the count and primary button, the placement bar, or a shrunk tag card;
    - **half:** a tag card;
    - **full:** any of the dialogs in §10.4, over a short map strip. The strip is for reference only and can't be
      touched.
  - **The tag card can be shrunk,** to show more of the map without closing it.
    - A handle at the top of the card is a real button. A tap shrinks the card to one line ("Lime e-bike · Blocking
      footpath · Denison St"), and a second tap brings it back.
    - A flick does the same: a vertical swipe of 30 px or more that starts on the handle. The card switches when the
      finger lifts. It doesn't follow the finger.
    - Only the handle listens for the flick, never the card's content, so it can't fight with scrolling inside the
      card.
    - The switch takes 200 ms or less, and is instant under `prefers-reduced-motion: reduce`.
    - While the card is shrunk, its other buttons are out of reach of pointer and keyboard. The handle and Close
      stay.
    - `shortcut: flick on release, upgrade to a card that follows the finger if this feels stiff on phones at M1.`
  - **Dialogs and the browse panel have no handle.** A dialog keeps its height and closes only with Cancel or Esc, so
    a stray swipe can't dismiss a half-filled form.
  - The page itself never scrolls while the map is visible, so scrolling and panning never fight. `touch-action` is
    set on the map only.
  - **The sheet scrolls inside itself.** Its height is capped at the space left under the header and inside the safe
    areas, and its content scrolls vertically (`overflow-y: auto`, `overscroll-behavior: contain`). A form made
    taller by large text, wrapped chips or an error message can always be scrolled to its buttons.
  - Every card and dialog has a visible Close or Cancel button at the top, and the focused control is scrolled into
    view.
  - **On-screen keyboard:** only the street picker opens one, for the street search and the house number. Each
    input sits at the top of the dialog with its results directly beneath, and the dialog is sized to the visual
    viewport so the keyboard doesn't cover them.
    `100dvh` alone doesn't handle this.
- **Safe areas:** `viewport-fit=cover` and `env(safe-area-inset-*)` padding for notches and the home indicator.
- **Thumb reach:** primary actions sit in the bottom 40% of the screen. The header holds only the name and "Why this
  page exists".
- **Accurate placement:**
  - Placing a tag needs zoom 16 or closer, at about 2 m per screen pixel. "Tag a dumped bike" zooms there first.
  - Placement is its own step with the whole map usable. The pin's tip sits exactly on the tapped point, tapping
    somewhere else moves it, and **Use this spot** opens the form (§3).
  - From the form, **Change location** comes back to this step.
  - **Use my location** proposes a pin when the phone's location is accurate to 50 m or better (§4.1).
  - Tags up to 20 m outside the boundary are accepted (§4.1).
- **Gestures:**
  - pinch, double-tap zoom and one-finger pan, each with a button that does the same: +/− and Move map (§10.5);
  - rotation and pitch are off, so the map can't land in a confusing state;
  - browser page zoom is never disabled.
- **Forms:**
  - native radio inputs styled as 44 px chips;
  - no typing is needed to tag a bike. The street search and house number (§10.3) are the only text boxes, and
    both are optional;
  - the photo input lets iOS and Android offer camera or library.
- **Poor connections:**
  - Every write carries an ID made in the browser, and the server returns the current state for a repeat, so a retry
    can't act twice (§5.3).
  - Network failures and server errors are retried up to three times with backoff, and the form keeps its state.
  - The tag and its photo are sent separately. If only the photo fails, the tag is kept and the photo can be retried
    on its own (§4.3).
  - The error reads "Couldn't send. Check your connection and try again."
  - There is no offline queue in v1.
- **Browsers:** iOS Safari 16.4+, plus the last two versions of Chrome for Android and Samsung Internet. Desktop
  browsers are listed in §13.
  - Older browsers, such as iOS 15, get the list view instead of the map. Their PMTiles range requests trigger a
    pre-check that Blob rejects.
  - If the map fails to load on a supported browser, the list is offered in its place (§11.2).
- **Orientation:** portrait first. Landscape uses the side-panel layout.
- **Testing:**
  - Playwright mobile projects (iPhone 13 and Pixel 7 emulation) for every flow.
  - Manual checks at every milestone on a small iPhone (SE size), a current iPhone and a mid-range Android:
    - the largest system text size, landscape, and the browser's toolbar both expanded and collapsed;
    - the street search and house number with the on-screen keyboard open;
    - a real photo from the camera and one from the library, on both iOS and Android;
    - Use my location outdoors, both allowed and refused, on both iOS and Android;
    - the map on the oldest supported Safari (16.4).

## 13. Desktop

The site is designed for phones first (§12). On a larger screen it must work just as well with a mouse and a
keyboard. The layout is the fourth screen in `docs/mockups/graveyard-v3.html`.

- **Browsers:** the last two versions of Chrome, Edge, Firefox and Safari on desktop. If the map can't load, the list
  is offered in its place, as on phones (§11.2).
- **Layout, at 768 px and wider:**
  - The header runs across the top. Below it, the panel sits on the left, 380 px wide and full height. The map fills
    the rest.
  - There is no maximum width. On a very wide screen the map gets wider and the panel stays 380 px.
  - The text pages (`/why`, `/privacy` and the rest) and `/list` keep their content in a centred column no wider than
    about 70 characters.
- **What the panel shows:**
  - **Browsing:** the count, the operator key and "Tag a dumped bike", then the list of live tags grouped by suburb.
    The panel has the room, so the List toggle isn't shown at this width.
    - The rows are the ones the crowded-pin chooser uses (§4.1), and the list scrolls inside the panel.
    - Clicking a row opens that tag's card, pans the map to its pin and outlines the pin.
  - **A tag card** opens in the panel in place of the list. Its Close button returns to the list.
  - **Forms** (the tag form, report form, street picker and "Is it one of these?") open inside the panel too, not as
    a centred box. They are still modal dialogs (§10.4), so the map is dimmed and can't be used while one is open.
    The placement step is not a dialog, and the map stays live for it.
- **No handle on the tag card.** The panel sits beside the map and covers none of it, so there is nothing to shrink
  (§12).
- **Mouse:**
  - Click a pin to open its card. During placement, click the map to drop or move the pin.
  - Dragging pans and the scroll wheel zooms. The +/− and Move map buttons are there as well (§10.5).
  - **Hover changes appearance only.** The cursor becomes a pointer, and the pin or list row gets the same outline
    as keyboard focus. Nothing appears on hover that isn't available another way, so there are no tooltips to build
    or to make accessible.
- **Keyboard:** as in §10.4. A manual keyboard-only pass runs in Chrome, Safari and Firefox at every milestone.
- **Use my location:** a computer usually works out its location from Wi-Fi or the network, which is often worse
  than the 50 m cut-off. The map then centres roughly and asks for a click (§4.1). That is the expected result on
  desktop, not an error.
- **Photos:** the same file input opens a file picker. Dragging a file onto the page isn't needed in v1.
- **Performance:** the budgets are set and gated on mobile (§11.1). Desktop has no separate gate.
- **Testing:** the Playwright desktop project (1280 × 800) runs every flow and the axe checks at this layout.

## 14. Open questions

1. **"Why this page exists" copy:** to be supplied by Michael; launch is blocked until then.
2. **Operator report links:** should the tag card show a small "Report to Lime" contact link? It's still
   public-visibility only, but it helps the bike actually get moved. The contact details are in Appendix B.
3. **Domain:** settled. innerwestbikegraveyard.com, live since 11 November 2026 (§2).
4. **Address data licence:** the NSW record says "Creative Commons" without a version. Confirm CC BY 4.0 with Spatial
   Services before launch (§4.1).

## 15. Milestones

| Milestone | Scope | Exit criteria |
|---|---|---|
| **M0 Infra** | GitHub repo; Turborepo skeleton; Vercel projects (`web`, `admin`) in `michael-lebot's projects`, region `syd1`; Neon via the Vercel Marketplace (Sydney); Blob stores (public and private); Resend; `CRON_SECRET`; CI (lint, typecheck, Vitest, axe, Lighthouse CI and the Playwright performance checks from §11.4, contrast test); spend alert | Empty apps deploy; Prisma migration runs on Neon; CI gates run; the bare build is measured and the §11.1 budgets are confirmed or reset |
| **M1 Map prototype** | PMTiles extract on Blob; Overworld MapLibre style with pattern sprites; mask and gold council line; Atkinson Hyperlegible glyphs; HTML-marker pins with the crowded-pin chooser; zoom and Move map buttons; static preview image and the map-failed fallback; bottom sheet with its three heights, inner scrolling and the tag card's handle; the desktop side-panel layout (§13) | On a real mid-range Android over 4G, the §11.1 budgets pass, including "map ready"; the PMTiles checks in §11.2 pass; street names are legible at zoom 16 on a 320 px screen; VoiceOver and TalkBack can reach every pin; a spot that starts off screen can be reached with taps alone; a tag card shrinks and restores by tap and by flick; the desktop layout passes the keyboard-only check; contrast test passes |
| **M2 Tags** | Placement step and form dialog (zoom ≥ 16, buffered boundary, keyboard crosshair, Use my location, Choose by street with house numbers and corners, Change location); nearby-tag suggestion; still-there and removed under the §4.2 rules; safe retries (§5.3); BotID; rate limits; the hourly job; `/list` and `/tag/[id]`; admin Tags screen with Undo and Take down | Playwright (desktop and mobile projects): create → confirm → remove → admin undo, by touch, by keyboard, by Use my location, and by Choose by street with no map (by house number and by corner); the §5.5 tests for expiry edges, two at once, repeats, access, the hourly job, house numbers and Use my location pass; axe finds no A or AA violations; at the largest text size on an SE-sized screen, the form can be submitted and cancelled |
| **M3 Photos and moderation** | Upload pipeline; photo attach with its own retry; private serving; reports; email with digest retry; admin queue; pause switch and circuit breaker | A reported photo returns 404 on the next request and stays hidden through remove → undo; a photo returns 404 once its tag is no longer live; restore works; the §5.5 photo, bad-image and outside-failure tests pass; generated alt text is present; the admin app passes axe |
| **M4 Launch** | `/why`, `/accessibility`, `/privacy`, `/terms`; eSafety classification and response procedure (§7); address-data licence confirmed (§14); domain; OSM and NSW attribution; manual assistive-technology pass (§10.6); launch checklist | Michael signs off |

## 16. Out of scope for v1

Hosting-cost tracker and contributions (deferred, §4.5); accounts; free-text notes; automated image moderation;
placing a tag from a photo's stored location; live location tracking; operator or council integrations and
notifications; multiple photos per tag; a stats or heat-map page (the data is kept for later); dark mode; an offline
queue and installable-app (PWA) support; other councils; an abuse dashboard and visitor blocking; a sheet that
follows the finger; a CDN cache for tag data.

## Appendix A — Cost tracking and contributions research (parked)

Kept so the feature can be revived quickly if costs grow.

**Contributions**
- **Recommended:** Ko-fi on the free plan, paid out to a personal PayPal account.
  - Ko-fi takes 0% on one-off tips. PayPal charges 2.9% + A$0.30 for donations to non-charities.
  - No ABN is needed, and a webhook reports each payment's amount and timestamp.
  - Weakness: Ko-fi can't stop taking money once a target is met.
- **Stripe** has the lowest fees and the best controls. But its Australian policy "cannot support donations which are
  not linked to a specific good or service", so get written confirmation from Stripe before relying on it.

**Cost data**
- **Vercel:** `GET /v1/billing/charges` returns daily FOCUS rows. Filter on the project ID in `Tags` and
  `ChargeCategory = Usage`, using a Billing-role token.
- **Neon:** `GET /consumption_history/v2/projects` works on the Launch plan, which the org now has.
- Convert to AUD with the RBA's daily rate, and keep prices in a table with effective dates.
- **Defining 100%:** a week's cost isn't final until the week ends. Use the larger of the cost so far and the average
  of the last 4 weeks.

## Appendix B — Operators (as at Nov 2026)

| Operator | Reporting channel |
|---|---|
| Lime | 1800 861 305 · help-sydney@li.me · in-app |
| Hello (HelloBike) | serviceos@hellobike.com · in-app (unverified) |
| Ario | 1800 882 764 · support@ario.com · in-app (unverified) |

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
  - [Protomaps PMTiles cloud storage](https://docs.protomaps.com/pmtiles/cloud-storage)
  - [MapLibre MapOptions (`pixelRatio`)](https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/MapOptions/)
  - [MapLibre `within`](https://maplibre.org/maplibre-style-spec/expressions/#within)
  - [turf buffer](https://turfjs.org/docs/api/buffer)
  - [OSM attribution guidelines](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines)
  - [NSW Spatial Services copyright](https://www.spatial.nsw.gov.au/copyright)
  - [Neon extensions](https://neon.com/docs/extensions/pg-extensions)
  - [NSW Geocoded Addressing Theme](https://data.nsw.gov.au/data/dataset/1-9b2990428ef4411da7c61ae56b2c6806)
  - [NSW Geocoded Addressing Theme, GDA2020 service](https://data.nsw.gov.au/data/dataset/1-7cd525ea0da74a169ccdd6979e28c793)
  - [Protomaps basemap layers (address points)](https://docs.protomaps.com/basemaps/layers)
- **Platform:**
  - [Vercel fair use](https://vercel.com/docs/limits/fair-use-guidelines)
  - [Vercel pricing](https://vercel.com/docs/pricing)
  - [Vercel WAF rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)
  - [Vercel Cron: securing cron jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs)
  - [Vercel caches are per project](https://vercel.com/kb/guide/share-vercel-cache-across-deployments-nextjs)
  - [Vercel Sydney pricing](https://vercel.com/docs/pricing/regional-pricing/syd1)
  - [Neon plans](https://neon.com/docs/introduction/plans)
  - [Neon pricing](https://neon.com/pricing)
- **Accessibility and performance:**
  - [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
  - [WCAG 2.5.7 Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html)
  - [WCAG 2.2.1 Timing Adjustable](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html)
  - [WCAG 2.4.7 Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html)
  - [WCAG 2.4.11 Focus Not Obscured (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)
  - [W3C modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
  - [Core Web Vitals thresholds](https://web.dev/articles/vitals)
  - [axe-core for Playwright](https://github.com/dequelabs/axe-core-npm/tree/develop/packages/playwright)
  - [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci)
  - [MapLibre Marker](https://maplibre.org/maplibre-gl-js/docs/API/classes/Marker/)
  - [Atkinson Hyperlegible](https://www.brailleinstitute.org/freefont/)
- **Security:**
  - [Vercel BotID](https://vercel.com/docs/botid)
  - [Vercel Blob private storage](https://vercel.com/docs/vercel-blob/private-storage)
  - [Vercel protect production deployments](https://vercel.com/changelog/protect-production-deployments-for-free-on-every-plan)
  - [sharp constructor](https://sharp.pixelplumbing.com/api-constructor)
  - [OWASP file upload](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
  - [Resend pricing](https://resend.com/pricing)
  - [OAIC small business](https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/organisations/small-business)
  - [eSafety cyberbullying scheme guidance](https://www.esafety.gov.au/sites/default/files/2025-01/Cyberbullying-Scheme-Regulatory-Guidance-Updated-January2025_0.pdf)
  - [eSafety industry codes and standards](https://www.esafety.gov.au/industry/codes)
- **Parked (Appendix A):**
  - [Ko-fi fees](https://help.ko-fi.com/hc/en-us/articles/360002506494)
  - [PayPal AU fees](https://www.paypal.com/au/webapps/mpp/merchant-fees)
  - [Stripe tips and donations policy](https://support.stripe.com/questions/requirements-for-accepting-tips-or-donations)
  - [Vercel FOCUS billing charges](https://vercel.com/docs/rest-api/reference/endpoints/billing/list-focus-billing-charges)
  - [Neon consumption API v2](https://neon.com/docs/reference/api/consumption/get-consumption-history-per-project-v2)
