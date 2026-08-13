/* ============================================================
   CORBIN COMBS — parallax + scroll effects
   ============================================================ */

(function () {
  "use strict";

  var prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Nav: blur + shadow once scrolled ---------- */
  var nav = document.getElementById("nav");
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
    if (prefersReduced) return;
    if (!ticking) {
      window.requestAnimationFrame(function () {
        onScrollNav();
        parallax();
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

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
})();
