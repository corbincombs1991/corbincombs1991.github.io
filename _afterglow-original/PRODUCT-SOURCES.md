# Verified Depop listing snapshot

Shop confirmed through the user's Linktree: https://linktr.ee/afterglowvintageindy.
The link points to https://www.depop.com/afterglowvintageindy/.

All six featured listings were inspected in Depop's live public browser UI on
November 6, 2026. Each showed a Buy now control. Listed prices and sizes match
`src/data/products.json`: $30/L, $30/L, $30/L, $40/L, $25/L, $30/M. The fourth,
fifth, and sixth use the displayed sale price. Names are shortened from the
seller's descriptions; categories are editorial groupings. Product URLs in that
JSON are the authoritative item pages. No reviews or seller metrics are copied.

This is an explicitly dated static selection, not a live stock API. The site
instructs buyers to confirm current prices, availability, condition, and shipping
on Depop. All purchasing and messaging happens on Depop. To refresh the
selection, verify listings, update products.json and matching photographs, and
change checkedDate in shop.ts; the existing GitHub Actions pipeline rebuilds it.
Do not use generated editorial photos as inventory or claim automatic stock sync.

Actual product photos are resized/re-encoded from these observed public image URLs:

1. https://media-photos.depop.com/b1/28053873/3431119580_1afc0e712c644e3bae9da8b9427f90de/P0.jpg
2. https://media-photos.depop.com/b1/28053873/3431106127_b767c4754dd64b2295aa77464b51ad49/P0.jpg
3. https://media-photos.depop.com/b1/28053873/3431097750_d1fa5ea4b223418b9f9ba7369c3e912d/P0.jpg
4. https://media-photos.depop.com/b1/28053873/3394129331_8d0e6d18cb924b1eb19e73b8a597354a/P0.jpg
5. https://media-photos.depop.com/b1/28053873/3394119187_6750061ad2f34feb9c7a334f9e24b52a/P0.jpg
6. https://media-photos.depop.com/b1/28053873/3394080296_77c995c149b14c5588870cea14b33577/P0.jpg
