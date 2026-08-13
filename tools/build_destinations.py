#!/usr/bin/env python3
"""Curate clustered Photos locations into named travel destinations.
Assigns each cluster to its nearest destination (within radius), sums photo
counts + year ranges, and emits js/travel-data.js for the site map."""
import json, math, sys, os

# args: [places.json] [travel-data.js output]
DEFAULT_PLACES = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'places.json')
DEFAULT_JS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'js', 'travel-data.js')
PLACES_PATH = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PLACES
JS_OUT = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_JS

PLACES = json.load(open(PLACES_PATH))

def hav_km(a, b):
    R = 6371.0
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp = math.radians(b[0] - a[0]); dl = math.radians(b[1] - a[1])
    x = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2*R*math.asin(math.sqrt(x))

# name, region(country or US state), lat, lon, radius_km, kind(city|park|region)
DEST = [
    # --- International ---
    ("Reykjavík",           "Iceland",    64.146, -21.942, 45, "city"),
    ("Golden Circle",       "Iceland",    64.214, -20.730, 40, "region"),
    ("South Coast & Vík",   "Iceland",    63.540, -19.370, 55, "region"),
    ("Blue Lagoon",         "Iceland",    63.930, -22.540, 25, "city"),
    ("Dublin",              "Ireland",    53.360,  -6.179, 35, "city"),
    ("Kilkenny",            "Ireland",    52.653,  -7.253, 30, "city"),
    ("Blarney & Cork",      "Ireland",    51.929,  -8.571, 35, "region"),
    ("Galway & Connemara",  "Ireland",    53.380,  -9.600, 60, "region"),
    ("The Burren & Clare",  "Ireland",    52.950,  -9.200, 45, "region"),
    ("Belfast",             "UK (NI)",    54.610,  -5.905, 30, "city"),
    # --- US West ---
    ("Yosemite NP",         "California", 37.620, -119.590, 60, "park"),
    ("Sequoia & Kings Canyon", "California", 36.790, -118.820, 55, "park"),
    ("Mount Rainier NP",    "Washington", 46.799, -121.728, 40, "park"),
    ("Seattle",             "Washington", 47.610, -122.330, 35, "city"),
    ("Snoqualmie Valley",   "Washington", 47.543, -121.840, 30, "region"),
    ("Olympic NP",          "Washington", 47.900, -124.200, 70, "park"),
    ("Portland & the Gorge","Oregon",    45.530, -122.500, 60, "city"),
    ("Cannon Beach",        "Oregon",    45.866, -123.963, 25, "city"),
    ("Las Vegas",           "Nevada",    36.106, -115.171, 30, "city"),
    ("Denver",              "Colorado",  39.746, -105.003, 30, "city"),
    ("Rocky Mountain NP",   "Colorado",  40.310, -105.656, 45, "park"),
    ("Boulder",             "Colorado",  39.982, -105.291, 30, "city"),
    ("Colorado Springs",    "Colorado",  38.824, -104.919, 30, "city"),
    ("Summit County",       "Colorado",  39.480, -106.054, 40, "region"),
    ("Anchorage",           "Alaska",    61.220, -149.277, 40, "city"),
    ("Mat-Su Valley",       "Alaska",    61.692, -149.963, 60, "region"),
    ("Denali & Healy",      "Alaska",    63.675, -149.552, 50, "region"),
    ("Glacier NP",          "Montana",   48.600, -113.900, 70, "park"),
    ("Phoenix",             "Arizona",   33.623, -111.938, 35, "city"),
    # --- US South / East ---
    ("Nashville",           "Tennessee", 36.159, -86.779, 30, "city"),
    ("Dale Hollow Lake",    "Tennessee", 36.554, -85.387, 40, "region"),
    ("Gulf Shores",         "Alabama",   30.278, -87.561, 30, "city"),
    ("Austin",              "Texas",     30.300, -97.800, 55, "city"),
    ("Washington DC",       "Virginia",  38.891, -77.023, 30, "city"),
    ("New York City",       "New York",  40.747, -73.993, 30, "city"),
    ("Augusta",             "Georgia",   33.538, -82.060, 30, "city"),
    ("Chicago",             "Illinois",  41.910, -87.641, 30, "city"),
    ("Fort Myers",          "Florida",   26.520, -81.880, 45, "city"),
    ("Great Smoky Mountains","Tennessee",35.700, -83.600, 50, "park"),
    ("Asheville & Pisgah",  "North Carolina", 35.500, -82.700, 55, "region"),
    ("Blue Ridge & Boone",  "North Carolina", 36.000, -81.900, 45, "region"),
    ("Pinehurst",           "North Carolina", 35.189, -79.470, 25, "city"),
    ("Lexington",           "Kentucky",  38.100, -84.750, 45, "city"),
    ("Cave Run Lake",       "Kentucky",  37.763, -83.670, 35, "region"),
    ("Hopkinsville",        "Kentucky",  36.796, -87.472, 25, "city"),
    ("Columbus",            "Ohio",      39.991, -83.018, 30, "city"),
    ("Kings Island",        "Ohio",      39.359, -84.227, 20, "city"),
    ("Harrisburg",          "Pennsylvania", 40.229, -76.764, 30, "city"),
    ("Acadia NP",           "Maine",     44.337, -68.167, 35, "park"),
    ("Moosehead Lake",      "Maine",     45.939, -68.851, 35, "region"),
    ("Muskegon",            "Michigan",  43.522, -86.365, 30, "city"),
    ("Warren Dunes",        "Michigan",  41.795, -86.745, 25, "region"),
    ("Kansas City",         "Missouri",  39.074, -94.534, 30, "city"),
]

