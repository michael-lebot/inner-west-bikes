# Launch

Two parts: the **deploy runbook**, in the order to follow it, and the **launch checklist**, which is everything left
for Michael in `tasks/plan.md` §6. Nothing here is needed for local development or CI; the README covers those. Each
variable the apps read is described in its `.env.example`.

## Deploy runbook

### 1. Two Vercel projects

In the `michael-lebot's projects` team, import the GitHub repository twice:

- `web`, with root directory `apps/web` and this build command:

  ```sh
  DATABASE_URL=$DATABASE_URL_UNPOOLED pnpm --filter @iwb/server migrate:deploy && pnpm turbo run build --filter=@iwb/web
  ```

- `admin`, with root directory `apps/admin` and the default build command.

- Node.js 24.x for both. Each `vercel.json` puts its functions in Sydney (`syd1`), and the web project's adds the
  hourly job.
- The web build migrates the database before it builds, over the unpooled connection, as Prisma's migrations need.
  Turbo passes the build only the variables `turbo.json` names; `env.ts` needs no others when it loads
  (`packages/server/src/env.test.ts`).

### 2. The database

- Add Neon from the Vercel Marketplace in the same team: region Sydney (`aws-ap-southeast-2`), connected to both
  projects, with a branch for each preview deployment. It sets `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED`.
- Production starts empty. Never load `packages/server/prisma/seed.sql` there.

### 3. The two Blob stores

- **Tiles, public.** Run `pnpm tiles`, then upload `apps/web/public/tiles/inner-west.pmtiles` to a new public Blob
  store under a name with the build's date, `inner-west-20261108.pmtiles` (the date pinned in
  `apps/web/scripts/fetch-tiles.sh`), with a one-year cache (`vercel blob put --help` names the options). Set its URL as
  `NEXT_PUBLIC_TILES_URL` on `web`, for Production and Preview. The CSP lets the map fetch from its origin
  (`apps/web/proxy.ts`). A new extract gets a new name, so the long cache never serves an old one.
- **Photos, private.** Create a second store with private access, which can't be changed later, and connect it to
  both projects, which sets `BLOB_READ_WRITE_TOKEN` on each: the web app stores and serves photos, and the admin app
  shows and deletes them.

### 4. Secrets and settings on `web`

For Production and Preview:

- `HASH_SECRET` and `CRON_SECRET`: 32 random bytes each, from `openssl rand -hex 32`.
- Resend: make an account and an API key that can send, as `RESEND_API_KEY`. Set `ALERT_EMAIL_TO` to the Resend
  account's own address: until a domain is verified there, Resend sends only to it, from `onboarding@resend.dev`.
- `ADMIN_URL`: the admin project's production address, which every alert links to.
- Leave "Automatically expose System Environment Variables" on, as it is by default. BotID's check is built into the
  browser's code only when `NEXT_PUBLIC_VERCEL_ENV` is set, while the server checks whenever `VERCEL` is, so without
  them every write gets 403.

### 5. Protection

- **BotID** on `web`, with Deep Analysis on.
- **Firewall** on `web`: a rate-limit rule for `POST /api/*`, 20 requests per 60 seconds per IP, answering 429.
- **Vercel Authentication** on `admin`: Deployment Protection, "All deployments", which includes production. The
  admin app has no sign-in of its own.
- **The hourly job** runs from `apps/web/vercel.json`. An hourly schedule needs the Pro plan.

### 6. Costs

- A spend-management alert on the team (`SPEC.md` §4.5).
- Speed Insights: check whether the Pro plan includes it at this volume, and if so turn it on for `web`.
- The domain comes later (`SPEC.md` §14.3). Then add it to `web`, verify it in Resend, set `ALERT_EMAIL_FROM` to an
  address on it, and change `ALERT_EMAIL_TO` if the alerts should go elsewhere.

### 7. Checks on the deployment

