# Launch

Two parts: the **deploy runbook**, in the order to follow it, and the **launch checklist**, which is everything left
for Michael in `tasks/plan.md` §6. Nothing here is needed for local development or CI; the README covers those. Each
variable the apps read is described in its `.env.example`.

## Deploy runbook

Everything is in the team `michael-lebot's projects` (CLI scope `michael-lebots-projects`, Pro plan), with the Vercel
CLI signed in as its owner. A dashboard path starts from the project's page in that team; a CLI command runs from the
repository's root.

### 1. Two Vercel projects

Dashboard, **Add New… → Project**, import the GitHub repository twice:

- `web`: **Root Directory** `apps/web`, and under **Build and Output Settings** override the **Build Command** with:

  ```sh
  DATABASE_URL=$DATABASE_URL_UNPOOLED pnpm --filter @iwb/server migrate:deploy && pnpm turbo run build --filter=@iwb/web
  ```

- `admin`: **Root Directory** `apps/admin`, and the default build command.

The first deployment of each fails, as there is no database or Blob token yet; step 6 deploys them again. Then in
each project, **Settings → Build and Deployment**: **Node.js Version** 24.x, and under **Root Directory** leave
**Include files outside the root directory in the Build Step** on, as the apps build `packages/`. And in each,
**Settings → Environment Variables**, for every environment, add `ENABLE_EXPERIMENTAL_COREPACK` = `1`: Vercel then
installs with pnpm 9.15.9, the `packageManager` in `package.json` that CI and the lockfile use, where a new project
would otherwise get pnpm 10. Each `vercel.json` puts its functions in Sydney
(`syd1`), and the web project's adds the hourly job.

The web build migrates the database before it builds, over the unpooled connection, as Prisma's migrations need.
Turbo passes the build only the variables `turbo.json` names, and `env.ts` needs no others when it loads
(`packages/server/src/env.test.ts`).

### 2. The database

- Team dashboard, **Storage → Create Database → Neon**: region Sydney (`aws-ap-southeast-2`).
- Then **Storage →** the database **→ Connect Project**, once for `web` and once for `admin`: environments Production
  and Preview, and under **Create database branch for deployment** tick Preview. Each project gets `DATABASE_URL`
  (pooled) and `DATABASE_URL_UNPOOLED`.
- Production starts empty. Never load `packages/server/prisma/seed.sql` there.

### 3. The two Blob stores

**Photos, private.** Private can't be changed later. The code reads the store's read-write token, which a connection
adds only when asked (`--add-rw-token`; in the dashboard, **Add a read-write token env var to this connection**), so
without it every build stops on `BLOB_READ_WRITE_TOKEN`:

```sh
vercel storage create iwb-photos --type blob --access private --region syd1 --scope michael-lebots-projects
for project in web admin; do
  vercel storage connect iwb-photos --project $project --environment production --environment preview \
    --auth token --add-rw-token --yes --scope michael-lebots-projects
done
vercel storage status iwb-photos --scope michael-lebots-projects   # both projects, with BLOB_READ_WRITE_TOKEN
```

The web app stores and serves photos, and the admin app shows and deletes them. Previews share this store with
production, which is why `CRON_SECRET` (step 4) is set for production only: the hourly job's sweep on a preview would
take production's newer photos for strays and delete them.

**Tiles, public.** It is connected only long enough to read a token for the upload, to `web`'s Development
environment under its own prefix, so it can never be taken for the photo store:

```sh
pnpm tiles
vercel storage create iwb-tiles --type blob --access public --region syd1 --scope michael-lebots-projects
vercel storage connect iwb-tiles --project web --environment development --auth token --add-rw-token --prefix TILES \
  --yes --scope michael-lebots-projects
vercel storage status iwb-tiles --scope michael-lebots-projects     # the token variable's name
mkdir -p ../iwb-link && (cd ../iwb-link && vercel link --yes --project web --scope michael-lebots-projects \
  && vercel env pull .env.tiles --environment development)        # the token is in ../iwb-link/.env.tiles
vercel blob put apps/web/public/tiles/inner-west.pmtiles --access public --pathname inner-west-20261108.pmtiles \
  --cache-control-max-age 31536000 --rw-token "<the token>"        # prints the file's URL
vercel storage disconnect iwb-tiles --project web --scope michael-lebots-projects && rm -r ../iwb-link
```

