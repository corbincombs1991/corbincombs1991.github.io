#!/usr/bin/env python3
"""Extract visited places from the macOS Photos library DB (Photos.sqlite).
Outputs places.json with clustered locations, photo counts, year ranges, and
human place labels derived from the reverse-geocode blobs (no network)."""
import sqlite3, json, math, re, sys, os
from datetime import datetime, timedelta
from collections import Counter, defaultdict

# args: [Photos.sqlite path] [places.json output]
DB = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser(
    '~/Pictures/Photos Library.photoslibrary/database/Photos.sqlite')
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
    os.path.dirname(os.path.abspath(__file__)), 'places.json')

EPOCH = datetime(2001, 1, 1)

def db_connect(path):
    # open read-only (Photos may be running); works even with WAL active
    return sqlite3.connect('file:%s?mode=ro' % path, uri=True)

def dt_from_coredata(ts):
    return EPOCH + timedelta(seconds=ts) if ts else None

def blob_strings(blob):
    """Extract meaningful printable strings from an NSKeyedArchiver blob."""
    if not blob:
        return set()
    s = ''.join(chr(b) if 32 <= b < 127 else '\n' for b in blob)
    words = set()
    JUNK = re.compile(r'^(NS|X\$|bplist|T?root|V\$|\$)[A-Za-z]*$|^[0-9a-fA-F]{16,}$|^[A-Za-z0-9]{20,}$')
    for w in s.split('\n'):
        w = w.strip()
        if len(w) < 3 or len(w) > 60:
            continue
        if not re.match(r'^[A-Za-z][A-Za-z .\'\-()&0-9]*$', w):
            continue
        if JUNK.match(w):
            continue
        words.add(w)
    return words

STOP = {
    'VisHome','countryCode','addressString','version','compoundNames',
    'geoServiceProvider','mapItem','finalPlaceInfos','sortedPlaceInfos',
    'backupPlaceInfos','dominantOrderType','placeType','className',
    'classes','postalAddress','NS','objects','compoundSecondaryNames',
    'city','state','country','street','postalCode','subAdministrativeArea',
    'subLocality','ISOCountryCode','formattedAddress','area','name','isHome',
}

def label_from_strings(strings):
    """Heuristic: pick the most plausible city/state/country labels."""
    cands = [w for w in strings if w not in STOP and not w.startswith('PL')]
    # rank: shorter, capitalized words are more likely place names
    def score(w):
        s = 0
        if w[0].isupper(): s -= 2
        s += len(w) * 0.1
        if ' County' in w: s += 4
        if w in ('United States','USA'): s += 3
        return s
    cands.sort(key=score)
    return cands[:8]

def haversine_km(lat1, lon1, lat2, lon2):
    import math
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2 * R * math.asin(math.sqrt(a))

con = db_connect(DB)
con.row_factory = sqlite3.Row
rows = con.execute("""
    SELECT z.ZLATITUDE lat, z.ZLONGITUDE lon, z.ZDATECREATED d,
           z.ZFILENAME f, z.ZKIND kind, a.ZREVERSELOCATIONDATA blob
    FROM ZASSET z
    LEFT JOIN ZADDITIONALASSETATTRIBUTES a ON a.ZASSET = z.Z_PK
    WHERE z.ZLATITUDE > -179 AND z.ZTRASHEDSTATE = 0
""").fetchall()
print(f"rows: {len(rows)}", file=sys.stderr)

# ---- cluster: greedy, sorted by lat, absorb within 18 km ----
THRESH = 18.0
recs = []
for r in rows:
    blob = r['blob'] if r['blob'] else b''
    recs.append({
        'lat': r['lat'], 'lon': r['lon'],
        'd': dt_from_coredata(r['d']),
        'kind': r['kind'], 'strings': blob_strings(blob),
    })
recs.sort(key=lambda x: x['lat'])

clusters = []  # each: {lats:[], lons:[], years:[], kinds:[], strings:Counter}
for rec in recs:
    placed = False
    for c in clusters:
        if abs(c['lats'][-1] - rec['lat']) > THRESH:
            continue
        if haversine_km(c['lat0'], c['lon0'], rec['lat'], rec['lon']) <= THRESH:
            c['lats'].append(rec['lat']); c['lons'].append(rec['lon'])
            if rec['d']: c['years'].append(rec['d'].year)
            c['kinds'].append(rec['kind'])
            for w in rec['strings']: c['strings'][w] += 1
            placed = True
            break
    if not placed:
        clusters.append({'lat0': rec['lat'], 'lon0': rec['lon'],
                         'lats': [rec['lat']], 'lons': [rec['lon']],
                         'years': [rec['d'].year] if rec['d'] else [],
                         'kinds': [rec['kind']], 'strings': Counter(rec['strings'])})

print(f"clusters: {len(clusters)}", file=sys.stderr)

# ---- build output ----
places = []
for c in clusters:
    n = len(c['lats'])
    # weighted centroid
    lat = sum(c['lats']) / n
    lon = sum(c['lons']) / n
    years = sorted(set(c['years']))
    # deterministic order: count desc, then name asc (set iteration is hash-randomized)
    strings = [w for w, cnt in sorted(c['strings'].items(), key=lambda kv: (-kv[1], kv[0]))[:12]]
    labels = label_from_strings(strings)
    places.append({
        'lat': round(lat, 5), 'lon': round(lon, 5),
        'n': n, 'photos': sum(1 for k in c['kinds'] if k == 0),
        'videos': sum(1 for k in c['kinds'] if k == 1),
        'years': years,
        'first': years[0] if years else None,
        'last': years[-1] if years else None,
        'label': labels[:5],
    })

places.sort(key=lambda p: -p['n'])
json.dump(places, open(OUT, 'w'), indent=1)
for p in places[:45]:
    yr = f"{p['first']}-{p['last']}" if p['first'] and p['last'] != p['first'] else str(p['first'])
    print(f"{p['n']:5d}  ({p['lat']:8.3f},{p['lon']:8.3f})  {yr:10s}  {p['label']}")
