/* ============================================================
   CORBIN COMBS — travel map (Leaflet + CARTO dark tiles)
   Data in travel-data.js, generated from the Photos library.
   ============================================================ */
(function () {
  "use strict";
  if (!window.TRAVEL || !window.L) return;
  var T = window.TRAVEL;

  var map = L.map("travel-map", { zoomControl: true });
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 19
  }).addTo(map);

  var INT = ["Iceland", "Ireland", "UK (NI)"];
  function isIntl(p) { return INT.indexOf(p.region) !== -1; }

  function popupHTML(p, home) {
    var yrs = p.first === p.last ? String(p.first) : (p.first + "–" + p.last);
    var extra = home ? " · home base" : "";
    return "<div class='travel-pop'><strong>" + p.name + "</strong><span>" +
      p.region + extra + " · " + p.n.toLocaleString() + " photos · " + yrs +
      "</span></div>";
  }

  var bounds = [];
  var PIN_RADIUS = 8;

  T.places.forEach(function (p) {
    var color = isIntl(p) ? "#22d3ee" : "#7c5cff";
    L.circleMarker([p.lat, p.lon], {
      radius: PIN_RADIUS,
      color: color,
      weight: 1.4,
      fillColor: color,
      fillOpacity: 0.5
    }).addTo(map).bindPopup(popupHTML(p, false));
    bounds.push([p.lat, p.lon]);
  });

  // Home base — same uniform pin, pink
  var home = T.home;
  L.circleMarker([home.lat, home.lon], {
    radius: PIN_RADIUS,
    color: "#ff5c8a",
    weight: 1.4,
    fillColor: "#ff5c8a",
    fillOpacity: 0.5
  }).addTo(map).bindPopup(popupHTML(home, true));
  bounds.push([home.lat, home.lon]);

  map.fitBounds(L.latLngBounds(bounds).pad(0.15));

  // stats
  if (T.stats) {
    var set = function (id, v) {
      var el = document.getElementById(id);
      if (el) el.textContent = v;
    };
    set("stat-photos", T.stats.photos.toLocaleString());
    set("stat-countries", T.stats.countries.length);
    set("stat-states", T.stats.usStates.length);
    set("stat-years", T.stats.firstYear + "–" + T.stats.lastYear);
  }

  window.addEventListener("resize", function () { map.invalidateSize(); });
  setTimeout(function () { map.invalidateSize(); }, 400);
})();
