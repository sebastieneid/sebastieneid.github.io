/*
 * brgm-nappes.js — Carte animée de l'état des nappes souterraines.
 *
 * Principe :
 *   - on charge UNE fois la géométrie des secteurs (data/zones-geometrie.geojson) ;
 *   - on la projette sur le fond avec calage.js ;
 *   - on charge les valeurs par date (data/indicateurs.json) ;
 *   - la glissière change la date -> on recolorie les secteurs (classe 1→7).
 *
 * Deux formats de fond, choisis selon la largeur de l'écran :
 *   - "350" (colonne mobile)  ·  "700" (large desktop)
 * Chacun a son cadrage, son calage, son fond et ses frontières.
 *
 * Vanilla JS, aucune dépendance.
 */
(function () {
  "use strict";

  // ================= RÉGLAGES (modifiables) =================
  // Palette : classe -> couleur. Remplace par TES couleurs quand tu veux.
  const PALETTE = {
    7: "#00848D", 6: "#39B2C6", 5: "#87CEDF", 4: "#F0D377",
    3: "#ED6D43", 2: "#E62D2B", 1: "#B02B08", 0: "#d9d9d9",
  };
  const NIVEAU = {
    7: "très haut", 6: "haut", 5: "modérément haut", 4: "autour de la moyenne",
    3: "modérément bas", 2: "bas", 1: "très bas", 0: "sans nappe libre",
  };
  const TENDANCE = { 1: "en hausse ↑", 0: "stable →", "-1": "en baisse ↓" };
  const TEND_LABEL = { 1: "En hausse", 0: "Stable", "-1": "En baisse" }; // le picto montre la flèche
  const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet",
    "août", "septembre", "octobre", "novembre", "décembre"];
  const VITESSE = 700;    // ms entre deux dates en lecture automatique
  const SEUIL_MOBILE = 500; // largeur (px) sous laquelle on passe au format 350
  const TAILLE_PICTO = { "350": 9, "700": 15 }; // taille des pictos (unités viewBox) par format
  // Décaler légèrement certains labels de villes (en unités de la carte).
  // [dx, dy] : dx>0 = vers la droite, dy>0 = vers le bas. Exemple :
  //   "Nantes": [-3, 1], "Lyon": [2, -2]
  const AJUSTEMENTS_VILLES = {
    // "Nantes": [0, 0],
  };
  // ==========================================================

  const NS = "http://www.w3.org/2000/svg";
  // BASE = le dossier où se trouve CE script, détecté automatiquement.
  // Les données et les SVG frontières se chargent depuis le même dossier, en
  // local comme sur le CDN Le Monde — rien à régler à la main.
  const BASE = (function () {
    const s = document.currentScript && document.currentScript.src;
    return s ? s.slice(0, s.lastIndexOf("/") + 1) : "";
  })();
  const root = document.getElementById("brgm-nappes");
  if (!root) return;

  const el = {
    fond: root.querySelector(".brgm__fond"),
    zones: root.querySelector(".brgm__zones"),
    pictos: root.querySelector(".brgm__pictos"),
    frontieres: root.querySelector(".brgm__frontieres"),
    tooltip: root.querySelector(".brgm__tooltip"),
    date: root.querySelector(".brgm__date"),
    legende: root.querySelector(".brgm__legende"),
    play: root.querySelector(".brgm__play"),
    slider: root.querySelector(".brgm__slider"),
    carte: root.querySelector(".brgm__carte"),
  };

  let dates = [];
  let valeurs = {};
  let geoData = null;
  let clipData = {};
  let pictosData = null;  // symboles + emplacements des pictos de tendance
  let pictoUses = [];     // [{u:<use>, sid}] pour la maj par date
  let paths = {};        // sector_id -> <path>
  let frontieresCache = {}; // système -> markup SVG des frontières (inliné pour la police)
  let zonesG = null;     // le <g> qui contient les secteurs
  let systeme = null;    // "350" ou "700"
  let index = 0;
  let timer = null;

  // ---------- Projection de la géométrie ----------
  function anneau(ring, sys) {
    let d = "M";
    for (const [lon, lat] of ring) {
      const [x, y] = CALAGE.lonlatToSvg(lon, lat, sys);
      d += x.toFixed(2) + "," + y.toFixed(2) + " ";
    }
    return d + "Z";
  }
  function geomVersPath(geom, sys) {
    const polys = geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];
    let d = "";
    for (const poly of polys) for (const ring of poly) d += anneau(ring, sys);
    return d;
  }

  // ---------- (Re)construction des secteurs pour un système ----------
  function construireZones(sys) {
    el.zones.innerHTML = "";
    paths = {};
    // masque de découpe au contour France (retire le débordement en mer)
    const clipD = clipData[sys];
    if (clipD) {
      const defs = document.createElementNS(NS, "defs");
      const cp = document.createElementNS(NS, "clipPath");
      cp.setAttribute("id", "brgm-clip");
      cp.setAttribute("clipPathUnits", "userSpaceOnUse");
      const cpath = document.createElementNS(NS, "path");
      cpath.setAttribute("d", clipD);
      cp.appendChild(cpath); defs.appendChild(cp);
      el.zones.appendChild(defs);
    }
    const g = document.createElementNS(NS, "g");
    if (clipD) g.setAttribute("clip-path", "url(#brgm-clip)");
    for (const f of geoData.features) {
      if (!f.geometry) continue;
      const sid = String(f.properties.sector_id);
      const p = document.createElementNS(NS, "path");
      p.setAttribute("d", geomVersPath(f.geometry, sys));
      p.setAttribute("class", "brgm__zone");
      p.dataset.sid = sid;
      p.addEventListener("mousemove", (ev) => montrerTooltip(ev, sid));
      p.addEventListener("mouseleave", cacherTooltip);
      g.appendChild(p);
      paths[sid] = p;
    }
    zonesG = g;
    el.zones.appendChild(g);
  }

  // ---------- Frontières + villes + typos ----------
  // On INLINE le SVG dans le DOM (pas en <img>) pour que la police Marr Sans
  // s'applique aux labels. Cette couche est placée SOUS les pictos de tendance.
  function chargerFrontieres(sys) {
    if (frontieresCache[sys] !== undefined) {
      el.frontieres.innerHTML = frontieresCache[sys];
      apresFrontieres();
      return;
    }
    fetch(BASE + sys + "-FRONTIERES-PICTOS-VILLES-TYPO.svg")
      .then(r => r.text())
      .then(t => { frontieresCache[sys] = t; if (systeme === sys) { el.frontieres.innerHTML = t; apresFrontieres(); } })
      .catch(() => {});
  }

  // Après injection : on masque les emplacements pictos "placeholder" du SVG
  // (nos vrais pictos dynamiques sont dans la couche du dessus) + ajustements labels.
  function apresFrontieres() {
    el.frontieres.querySelectorAll('[id^="EVOLUTION_PICTO"]').forEach(g => { g.style.display = "none"; });
    ajusterVilles();
  }

  // Décale certains labels de villes selon AJUSTEMENTS_VILLES (repérés par leur nom).
  function ajusterVilles() {
    const noms = Object.keys(AJUSTEMENTS_VILLES);
    if (!noms.length) return;
    el.frontieres.querySelectorAll("text").forEach(t => {
      const nom = (t.textContent || "").replace(/\s+/g, "");
      const cle = noms.find(k => k.replace(/\s+/g, "") === nom);
      if (!cle) return;
      let off = AJUSTEMENTS_VILLES[cle];
      if (off && !Array.isArray(off)) off = off[systeme]; // format {"350":[..],"700":[..]}
      if (!off) return;
      const [dx, dy] = off;
      const tr = t.getAttribute("transform") || "";
      const m = tr.match(/translate\(\s*([-\d.]+)[ ,]+([-\d.]+)\s*\)/);
      if (m) {
        const x = parseFloat(m[1]) + dx, y = parseFloat(m[2]) + dy;
        t.setAttribute("transform", tr.replace(/translate\([^)]*\)/, "translate(" + x + " " + y + ")"));
      }
    });
  }

  // ---------- Pictos de tendance ----------
  // Chaque emplacement (posé dans le SVG) hérite de la tendance de son secteur.
  function construirePictos(sys) {
    pictoUses = [];
    if (!pictosData) { el.pictos.innerHTML = ""; return; }
    const s = CALAGE.SYSTEMES[sys];
    el.pictos.setAttribute("viewBox", "0 0 " + s.W + " " + s.H);
    const t = TAILLE_PICTO[sys] || pictosData.box[sys];
    let html = "<defs>" + pictosData.symbols + "</defs>";
    pictosData.positions[sys].forEach(([cx, cy], i) => {
      html += '<use id="pu' + i + '" x="' + (cx - t / 2) + '" y="' + (cy - t / 2) +
        '" width="' + t + '" height="' + t + '"/>';
    });
    el.pictos.innerHTML = html;
    pictoUses = pictosData.positions[sys].map(([, , sid], i) =>
      ({ u: el.pictos.querySelector("#pu" + i), sid: String(sid) }));
  }

  function majPictos(date) {
    if (!pictoUses.length) return;
    const v = valeurs[date] || {};
    for (const { u, sid } of pictoUses) {
      const info = v[sid];
      const sym = info ? pictosData.map[String(info[1])] : null;
      if (!sym) { u.style.display = "none"; continue; }
      u.style.display = "";
      u.setAttribute("href", "#picto-" + sym);
      u.setAttribute("xlink:href", "#picto-" + sym);
    }
  }

  // ---------- Bascule de format selon la largeur ----------
  function basculerSysteme() {
    const sys = el.carte.clientWidth <= SEUIL_MOBILE ? "350" : "700";
    if (sys === systeme) return false;
    systeme = sys;
    const s = CALAGE.SYSTEMES[sys];
    el.zones.setAttribute("viewBox", "0 0 " + s.W + " " + s.H);
    chargerFrontieres(sys);
    construireZones(sys);
    construirePictos(sys);
    cacherTooltip();
    return true;
  }

  // ---------- Changer de date ----------
  function afficher(i) {
    index = Math.max(0, Math.min(dates.length - 1, i));
    const v = valeurs[dates[index]] || {};
    for (const sid in paths) {
      const info = v[sid];
      paths[sid].setAttribute("fill", PALETTE[info ? info[0] : 0] || PALETTE[0]);
    }
    el.slider.value = index;
    el.date.innerHTML = dateHumaine(dates[index]);
    majPictos(dates[index]);
  }

  function dateHumaine(d) {
    const [a, m] = d.split("-");
    return MOIS[+m - 1] + " " + a;
  }

  // ---------- Tooltip ----------
  function montrerTooltip(ev, sid) {
    const v = (valeurs[dates[index]] || {})[sid];
    if (!v) { cacherTooltip(); return; }
    const [classe, tend] = v;
    const sym = pictosData ? pictosData.map[String(tend)] : null;
    const picto = sym ? pictoSvg(sym) : "";
    el.tooltip.innerHTML =
      '<div class="lmui-tooltip">' +
        '<h3 class="lmui-tooltip__supertitle">' + dateHumaine(dates[index]) + "</h3>" +
        '<h2 class="lmui-tooltip__title">État de la nappe</h2>' +
        '<div class="lmui-tooltip__legend">' +
          '<div class="lmui-tooltip__legend-item">' +
            '<span class="brgm__tt-icon"><span class="lmui-tooltip__legend-item-bullet" style="background-color:' +
              (PALETTE[classe] || PALETTE[0]) + '"></span></span>Niveau ' + (NIVEAU[classe] || "—") +
          "</div>" +
          (picto ? '<div class="lmui-tooltip__legend-item"><span class="brgm__tt-icon">' + picto + "</span>" + (TEND_LABEL[tend] || "—") + "</div>" : "") +
        "</div>" +
      "</div>";
    const r = el.carte.getBoundingClientRect();
    el.tooltip.style.left = (ev.clientX - r.left) + "px";
    el.tooltip.style.top = (ev.clientY - r.top) + "px";
    el.tooltip.classList.add("is-visible");
  }
  function cacherTooltip() { el.tooltip.classList.remove("is-visible"); }

  // ---------- Lecture / pause ----------
  function jouer() {
    if (index >= dates.length - 1) index = -1;
    el.play.classList.add("is-playing");
    el.play.setAttribute("aria-label", "Pause");
    timer = setInterval(() => {
      if (index >= dates.length - 1) { pause(); return; }
      afficher(index + 1);
    }, VITESSE);
  }
  function pause() {
    clearInterval(timer); timer = null;
    el.play.classList.remove("is-playing");
    el.play.setAttribute("aria-label", "Lecture");
  }

  // ---------- Légende ----------
  const LEG_ZERO = "Sans nappe libre étendue ou absence de points de suivi";
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function pictoSvg(id) {
    if (!pictosData) return "";
    const m = pictosData.symbols.match(
      new RegExp('<symbol id="picto-' + id + '" viewBox="([^"]*)">([\\s\\S]*?)</symbol>'));
    return m ? '<svg class="brgm__leg-picto" viewBox="' + m[1] + '" aria-hidden="true">' + m[2] + "</svg>" : "";
  }

  function construireLegende() {
    // 1) couleurs (première lettre en majuscule)
    let html = '<div class="brgm__leg-couleurs">';
    for (const c of [7, 6, 5, 4, 3, 2, 1, 0]) {
      const label = c === 0 ? LEG_ZERO : cap(NIVEAU[c]);
      html += '<span class="brgm__leg-item"><span class="brgm__leg-carre" style="background:' +
        PALETTE[c] + '"></span>' + label + "</span>";
    }
    html += "</div>";
    // 2) barre fine
    html += '<div class="brgm__leg-sep"></div>';
    // 3) tendance : sous-titre + pictos
    html += '<div class="brgm__leg-soustitre">Tendance des niveaux par rapport au relevé précédent</div>' +
      '<div class="brgm__leg-pictos">' +
      '<span class="brgm__leg-item">' + pictoSvg("hausse") + "En hausse</span>" +
      '<span class="brgm__leg-item">' + pictoSvg("stable") + "Stable</span>" +
      '<span class="brgm__leg-item">' + pictoSvg("baisse") + "En baisse</span>" +
      "</div>";
    el.legende.innerHTML = html;
  }

  // ---------- Mode sombre + choix du fond ----------
  function estSombre() {
    if (document.documentElement.getAttribute("data-color-mode") === "dark") return true;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function appliquerFond() {
    const sombre = estSombre();
    root.classList.toggle("is-dark", sombre);
    // Le fond utilise directement l'URL du data-attribut (absolue en prod,
    // relative en local) — pas de préfixe BASE, car les images Le Monde sont
    // dans un sous-dossier "compressed/" (URL complète mise dans le data-*).
    const src = el.fond.getAttribute("data-" + (sombre ? "sombre" : "clair") + "-" + systeme);
    if (src && el.fond.getAttribute("src") !== src) el.fond.setAttribute("src", src);
  }

  function onResize() {
    if (basculerSysteme()) afficher(index); // reconstruit + recolorie si le format a changé
    appliquerFond();
  }

  // ---------- Démarrage ----------
  Promise.all([
    fetch(BASE + "zones-geometrie.geojson").then(r => r.json()),
    fetch(BASE + "indicateurs.json").then(r => r.json()),
    fetch(BASE + "clip.json").then(r => r.json()),
    fetch(BASE + "pictos.json").then(r => r.json()),
  ]).then(([geo, indic, clip, pictos]) => {
    geoData = geo;
    clipData = clip;
    pictosData = pictos;
    dates = indic.dates;
    valeurs = indic.valeurs;

    construireLegende();
    el.slider.min = 0;
    el.slider.max = dates.length - 1;
    el.slider.addEventListener("input", () => { pause(); afficher(+el.slider.value); });
    el.play.addEventListener("click", () => (timer ? pause() : jouer()));

    basculerSysteme();     // construit les secteurs pour le format initial
    appliquerFond();
    afficher(dates.length - 1); // on démarre sur la date la plus récente

    if (window.matchMedia) {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", appliquerFond);
    }
    new MutationObserver(appliquerFond).observe(document.documentElement,
      { attributes: true, attributeFilter: ["data-color-mode"] });
    window.addEventListener("resize", onResize);
  }).catch(err => {
    root.innerHTML = '<p style="padding:2rem;text-align:center">Erreur de chargement des données : ' + err + "</p>";
  });
})();