- [ ] **Tiles** (`SPEC.md` §11.2): the map loads on Safari 16.4 and on current Android Chrome, and repeat requests
      for the tiles come from the browser's cache. A range request answers 206 with the CORS and cache headers:

      ```sh
      curl -sI -r 0-16383 -H 'Origin: https://<web>' "$NEXT_PUBLIC_TILES_URL"
      ```

- [ ] **Admin access** (`SPEC.md` §5.5): with `pnpm db:up` running and after `pnpm build`, as Playwright starts the
      local servers too, this passes against a preview of `admin`:

      ```sh
      ADMIN_PREVIEW_URL=https://<admin preview> pnpm exec playwright test e2e/admin-access.spec.ts --project=desktop
      ```

- [ ] **BotID:** on a preview of `web`, a tag added and removed from a phone works, while this gets 403. Vercel
      Authentication guards previews by default, so the request carries the project's Protection Bypass for
      Automation secret, and the 403 is BotID's:

      ```sh
      curl -i -X POST https://<web preview>/api/tags -H "x-vercel-protection-bypass: $BYPASS" \
        -H 'content-type: application/json' -d '{}'
      ```

- [ ] **The visitor cookie** `iwb_v` is sent `Secure` (the browser's developer tools, Application, Cookies).
- [ ] **The hourly job:** `curl -i https://<web>/api/cron/hourly` answers 401 in production, and running it from the
      project's Cron Jobs settings answers 200 in its log.
- [ ] **Admin posts** get through Vercel's proxy: Undo removal on a preview answers 303 and shows its notice, not
      403, so the same-origin check holds.
- [ ] **Photos:** a tag with a photo from a phone shows its thumbnail and its full size, on the site and in the
      admin app.
- [ ] **Reports and email:** reporting that photo hides it, an alert arrives with a link to Reported photos, and
      Restore shows it again. Pause uploads, and the form says photos are off; Resume them.

## Launch checklist

Tick each when it is done. This is `tasks/plan.md` §6.

**Accounts and infrastructure (M0)**

- [ ] The two Vercel projects in `syd1`, Neon from the Marketplace, both Blob stores and the tiles upload (runbook
      1 to 3)
- [ ] BotID with Deep Analysis, the firewall rule, Vercel Authentication on `admin` (runbook 5)
- [ ] Resend, and later its domain; `HASH_SECRET` and `CRON_SECRET` (runbook 4, 6)
- [ ] The spend alert and the Speed Insights check (runbook 6)
- [ ] Empty apps deploy, and the Prisma migration runs on Neon (`SPEC.md` §15, M0)

**On the deployment**

- [ ] Every check in runbook 7

**Real devices and assistive technology (M1 to M4)**

- [ ] The `SPEC.md` §11.1 budgets, "map ready" among them, on a mid-range Android over throttled 4G
- [ ] Street names legible at zoom 16 on a 320 px phone, and whether the pattern fills look game-like
- [ ] Every check in `docs/accessibility-checklist.md`, at each milestone: VoiceOver and TalkBack, keyboard only,
      touch without dragging, zoom and text size, contrast on the real map, and on the phones landscape, the
      toolbar, the on-screen keyboard, camera and library photos, Use my location outdoors and Safari 16.4

**Content and legal (M4)**

- [ ] The `/why` copy (`SPEC.md` §14.1); launch waits for it
- [ ] A review of `/privacy` and `/terms`
- [ ] The contact address, on `/accessibility` and `/privacy`, monitored and forwarded to Michael's phone
- [ ] The eSafety classification in `docs/esafety.md` (`SPEC.md` §7)
- [ ] The address data's licence confirmed as CC BY 4.0 with NSW Spatial Services (`SPEC.md` §14.4)

**Decisions**

- [ ] Operator report links on the tag card (`SPEC.md` §14.2, not built)
- [ ] The domain (`SPEC.md` §14.3)

**Launch sign-off (M4)**

- [ ] Michael signs off
