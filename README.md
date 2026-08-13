# corbincombs1991.github.io

Personal site for Corbin Combs — data scientist, musician (Brenderlin), producer/engineer (Idiotic Oddity, Kantankerous), home studio tinkerer, DIY homeowner. Hosted on GitHub Pages.

## Live URL

https://corbincombs.com (custom domain via CNAME; also reachable at https://corbincombs1991.github.io)

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Editing content

All content lives in `index.html` — just edit the text between the tags and commit/push.
Sections marked with a pencil (✎) and HTML comments like `EDIT:` are placeholders waiting on real info (your portrait photo).
The DIY section was removed from the live page but is preserved in `archive/diy-section.html` — paste it back in if you want it again.

## Adding photos

Drop images into `assets/img/` and point the `<img>` tags at them:

| Section | Current placeholder | Suggested file |
|---|---|---|
| About portrait | `assets/img/corbin-portrait.jpg` | real photo (LinkedIn pic) |
| Studio shots (×2) | `assets/img/photo-1.jpg`, `assets/img/photo-2.jpg` | real photos |
| (DIY section archived) | `archive/diy-section.html` | — |

## Structure

```
index.html      — all content (hero, about, music, studio, projects, travel, career)
css/style.css   — dark theme, parallax layers, timeline, band cards, responsive
js/main.js      — parallax, nav state, scroll-reveal
js/travel-map.js, travel-data.js — Leaflet travel map
assets/img/     — photos
archive/        — removed sections kept for later (diy-section.html)
```

## Publishing

```bash
git add -A && git commit -m "update" && git push
```

Pages is enabled on the `main` branch.
