# Afterglow Vintage

A static Astro storefront at https://corbincombs.com/afterglowvintage/.

## Development

Use Node 24. Run `npm ci` then `npm run dev`. For a production build, run
`npm run build`. On a restricted local filesystem, set
`ASTRO_TELEMETRY_DISABLED=1` when running Astro.

Every internal link and public asset path uses `src/lib/urls.ts`, which derives
its prefix from Astro's `BASE_URL`. The config sets the existing domain as `site`,
`/afterglowvintage` as `base`, and directory-based static pages with trailing
slashes. Compiled CSS, JS and fonts use `assets/`, avoiding Jekyll's exclusion of
underscore-prefixed directories.

## Shop

The seller profile was verified against the user-provided
https://linktr.ee/afterglowvintageindy on November 6, 2026. `src/data/shop.ts`
contains the verified Depop destination. Checkout and seller messaging stay on
Depop. The website collects no payment details and sets no separate shipping or
return policy.

Only real Depop listings should be added to the product catalog. Editorial
images are original AI-generated style inspiration and are never product
inventory. Generation details are recorded in `IMAGE-PROVENANCE.md`.

## Publishing

See `../_afterglow-deploy/README.md`. The source directory is intentionally
prefixed with `_` so the existing Pages/Jekyll pipeline excludes it. Do not put a
new `CNAME`, root redirect, SPA fallback, or a separate Pages deployment here.
