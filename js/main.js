/* ============================================================
   CORBIN COMBS — parallax + scroll effects
   ============================================================ */

(function () {
  "use strict";

  var prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Nav: blur + shadow once scrolled ---------- */
  var nav = document.getElementById("nav");
  var navToggle = document.querySelector(".nav-toggle");
  var navLinks = document.getElementById("nav-links");

  function setMenu(open) {
    if (!navToggle || !navLinks) return;
    navToggle.setAttribute("aria-expanded", String(open));
    navLinks.classList.toggle("is-open", open);
    var label = navToggle.querySelector(".sr-only");
    if (label) label.textContent = open ? "Close navigation" : "Open navigation";
  }

  if (navToggle && navLinks) {
    navToggle.addEventListener("click", function () {
      setMenu(navToggle.getAttribute("aria-expanded") !== "true");
    });

    navLinks.addEventListener("click", function (event) {
      if (event.target.closest("a")) setMenu(false);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && navToggle.getAttribute("aria-expanded") === "true") {
        setMenu(false);
        navToggle.focus();
      }
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth > 860) setMenu(false);
    });
  }

  function onScrollNav() {
    if (window.scrollY > 24) nav.classList.add("scrolled");
    else nav.classList.remove("scrolled");
  }

  /* ---------- Parallax hero layers ---------- */
  var layers = Array.prototype.slice.call(document.querySelectorAll("[data-parallax]"));
  var ticking = false;

  function parallax() {
    var y = window.scrollY;
    if (y > window.innerHeight) y = window.innerHeight; // only move while hero visible
    layers.forEach(function (layer) {
      var speed = parseFloat(layer.getAttribute("data-parallax")) || 0.5;
      layer.style.transform = "translate3d(0," + (y * speed) + "px,0)";
    });
  }

  function onScroll() {
    if (!ticking) {
      window.requestAnimationFrame(function () {
        onScrollNav();
        if (!prefersReduced) parallax();
        ticking = false;
      });
      ticking = true;
    }
  }

  /* ---------- Reveal sections on scroll ---------- */
  var revealEls = document.querySelectorAll(".section, .tl-item, .link-card, .diy-card, .about-photo, .studio-photo");
  if ("IntersectionObserver" in window && !prefersReduced) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08 });
    revealEls.forEach(function (el) { el.classList.add("reveal"); io.observe(el); });
  }

  /* ---------- Privacy-friendly, click-to-load media embeds ---------- */
  document.querySelectorAll(".embed-facade").forEach(function (facade) {
    var button = facade.querySelector(".embed-load");
    if (!button) return;

    button.addEventListener("click", function () {
      var iframe = document.createElement("iframe");
      iframe.src = facade.getAttribute("data-embed-src");
      iframe.title = facade.getAttribute("data-embed-title") || "Embedded media";
      iframe.allow = facade.getAttribute("data-embed-allow") || "autoplay; encrypted-media; picture-in-picture";
      iframe.referrerPolicy = "strict-origin-when-cross-origin";
      iframe.allowFullscreen = true;
      iframe.setAttribute("frameborder", "0");
      iframe.setAttribute("loading", "lazy");
      if (facade.hasAttribute("data-embed-height")) {
        iframe.height = facade.getAttribute("data-embed-height");
      }
      facade.replaceChildren(iframe);
      iframe.focus();
    }, { once: true });
  });

  /* ---------- Lazy-load the below-the-fold map and its local assets ---------- */
  var travelMap = document.getElementById("travel-map");
  var mapStarted = false;

  function loadStylesheet(href) {
    return new Promise(function (resolve, reject) {
      var link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.onload = resolve;
      link.onerror = reject;
      document.head.appendChild(link);
    });
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.body.appendChild(script);
    });
  }

  function loadTravelMap() {
    if (!travelMap || mapStarted) return;
    mapStarted = true;
    Promise.all([
      loadStylesheet("vendor/leaflet/leaflet.css"),
      loadScript("vendor/leaflet/leaflet.js"),
      loadScript("js/travel-data.js")
    ]).then(function () {
      travelMap.textContent = "";
      return loadScript("js/travel-map.js");
    }).catch(function () {
      travelMap.classList.add("map-unavailable");
      travelMap.removeAttribute("aria-busy");
      travelMap.textContent = "The travel map could not be loaded. Please try refreshing the page.";
    });
  }

  if (travelMap && "IntersectionObserver" in window) {
    var mapObserver = new IntersectionObserver(function (entries) {
      if (entries.some(function (entry) { return entry.isIntersecting; })) {
        mapObserver.disconnect();
        loadTravelMap();
      }
    }, { rootMargin: "600px 0px" });
    mapObserver.observe(travelMap);
  } else {
    loadTravelMap();
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
})();
