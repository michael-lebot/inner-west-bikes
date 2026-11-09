# The Inner West E-bike Graveyard

A no-login, 90s-video-game-style map of Sydney's Inner West Council area. Anyone can tag a dumped share bike
(Lime, Hello, Ario) so it gets seen and collected.

- Tags expire after 48 hours unless someone marks them **Still there**.
- Anyone can mark a tag **Removed**, which hides it straight away.
- Photos can be reported. A reported photo is hidden immediately and queued for review.

## Status

Pre-build. The product spec is in [`SPEC.md`](SPEC.md).

The chosen visual direction is [`docs/mockups/graveyard-overworld-v2.html`](docs/mockups/graveyard-overworld-v2.html),
built with real NSW boundary and street data; open it in any browser. Earlier explorations are in
[`docs/mockups/explorations/`](docs/mockups/explorations/).

## Planned stack

Next.js 16 · Neon Postgres (Prisma, via the Vercel Marketplace) · Vercel (Sydney region) · Vercel Blob ·
MapLibre GL JS with self-hosted Protomaps tiles · Vercel BotID · Resend.

## Data attribution

- Map data © OpenStreetMap contributors.
- Council and suburb boundaries © State of New South Wales (Spatial Services, DCS NSW), CC BY 4.0.
