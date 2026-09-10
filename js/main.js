(() => {
  "use strict";

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  document.getElementById("year").textContent = new Date().getFullYear();

  /* ---------------------------------------------------------------------
     Sticky header background on scroll
  --------------------------------------------------------------------- */
  const header = document.querySelector(".site-header");
  const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 8);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---------------------------------------------------------------------
     Mobile nav toggle
  --------------------------------------------------------------------- */
  const navToggle = document.getElementById("navToggle");
  const primaryNav = document.getElementById("primaryNav");

  navToggle.addEventListener("click", () => {
    const isOpen = primaryNav.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });

  primaryNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      primaryNav.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
    });
  });

  /* ---------------------------------------------------------------------
     Portfolio filter (thématiques)
  --------------------------------------------------------------------- */
  const filterBar = document.querySelector(".filter-bar");
  if (filterBar) {
    const productionItems = document.querySelectorAll(".production-item");
    filterBar.addEventListener("click", (e) => {
      const btn = e.target.closest(".filter-btn");
      if (!btn) return;
      filterBar.querySelectorAll(".filter-btn").forEach((b) => b.classList.toggle("is-active", b === btn));
      const filter = btn.dataset.filter;
      productionItems.forEach((item) => {
        const match = filter === "all" || item.dataset.category === filter;
        item.classList.toggle("is-hidden", !match);
      });
    });
  }

  /* ---------------------------------------------------------------------
     Contact form — no backend yet (site 100% local): fall back to mailto
  --------------------------------------------------------------------- */
  const contactForm = document.getElementById("contactForm");
  contactForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = contactForm.name.value.trim();
    const email = contactForm.email.value.trim();
    const message = contactForm.message.value.trim();
    const subject = encodeURIComponent(`Contact site — ${name}`);
    const body = encodeURIComponent(`${message}\n\n— ${name} (${email})`);
    window.location.href = `mailto:contact@tondomaine.fr?subject=${subject}&body=${body}`;
  });

  /* ---------------------------------------------------------------------
     GSAP animations
  --------------------------------------------------------------------- */
  if (typeof gsap === "undefined") return;

  gsap.registerPlugin(ScrollTrigger);

  if (prefersReducedMotion) {
    // Skip motion entirely: just make everything visible.
    gsap.set("[data-reveal]", { opacity: 1 });
    return;
  }

  gsap.defaults({ ease: "power3.out", duration: 0.9 });

  // Hero entrance timeline, on load
  const heroTitleSpans = gsap.utils.toArray(".hero-title span");
  gsap.set(heroTitleSpans, { yPercent: 110 });

  const heroTl = gsap.timeline({ delay: 0.2 });
  heroTl
    .fromTo(".hero-eyebrow", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.7 }, 0)
    .to(heroTitleSpans, { yPercent: 0, opacity: 1, stagger: 0.12, duration: 1 }, 0.1)
    .fromTo(".hero-lead", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.8 }, 0.5)
    .fromTo(".hero-actions", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.8 }, 0.65);

  // Scroll-triggered reveals for everything else
  gsap.utils.toArray("[data-reveal]").forEach((el) => {
    if (el.closest(".hero")) return; // hero handled by its own timeline above
    if (el.closest(".production-grid")) return; // production tiles handled by the staggered block below
    gsap.fromTo(
      el,
      { opacity: 0, y: 24 },
      {
        opacity: 1,
        y: 0,
        scrollTrigger: {
          trigger: el,
          start: "top 85%",
          toggleActions: "play none none none",
        },
      }
    );
  });

  // Stagger production tiles within the grid
  gsap.fromTo(
    ".production-item",
    { opacity: 0, y: 30 },
    {
      opacity: 1,
      y: 0,
      stagger: 0.03,
      scrollTrigger: {
        trigger: ".production-grid",
        start: "top 85%",
      },
    }
  );
})();
