# Purpose

Ivan's personal site at ivryb.com: static files in `public/`, no build step and no dependencies. Cloudflare
serves it as Workers Static Assets (Worker `ivryb`); deploy with `bunx wrangler deploy`. uhsomebody.com, the old
domain, is a Cloudflare zone whose only job is a 301 redirect rule to ivryb.com.

# Layout

- `public/index.html`: the whole page, styles inline.
- `public/scripts/room.js`: the night studio on the right, with live screens and blinking city lights; the apps on
  the screens are in `public/scripts/room-screens.js`.
- `public/assets/`: fonts (self-hosted), project pictures and logos, and the prepared studio files.
- `art/`: source pictures; `tools/`: scripts that turn them into `public/` files. Neither is deployed.

# Changing pictures

Everything in `public/` that comes from `art/` (the studio, its screen masks and light positions in
`public/scripts/room-data.js`, the grain, the project pictures) and the favicons are generated:
`python3 tools/prepare-assets.py`. The browser never analyses images, so redo this after editing anything in `art/`.

The OG image `public/og.jpg` is a screenshot of `tools/og.html`: serve the site with `bunx serve public -p 4317`,
then `bun tools/render-og.ts`.

`prototype/` holds design experiments and is never committed.
