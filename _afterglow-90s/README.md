# Afterglow Online — 90s edition

Third independent design at https://corbincombs.com/afterglowvintage-90s/.

Node 24: `npm ci`, then `npm run build` (set `ASTRO_TELEMETRY_DISABLED=1` on a restricted local filesystem). All local links derive from Astro BASE_URL.

Use `AFTERGLOW_VARIANT=retro` with the verification and sync scripts in `../_afterglow-deploy/`. The shared publisher builds all three designs without changing the domain homepage.

Product cards use the existing verified Depop snapshot; availability and checkout stay on Depop. Editorial art is reused from the zine edition; prompts are in IMAGE-PROVENANCE.md. Pixel icons, star tiles, CD art, and chrome lettering are CSS/SVG. Guestbook entries are stored only in the visitor’s browser. The optional original chiptune is synthesized locally and starts only on request.