The name carries the build's date, the one pinned in `apps/web/scripts/fetch-tiles.sh`, so a new extract gets a new
name and the year-long cache never serves an old one. Blob sends `Cache-Control: public, max-age=31536000`; it can't
add the `immutable` that `SPEC.md` §11.2 names, and the dated name does that job. The printed URL becomes
`NEXT_PUBLIC_TILES_URL` (step 4); the CSP lets the map fetch from its origin (`apps/web/proxy.ts`).

### 4. Settings on `web`

**Settings → Environment Variables → Add**, each marked Sensitive except the tiles URL, which is public anyway:

| Variable                | Environments           | Value                                                                    |
| ----------------------- | ---------------------- | ------------------------------------------------------------------------ |
| `HASH_SECRET`           | Production and Preview | `openssl rand -hex 32`                                                   |
| `CRON_SECRET`           | Production only        | `openssl rand -hex 32`. Vercel sends it to the hourly job                |
| `ADMIN_URL`             | Production and Preview | The admin project's production address, from `admin`'s Settings, Domains |
| `NEXT_PUBLIC_TILES_URL` | Production and Preview | The URL `vercel blob put` printed in step 3                              |

On the same page, leave **Enable access to System Environment Variables** ticked, as it is by default. BotID's check
is built into the browser's code only when `NEXT_PUBLIC_VERCEL_ENV` is set, while the server checks whenever `VERCEL`
is, so without them every write gets 403.

`RESEND_API_KEY` and `ALERT_EMAIL_TO` stay unset until Resend is set up (step 7). Until then each alert is printed to
the function log (**Logs**, search for `[email]`) and reaches no phone, so Michael opens Reported photos in the admin
app every day (`docs/esafety.md`).

### 5. Protection

- **BotID** on `web` runs at its free Basic level as soon as the site is deployed, with nothing to turn on beyond the
  system variables of step 4. Deep Analysis, later: **Firewall → Rules → Vercel BotID Deep Analysis** (Pro, US$1 per
  1,000 checks).
- **Firewall** on `web`: **Firewall → Configure → + New Rule**, named `Public writes`. If **Request Path** starts with
  `/api/` and **Method** equals `POST`, then **Rate Limit**: **Fixed Window**, **Time Window** 60 s, **Request Limit**
  20, keyed on **IP Address**, answering **Too Many Requests (429)**. **Save Rule**, then **Review Changes** and
  **Publish**.
- **Vercel Authentication** on `admin`: **Settings → Deployment Protection → Vercel Authentication** on, with **All
  Deployments**, which includes production, then **Save**. The admin app has no sign-in of its own. `web` keeps the
  default, Standard Protection: previews need a Vercel sign-in, production is public.
- **The hourly job** runs from `apps/web/vercel.json`, on production deployments only, and is listed under `web`'s
  **Schedules → Cron Jobs**. An hourly schedule needs the Pro plan.

### 6. Deploy

Deploy `web` first, as its build migrates the database, then `admin`: in each project, **Deployments →** the failed
first deployment **→ ⋯ → Redeploy**. A change to a project's variables reaches only deployments made after it.

### 7. Costs, and later

- A spend alert on the team: **Team Settings → Billing → Spend Management**, with an amount and its notifications on
  (`SPEC.md` §4.5).
- Speed Insights: only if the Pro plan includes it at this volume. It needs `@vercel/speed-insights` and its component
  in the web app's layout, which isn't built (`tasks/plan.md` assumption 28), so it is a code change, with its own
  JavaScript before the map, and then `web`'s **Speed Insights → Enable**.
