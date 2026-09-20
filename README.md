# corbincombs1991.github.io

Personal site for Corbin Combs — AI scientist, musician (Brenderlin), producer/engineer (Idiotic Oddity, Kantankerous), home studio tinkerer, and DIY homeowner. Hosted on GitHub Pages.

## Live URL

https://corbincombs.com (custom domain via CNAME; also reachable at https://corbincombs1991.github.io)

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

For Market Notes, open `http://localhost:8000/ciovacco.html` locally. GitHub
Pages also serves it at the extensionless `/ciovacco` URL used in navigation.
Market Insights is at `http://localhost:8000/market-insights/`.

## Editing content

The homepage content lives in `index.html`. Edit the text between the tags;
the site requires no build step or package installation. The Work section
features existing projects, and the Explore menu links to travel, decks, and
the market pages. The music credits section keeps its original `#projects`
anchor so existing links continue to work.

Market Notes uses `ciovacco.html` and `ciovacco-summaries.json`. The summary
feed is produced separately; editing the viewer does not change the feed or
the automation that publishes it. Market Insights uses the manifest and
frozen reports in `market-insights/`; its current data is explicitly synthetic.

The DIY section was removed from the live page but is preserved in `archive/diy-section.html` — paste it back in if you want it again.

## Adding photos

Drop images into `assets/img/` and point the `<img>` tags at them:

| Section | Current photo | Notes |
|---|---|---|
| About portrait | `assets/img/corbin-portrait.jpg` | Keep the WebP version in sync |
| Studio shots (×2) | `assets/img/photo-1.jpg`, `assets/img/photo-2.jpg` | Keep the WebP versions in sync |
| (DIY section archived) | `archive/diy-section.html` | — |

## Structure

```
index.html      — homepage (about, work, music, studio, credits, travel, career, contact)
css/style.css   — dark theme, parallax layers, timeline, band cards, responsive
js/main.js      — parallax, accessible mobile nav, click-to-load media, scroll-reveal
js/travel-map.js, travel-data.js — Leaflet travel map
assets/img/     — photos plus generated WebP derivatives
assets/fonts/   — self-hosted fonts and licenses
assets/icons/   — favicon and app icons
robots.txt, sitemap.xml — search-engine discovery
site.webmanifest — installable-site metadata
404.html       — custom not-found page
vendor/leaflet/ — pinned, self-hosted map library
tools/          — repeatable data, icon, and image-generation helpers
archive/        — removed sections kept for later (diy-section.html)
```

## Map background

The travel map uses the standard OpenStreetMap tile endpoint, with visible
OpenStreetMap attribution and a CSS filter applied only to the background
tiles to match the dark theme. It does not require an API key. Keep browser
caching and referrers enabled, and do not add offline tile downloads or bulk
prefetching. See the [tile usage policy](https://operations.osmfoundation.org/policies/tiles/).
The location markers remain usable if a tile request fails.

## Checks

Run the dependency-free regression checks with Node.js 22 or later:

```bash
node --test tools/tests/*.test.cjs
```

Before publishing, also check the homepage and both market pages in a browser,
including a narrow portrait viewport and a short landscape viewport. Confirm
that the mobile menu scrolls, Escape closes menus, and the charts and map load.

## Publishing

```bash
git add -A && git commit -m "update" && git push
```

Pages is enabled on the `main` branch.
