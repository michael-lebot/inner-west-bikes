# The Inner West E-bike Graveyard

A no-login, 90s-video-game-style map of Sydney's Inner West Council area. Anyone can tag a dumped share bike
(Lime, Hello, Ario) so it gets seen and collected.

- Tags expire after 48 hours unless someone marks them **Still there**.
- Anyone can mark a tag **Removed**, which hides it straight away.
- Photos can be reported. A reported photo is hidden immediately and queued for review.

## Status

Being built in six pull requests: the plan is [`tasks/plan.md`](tasks/plan.md) and the checklist is
[`tasks/todo.md`](tasks/todo.md). The product spec is in [`SPEC.md`](SPEC.md).

The chosen visual direction is [`docs/mockups/graveyard-v3.html`](docs/mockups/graveyard-v3.html),
built with real NSW boundary and street data; open it in any browser. Earlier explorations are in
[`docs/mockups/explorations/`](docs/mockups/explorations/).

## Planned stack

Next.js 16 · Neon Postgres (Prisma, via the Vercel Marketplace) · Vercel (Sydney region) · Vercel Blob ·
MapLibre GL JS with self-hosted Protomaps tiles · Vercel BotID · Resend.

## Develop

You need Node 24 or later, pnpm 9.15.9 (`corepack enable` picks it up from `package.json`) and Docker.

```sh
pnpm install
pnpm db:up                                              # Postgres 18 on localhost:54318
cp packages/server/.env.example packages/server/.env    # the Prisma CLI reads DATABASE_URL from here
pnpm db:reset                                           # migrate the dev database and load 14 seeded tags
pnpm tiles                                              # the map tiles (needs the pmtiles CLI, see below)
pnpm dev                                                # the site on localhost:3000, admin on localhost:3001
pnpm exec playwright install chromium webkit            # once, for the end-to-end tests
```

| Script           | What it does                                                                      |
| ---------------- | --------------------------------------------------------------------------------- |
| `pnpm db:up`     | Start Postgres in Docker and wait until it is healthy                             |
| `pnpm db:down`   | Stop it (the data volume is kept)                                                 |
| `pnpm db:reset`  | Empty the dev database, apply every migration and load the seed                   |
| `pnpm tiles`     | Cut the Inner West map tiles out of the pinned Protomaps build (git-ignored)      |
| `pnpm dev`       | Both apps in development mode                                                     |
| `pnpm start`     | Both apps from their production builds                                            |
| `pnpm lint`      | ESLint, including the import rules, and Prettier                                  |
| `pnpm typecheck` | TypeScript in every package and in the end-to-end tests                           |
| `pnpm test`      | Vitest in every package, against the `iwb_test` database                          |
| `pnpm build`     | Production builds of both apps                                                    |
| `pnpm e2e`       | Playwright and axe on iPhone, Pixel and desktop, against the builds and `iwb_e2e` |
| `pnpm lhci`      | Lighthouse CI on `/` and `/list`, after `pnpm e2e`                                |
| `pnpm verify`    | All of the above from `lint` on, in that order                                    |

## Map data

- **Tiles:** `pnpm tiles` runs [`apps/web/scripts/fetch-tiles.sh`](apps/web/scripts/fetch-tiles.sh), which needs the
  [`pmtiles` CLI](https://github.com/protomaps/go-pmtiles/releases) (`brew install pmtiles`). It writes
  `apps/web/public/tiles/inner-west.pmtiles` (about 13 MB), which `next start` serves with range requests.
- **Label glyphs:** the map draws its labels in Atkinson Hyperlegible from signed-distance-field PBFs, range 0–255
  only, committed in `apps/web/public/glyphs/` (the font's licence is `apps/web/public/fonts/OFL.txt`). To make them
  again, put `AtkinsonHyperlegible-Regular.ttf` and `-Bold.ttf` from
  [google/fonts](https://github.com/google/fonts/tree/main/ofl/atkinsonhyperlegible) in a folder `fonts/`, then:

  ```sh
  cargo install build_pbf_glyphs@1.5.1
  build_pbf_glyphs fonts glyphs
  for style in Regular Bold; do
    cp glyphs/AtkinsonHyperlegible-$style/0-255.pbf apps/web/public/glyphs/AtkinsonHyperlegible-$style/
  done
  ```

- **Council, suburbs, streets and house numbers:** the committed files in `packages/shared/data/` come from NSW
  Spatial Services. `pnpm --filter @iwb/shared data:fetch` downloads them again (about 50 MB, two minutes) and
  `data:build` rebuilds the files.
- **Preview image:** `pnpm dev` and `pnpm build` first draw `apps/web/public/preview.webp` (git-ignored) from that
  data with [`apps/web/scripts/build-preview.ts`](apps/web/scripts/build-preview.ts). The map screen shows it until
  the map is ready, and keeps it if the map can't load.

## Data attribution

- Map data © OpenStreetMap contributors.
- Council and suburb boundaries and street names © State of New South Wales (Spatial Services, DCS NSW), CC BY 4.0.
- House numbers © State of New South Wales (Spatial Services, DCS NSW), under a Creative Commons licence whose
  version is to be confirmed before launch (SPEC.md §14).