# home base: central Indiana
HOME = {"name": "Indianapolis (home base)", "region": "Indiana",
        "lat": 39.769, "lon": -86.156, "radius": 70}

out = []
for name, region, lat, lon, rad, kind in DEST:
    best = [p for p in PLACES if hav_km((lat, lon), (p['lat'], p['lon'])) <= rad]
    n = sum(p['n'] for p in best)
    years = sorted({y for p in best for y in p['years'] if y})
    out.append({
        "name": name, "region": region, "kind": kind,
        "lat": round(lat, 4), "lon": round(lon, 4),
        "n": n,
        "years": years,
        "first": years[0] if years else None,
        "last": years[-1] if years else None,
    })

# home
hp = [p for p in PLACES if hav_km((HOME['lat'], HOME['lon']), (p['lat'], p['lon'])) <= HOME['radius']]
home_n = sum(p['n'] for p in hp)
home_years = sorted({y for p in hp for y in p['years'] if y})
home = {**HOME, "n": home_n, "years": home_years,
        "first": home_years[0] if home_years else None,
        "last": home_years[-1] if home_years else None}

out = [d for d in out if d['n'] > 0]
out.sort(key=lambda d: -d['n'])

# stats (excluding home)
countries = sorted({d['region'] for d in out if d['region'] in ('Iceland','Ireland','UK (NI)')})
us_states = sorted({d['region'] for d in out if d['region'] not in ('Iceland','Ireland','UK (NI)')})
total_photos = sum(d['n'] for d in out)
all_years = sorted({y for d in out for y in d['years']})

js = """// Generated from macOS Photos library location data — do not hand-edit.
window.TRAVEL = {
  home: %s,
  places: %s,
  stats: {
    countries: %s,
    usStates: %s,
    photos: %d,
    firstYear: %s,
    lastYear: %s
  }
};
""" % (json.dumps(home), json.dumps(out), json.dumps(countries),
       json.dumps(us_states), total_photos,
       json.dumps(all_years[0] if all_years else None),
       json.dumps(all_years[-1] if all_years else None))

open(JS_OUT, 'w').write(js)

print(f"destinations: {len(out)}  photos: {total_photos}  countries: {countries}  states: {len(us_states)}")
print(f"home photos: {home_n} ({home_years[0]}-{home_years[-1]})")
print()
for d in out:
    yr = f"{d['first']}-{d['last']}" if d['first'] and d['last'] != d['first'] else str(d['first'])
    print(f"{d['n']:5d}  {d['name']:26s} {d['region']:16s} {yr}")
