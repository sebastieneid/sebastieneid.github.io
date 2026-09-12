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
     Liens "#top" — le header étant en position: sticky, son offsetTop
     dérive avec le défilement et casse l'ancre native. On remonte donc
     la page nous-mêmes.
  --------------------------------------------------------------------- */
  document.querySelectorAll('a[href="#top"]').forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
    });
  });

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
     Productions — données + rendu de la grille
  --------------------------------------------------------------------- */
  const PRODUCTIONS = [
    {
      title: "Incendies à Biscarrosse",
      category: "environnement",
      type: "image",
      thumb: "assets/productions/environnement/feux-biscarrosse.webp",
      src: "assets/productions/environnement/feux-biscarrosse.webp",
    },
    {
      title: "Incendies en Gironde",
      category: "environnement",
      type: "image",
      thumb: "assets/productions/environnement/feux-gironde.webp",
      src: "assets/productions/environnement/feux-gironde.webp",
    },
    {
      title: "Nappes souterraines en France — carte animée",
      category: "environnement",
      type: "iframe",
      thumb: "assets/productions/interactif/brgm-nappes/700-SOMBRE.webp",
      src: "assets/productions/interactif/brgm-nappes/",
    },
    {
      title: "Élections sénatoriales — carte 1",
      category: "politique",
      type: "image",
      thumb: "assets/productions/politique/senateurs-1.webp",
      src: "assets/productions/politique/senateurs-1.webp",
    },
    {
      title: "Élections sénatoriales — carte 2",
      category: "politique",
      type: "image",
      thumb: "assets/productions/politique/senateurs-2.webp",
      src: "assets/productions/politique/senateurs-2.webp",
    },
    {
      title: "Élections sénatoriales — carte 3",
      category: "politique",
      type: "image",
      thumb: "assets/productions/politique/senateurs-3.webp",
      src: "assets/productions/politique/senateurs-3.webp",
    },
    {
      title: "Globe United Airlines — nouvelles lignes 2027",
      category: "economie",
      type: "iframe",
      thumb: "assets/productions/economie/globe-thumb.png",
      src: "assets/productions/interactif/united-globe/",
    },
  ];

  const CATEGORY_LABEL = {
    environnement: "Environnement",
    societe: "Société",
    international: "International",
    politique: "Politique",
    economie: "Économie",
  };

  // Contexte affiché au survol des vignettes : toutes les productions actuelles
  // ont été réalisées durant le stage au service infographie du Monde.
  const PRODUCTION_CONTEXT = "Le Monde — Service Infographie";

  const productionGrid = document.getElementById("productionGrid");
  if (productionGrid) {
    productionGrid.innerHTML = PRODUCTIONS.map((p, i) => `
      <div class="production-item" data-reveal tabindex="0" role="button"
           data-index="${i}" data-category="${p.category}"
           aria-label="${p.title} — ${CATEGORY_LABEL[p.category] || p.category}">
        <span class="production-thumb" style="background-image:url('${p.thumb}')"></span>
        ${p.type === "iframe" ? '<span class="production-badge">Interactif</span>' : ""}
        <span class="production-caption">${PRODUCTION_CONTEXT}</span>
      </div>
    `).join("");
  }

  /* ---------------------------------------------------------------------
     Lightbox (ouverture d'une production, fond flouté)
  --------------------------------------------------------------------- */
  const lightbox = document.getElementById("lightbox");
  const lightboxBody = document.getElementById("lightboxBody");

  function openLightbox(production) {
    lightboxBody.innerHTML = production.type === "iframe"
      ? `<iframe src="${production.src}" title="${production.title}" loading="lazy"></iframe>
         <p class="lightbox__caption">${production.title}</p>`
      : `<img src="${production.src}" alt="${production.title}">
         <p class="lightbox__caption">${production.title}</p>`;
    lightbox.classList.add("is-open");
    lightbox.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeLightbox() {
    lightbox.classList.remove("is-open");
    lightbox.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    lightboxBody.innerHTML = ""; // stoppe l'iframe / les animations en cours
  }

  if (productionGrid && lightbox) {
    productionGrid.addEventListener("click", (e) => {
      const item = e.target.closest(".production-item");
      if (!item) return;
      openLightbox(PRODUCTIONS[Number(item.dataset.index)]);
    });
    productionGrid.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const item = e.target.closest(".production-item");
      if (!item) return;
      e.preventDefault();
      openLightbox(PRODUCTIONS[Number(item.dataset.index)]);
    });
    lightbox.addEventListener("click", (e) => {
      if (e.target.closest("[data-close]")) closeLightbox();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && lightbox.classList.contains("is-open")) closeLightbox();
    });
  }

  /* ---------------------------------------------------------------------
     Aperçu du CV — même lightbox que les productions
  --------------------------------------------------------------------- */
  const cvPreview = document.getElementById("cvPreview");
  if (cvPreview && lightbox) {
    const openCv = () => openLightbox({
      type: "image",
      src: "assets/cv-preview.png",
      title: "CV — Sébastien EID",
    });
    cvPreview.addEventListener("click", openCv);
    cvPreview.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      openCv();
    });
  }

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
    .to(heroTitleSpans, { yPercent: 0, opacity: 1, stagger: 0.12, duration: 1 }, 0.1);

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
