# Photography gallery

Served at https://corbincombs.com/photography/ by the existing GitHub Pages deployment. Buildless HTML, CSS, and JavaScript; no added runtime packages, trackers, third-party embeds, API keys, or server required.

## Updating photographs

`photography.js` contains the gallery catalog: display label, accessible image description, category, pixel dimensions, Instagram post ID, and a reserved `purchaseUrl` field. Images are stored in `images/` so the gallery does not depend on expiring Instagram CDN links.

The initial twelve photographs were downloaded from the publicly visible @corbincombsphotography profile on October 29, 2026. They are the profile's available preview-sized files, with a maximum edge of 640 pixels, not original or print-resolution masters. The hero crop and framed illustration are CSS treatments; the viewer shows each complete image. Display labels (for example, “Granite & cloud”) are editorial labels for this website, not verified original titles. Post links remain available in the viewer.

To replace an image with its original, export a web-sized JPEG in sRGB under the same filename, and update its width/height in the catalog (and the hero HTML if replacing photo-01). Keep original print masters outside this public repository. Add responsive derivatives/srcset if introducing much larger files. Do not use these Instagram previews to fulfill prints.

To add a photo, copy its image into `images/`, add a catalog entry, and update the filter counts in `index.html` plus the no-JavaScript links. The first six matches are displayed initially; the expansion control shows the rest. The viewer navigates within the selected category. All photos can also be explored starting with the hero.

## Future print store

The current prints section is an explicitly labeled concept and an Instagram inquiry link. It does not accept orders, collect emails, or process payments. `purchaseUrl` is reserved data only; setting it alone will not render a checkout button.

When prints are ready, choose a hosted checkout/fulfillment service, establish products and prices, then replace the concept text and inquiry link with real product links. Add a viewer purchase link only for catalog entries with an available product. This can keep the site static on GitHub Pages; private checkout credentials and order processing belong with the commerce provider, not in this repository. Use original files for production prints.

## Checks

Run `node --check photography/photography.js` and the root regression suite. In a browser, verify category counts, expansion, the Details single-image viewer, arrow keys, Escape/focus return, narrow portrait and short landscape layouts, and image loading. The native dialog provides focus containment.
