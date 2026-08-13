# corbincombs1991.github.io

Personal site for Corbin Combs — data scientist, musician (Brenderlin), producer/engineer (Idiotic Oddity, Kantankerous), home studio tinkerer, DIY homeowner. Hosted on GitHub Pages.

## Live URL

https://corbincombs1991.github.io

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Editing content

All content lives in `index.html` — just edit the text between the tags and commit/push.
Sections marked with a pencil (✎) and HTML comments like `EDIT:` are placeholders waiting on real info (DIY house projects, your portrait photo).

## Adding photos

Drop images into `assets/img/` and point the `<img>` tags at them:

| Section | Current placeholder | Suggested file |
|---|---|---|
| About portrait | `assets/img/rip-wade-boggs-thumb.jpg` | `assets/img/corbin.jpg` |
| Studio shots (×2) | `assets/img/photo-1.jpg`, `assets/img/photo-2.jpg` | real photos |
| DIY project cards | CSS gradients | `assets/img/project1.jpg` … |

## Structure

```
index.html      — all content (hero, about, music, studio, projects, career, DIY)
css/style.css   — dark theme, parallax layers, timeline, band cards, responsive
js/main.js      — parallax, nav state, scroll-reveal
assets/img/     — photos
```

## Publishing

```bash
git add -A && git commit -m "update" && git push
```

Pages is enabled on the `main` branch.
