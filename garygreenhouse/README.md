# Gary Greenhouse

A responsive, static redesign of Gary Greenhouse's company website, published at
https://corbincombs.com/garygreenhouse/ through this repository's existing GitHub
Pages deployment. No packages, API keys, backend, or build step are required.

## Files

- `index.html`: home, company story, and accessible photo gallery.
- `plants.html`: seasonal collection filters and vegetable information.
- `growing-guide.html`: plant care and current gardening-resource destinations.
- `wholesale.html`: published wholesale requirements.
- `visit.html`: contact, directions, seasonal hours, and event history.
- `styles.css` and `app.js`: shared styling, mobile menu, filters, and photo dialog.
- `assets/`: downloaded company photographs, self-hosted Inter font, and favicon.
- `assets/sources.json`: original photo URLs, provenance, and original dimensions.

Edit the HTML files directly to update content. All internal URLs and asset paths
are relative so the folder can be served from GitHub Pages or another static host.

Preview from the repository root with `python3 -m http.server 8000`, then open
http://localhost:8000/garygreenhouse/.

## Content sources and maintenance

Content was checked against https://www.garygreenhouse.com/ on November 5, 2026.
The source website contains stale promotions, empty pages, and placeholder contact
details. Those placeholders were omitted. Core product details, vegetable lists,
care guidance, wholesale requirements, contact details, and published seasonal
hours are retained. Past 2010, 2013, and 2015 events are explicitly historical.

The published hours page conflicts with the old calendar and is undated. The Visit
page preserves its schedule and asks visitors to call for current hours. It does
not infer live opening status. Current Facebook posts could not be verified.
Confirm seasonal hours and wholesale terms with the company before changing them.

Photos were downloaded from the original company site, its public Facebook page,
and public business listings of the same greenhouse. The original product photos
are low resolution. Assets are served locally, with no runtime hotlinking. The
typeface license is included in `assets/LICENSE-Inter.txt`.

## Checks

Run `node --check garygreenhouse/app.js` and the repository regression tests.
Before publishing, check the mobile menu (including Escape), seasonal filters,
photo dialog, care accordions, phone/directions links, and narrow-screen layout.
Changes to `main` publish through the existing GitHub Pages workflow.
