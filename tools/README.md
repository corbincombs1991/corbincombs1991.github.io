# Travel map data pipeline

The map on the site (`js/travel-data.js`) is generated from the geotagged
macOS Photos library. After a new trip, regenerate with:

```bash
# 1. Extract + cluster every geotagged photo from the Photos database
python3 tools/extract_places.py            # -> tools/places.json

# 2. Assign clusters to curated destinations, emit site data
python3 tools/build_destinations.py        # -> js/travel-data.js

# 3. Deploy
git add -A && git commit -m "Update travel map" && git push
```

## How it works (Photos.sqlite internals)

- `photos.db` is only a metadata index — the real data is
  `Photos Library.photoslibrary/database/Photos.sqlite`.
- `ZASSET.ZLATITUDE/ZLONGITUDE` — **-180.0 means "no location"**, filter
  with `ZLATITUDE > -179`. `ZTRASHEDSTATE = 0` excludes deleted items.
- `ZADDITIONALASSETATTRIBUTES.ZREVERSELOCATIONDATA` is an NSKeyedArchiver
  blob containing the reverse-geocoded place names (city/state/country
  strings) — parseable offline with `plistlib`, no API calls needed.
- `ZASSET.ZDATECREATED` is Core Data epoch: seconds since 2001-01-01.
- The DB is read with `?mode=ro` so it works while Photos is running.

## Editing destinations

`tools/build_destinations.py` has a `DEST` list (name, region, lat, lon,
radius, kind). Add/adjust entries there, then rerun step 2. Places not
assigned to any destination are dropped — tiny transit stops (e.g. Fresno)
can be omitted by simply not listing them.