- Resend, when it is wanted: an account and an API key that can send. On `web`, for Production, set `RESEND_API_KEY`
  and `ALERT_EMAIL_TO`, the Resend account's own address: until a domain is verified there, Resend sends only to it,
  from `onboarding@resend.dev`. Then redeploy `web`.
- The domain (`SPEC.md` §14.3): add it under `web`'s **Settings → Domains**, verify it in Resend, set
  `ALERT_EMAIL_FROM` to an address on it, and change `ALERT_EMAIL_TO` if the alerts should go elsewhere.

### 8. Checks on the deployment

- [ ] **Tiles** (`SPEC.md` §11.2): the map loads on Safari 16.4 and on current Android Chrome, and repeat requests
      for the tiles come from the browser's cache. A range request answers 206 with `access-control-allow-origin` and
      `cache-control: public, max-age=31536000`:

      ```sh
      curl -sI -r 0-16383 -H 'Origin: https://<web>' "$NEXT_PUBLIC_TILES_URL"
      ```

- [ ] **Admin access** (`SPEC.md` §5.5): with `pnpm db:up` running and after `pnpm build`, as Playwright starts the
      local servers too, this passes against the admin app's production address (Vercel Authentication guards every
      deployment, so a preview's address works too):

      ```sh
      ADMIN_PREVIEW_URL=https://<admin> pnpm exec playwright test e2e/admin-access.spec.ts --project=desktop
      ```

- [ ] **BotID:** this, against `web`'s production address, answers 403 with `"code":"bot"`; a 400 `invalid` would mean
      BotID let it through. Meanwhile a tag added from a phone, and marked Removed, works:

      ```sh
      curl -i -X POST https://<web>/api/tags -H 'content-type: application/json' -d '{}'
      ```

- [ ] **The visitor cookie** `iwb_v` is sent `Secure` (the browser's developer tools, Application, Cookies).
- [ ] **The hourly job:** `curl -i https://<web>/api/cron/hourly` answers 401. Then
      `vercel crons run /api/cron/hourly --project web --scope michael-lebots-projects` runs it, and `web`'s
      **Schedules → Cron Jobs → View Logs** shows it answered 200.
- [ ] **Admin posts** get through Vercel's proxy: mark a tag Removed on the site, then on the admin app's Tags page
      open it and Undo removal. It answers with its notice, not 403, so the same-origin check holds.
- [ ] **Photos:** a tag with a photo from a phone shows its thumbnail and its full size, on the site and in the
      admin app.
- [ ] **Reports:** reporting that photo hides it, its alert is in `web`'s **Logs** (search for `[email]`) with the
      link to Reported photos, or in Michael's inbox once Resend is set up, and Restore shows it again. Pause uploads,
      and the form says photos are off; Resume them.

## Launch checklist

Tick each when it is done. This is `tasks/plan.md` §6.

**Accounts and infrastructure (M0)**

- [ ] The two Vercel projects in `syd1`, Neon from the Marketplace, both Blob stores and the tiles upload (runbook
      1 to 3)
- [ ] `HASH_SECRET`, `CRON_SECRET`, `ADMIN_URL` and the tiles URL (runbook 4)
- [ ] BotID at its Basic level, the firewall rule, Vercel Authentication on `admin` (runbook 5); BotID Deep Analysis
      when wanted (`SPEC.md` §6 has it on)
- [ ] Resend, and later its domain (runbook 7)
- [ ] The spend alert and the Speed Insights check (runbook 7)
- [ ] Empty apps deploy, and the Prisma migration runs on Neon (`SPEC.md` §15, M0)

**On the deployment**

- [ ] Every check in runbook 8

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
- [ ] Whether a photo whose tag is no longer live can still be reported, as built: the report hides it, so an Undo
      removal can't bring a harmful photo back (`tasks/plan.md` assumption 29)

**Launch sign-off (M4)**

- [ ] Michael signs off
