/*
 * marches-climat.js — Carte des marches pour le climat du 26 septembre 2026.
 *
 * Reprend la mécanique de la carte des nappes (brgm-nappes.js) :
 *   - même fond de carte (webp 350/700, clair/sombre) et même calage (calage.js) ;
 *   - mêmes frontières/villes, inlinées depuis *-FRONTIERES-PICTOS-VILLES-TYPO.svg ;
 *   - bascule automatique 350 (mobile) <-> 700 (desktop) selon la largeur.
 * À la place des secteurs colorés : un cercle proportionnel par mobilisation
 * (surface proportionnelle au nombre de participants), avec tooltip détaillé.
 *
 * Données : marches.json (produit par ../MAJ/build_marches.py).
 * Vanilla JS, aucune dépendance.
 */
(function () {
  "use strict";

  // ================= RÉGLAGES (modifiables) =================
  const RAYON_MAX = { "350": 17, "700": 22 };  // rayon (unités viewBox) du plus gros cercle
  const RAYON_MIN = 1.1;                        // pour que les toutes petites marches restent visibles
  const RAYON_VIDE = { "350": 2.2, "700": 3 };  // marqueur « chiffre non communiqué »
  const LEGENDE_VALEURS = { "350": [10000, 1000], "700": [10000, 2000, 200] };
  const SEUIL_MOBILE = 500;                     // largeur (px) sous laquelle on passe au format 350
  // Encart outre-mer (La Réunion…) : boîte en bas à gauche, en unités viewBox.
  const ENCART = { "350": { x: 6, y: 418, w: 64, h: 56 }, "700": { x: 10, y: 478, w: 78, h: 62 } };
  // Labels du SVG Illustrator à masquer (repérés par leur texte).
  const LABELS_RETIRES = ["Clermont"];
  // Labels ajoutés : placés depuis lon/lat, puis décalés de [dx, dy] (unités viewBox).
  // ancre : "start" = texte à droite du point, "end" = à gauche, "middle" = centré.
  const LABELS_AJOUTES = [
    { nom: "Rennes",      lon: -1.6778, lat: 48.1173, ancre: "start",  "350": [5, 5],   "700": [8, 5] },
    { nom: "Grenoble",    lon: 5.7245,  lat: 45.1885, ancre: "start",  "350": [5, 10],  "700": [8, 12] },
    { nom: "Montpellier", lon: 3.8767,  lat: 43.6108, ancre: "end",    "350": [-1, -4], "700": [-2, -6] },
  ];
  // ==========================================================

  const NS = "http://www.w3.org/2000/svg";
  const BASE = (function () {
    const s = document.currentScript && document.currentScript.src;
    return s ? s.slice(0, s.lastIndexOf("/") + 1) : "";
  })();
  const root = document.getElementById("marches-climat");
  if (!root) return;

  const el = {
    fond: root.querySelector(".mc__fond"),
    carte: root.querySelector(".mc__carte"),
    frontieres: root.querySelector(".mc__frontieres"),
    cercles: root.querySelector(".mc__cercles"),
    labels: root.querySelector(".mc__labels"),
    tooltip: root.querySelector(".mc__tooltip"),
    legende: root.querySelector(".mc__legende"),
    chiffres: root.querySelector(".mc__chiffres"),
    input: root.querySelector(".mc__input"),
    datalist: root.querySelector("#mc-villes"),
    maj: root.querySelector(".mc__maj"),
  };

  let data = null;
  let max = 1;
  let systeme = null;
  let svgCache = {};     // système -> texte SVG des frontières
  let noeuds = [];       // [{v, c:<circle>, x, y}]
  let actif = null;

  // espace insécable classique (l'espace fine de toLocaleString est trop serrée en Vend Sans)
  const fmt = n => n.toLocaleString("fr-FR").replace(/ /g, " ");
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const estOutreMer = v => /^97/.test(v.code_dep);

  function rayon(n, sys) {
    return Math.max(RAYON_MIN, RAYON_MAX[sys] * Math.sqrt(n / max));
  }

  // ---------- Frontières (dessous) + labels des villes (dessus) ----------
  // Le SVG exporté d'Illustrator contient frontières, points des villes, labels
  // et emplacements de pictos. On l'injecte deux fois :
  //   - dessous les cercles : frontières seules ;
  //   - dessus : les labels seuls, pour qu'ils restent lisibles sur les cercles.
  function chargerFrontieres(sys) {
    const suite = t => { if (systeme === sys) injecterFrontieres(t); };
    if (svgCache[sys]) return suite(svgCache[sys]);
    fetch(BASE + sys + "-FRONTIERES-PICTOS-VILLES-TYPO.svg")
      .then(r => r.text())
      .then(t => { svgCache[sys] = t; suite(t); })
      .catch(() => {});
  }

  function injecterFrontieres(texte) {
    el.frontieres.innerHTML = texte;
    const bas = el.frontieres.querySelector("svg");
    if (!bas) return;
    const typo = bas.querySelector('[id^="TYPO"]');

    // Couche du dessus : un SVG avec seulement les styles + les labels
    const haut = document.createElementNS(NS, "svg");
    haut.setAttribute("viewBox", bas.getAttribute("viewBox"));
    haut.setAttribute("preserveAspectRatio", "xMidYMid meet");
    bas.querySelectorAll("defs").forEach(d => haut.appendChild(d.cloneNode(true)));
    if (typo) haut.appendChild(typo.cloneNode(true));
    el.labels.innerHTML = "";
    el.labels.appendChild(haut);
    aplatirLabels(haut);
    retoucherLabels(haut);

    // Couche du dessous : on retire labels, points des villes et pictos
    bas.querySelectorAll('[id^="TYPO"], [id^="VILLES"], [id^="EVOLUTION_PICTO"]')
      .forEach(g => { g.style.display = "none"; });
  }

  // Les labels ont été crénés lettre à lettre pour Marr Sans (une <tspan> par
  // lettre, avec x absolu). Comme on passe en Vend Sans, on recolle chaque
  // ligne en une seule <tspan> pour laisser la police gérer ses espacements.
  function aplatirLabels(svg) {
    svg.querySelectorAll("text").forEach(t => {
      const lignes = new Map();
      t.querySelectorAll("tspan").forEach(ts => {
        const y = ts.getAttribute("y") || "0";
        lignes.set(y, (lignes.get(y) || "") + ts.textContent);
      });
      if (!lignes.size) return;
      t.textContent = "";
      lignes.forEach((txt, y) => {
        const ts = document.createElementNS(NS, "tspan");
        ts.setAttribute("x", "0"); ts.setAttribute("y", y);
        ts.textContent = txt;
        t.appendChild(ts);
      });
    });
  }

  // Retire les labels non voulus et ajoute les nôtres, avec la même classe
  // (donc la même taille) que les labels d'Illustrator.
  function retoucherLabels(svg) {
    const textes = [...svg.querySelectorAll("text")];
    textes.filter(t => LABELS_RETIRES.some(n => t.textContent.includes(n))).forEach(t => t.remove());
    const g = svg.querySelector('[id^="TYPO"]') || svg;
    const modele = textes.find(t => t.isConnected);
    LABELS_AJOUTES.forEach(l => {
      const [x, y] = CALAGE.lonlatToSvg(l.lon, l.lat, systeme);
      const [dx, dy] = l[systeme] || [6, 5];
      const t = document.createElementNS(NS, "text");
      if (modele) t.setAttribute("class", modele.getAttribute("class"));
      t.setAttribute("x", (x + dx).toFixed(2));
      t.setAttribute("y", (y + dy).toFixed(2));
      t.setAttribute("text-anchor", l.ancre || "start");
      t.textContent = l.nom;
      g.appendChild(t);
    });
  }

  // ---------- Cercles ----------
  function construireCercles(sys) {
    const s = CALAGE.SYSTEMES[sys];
    el.cercles.setAttribute("viewBox", "0 0 " + s.W + " " + s.H);
    el.cercles.innerHTML = "";
    noeuds = [];

    // encart outre-mer (seulement s'il y a des mobilisations ultramarines)
    const om = data.villes.filter(estOutreMer);
    const E = ENCART[sys];
    if (om.length) {
      const g = document.createElementNS(NS, "g");
      g.setAttribute("class", "mc__encart");
      g.innerHTML = '<rect x="' + E.x + '" y="' + E.y + '" width="' + E.w + '" height="' + E.h + '" rx="3"/>' +
        '<text x="' + (E.x + 5) + '" y="' + (E.y + 10) + '">Outre-mer</text>';
      el.cercles.appendChild(g);
    }

    const g = document.createElementNS(NS, "g");
    // Du plus gros au plus petit : les petits cercles restent survolables par-dessus.
    data.villes.forEach((v, i) => {
      let x, y;
      if (estOutreMer(v)) {
        const k = om.indexOf(v);
        x = E.x + E.w / 2 + (k - (om.length - 1) / 2) * 16;
        y = E.y + E.h / 2 + 5;
        const lab = document.createElementNS(NS, "text");
        lab.setAttribute("x", x); lab.setAttribute("y", E.y + E.h - 5);
        lab.setAttribute("text-anchor", "middle");
        lab.textContent = v.departement;
        el.cercles.querySelector(".mc__encart").appendChild(lab);
      } else {
        [x, y] = CALAGE.lonlatToSvg(v.lon, v.lat, sys);
      }
      const c = document.createElementNS(NS, "circle");
      c.setAttribute("cx", x.toFixed(2));
      c.setAttribute("cy", y.toFixed(2));
      c.setAttribute("r", (v.participants ? rayon(v.participants, sys) : RAYON_VIDE[sys]).toFixed(2));
      c.setAttribute("class", "mc__cercle" + (v.participants ? "" : " is-vide"));
      c.setAttribute("tabindex", "0");
      c.setAttribute("aria-label", v.ville + " : " + (v.participants ? fmt(v.participants) + " participants selon les organisateurs" : "chiffre non communiqué"));
      c.addEventListener("mousemove", ev => montrer(i, ev.clientX, ev.clientY));
      c.addEventListener("mouseleave", () => { if (actif !== i) cacher(); });
      c.addEventListener("click", ev => { ev.stopPropagation(); activer(i); });
      c.addEventListener("focus", () => activer(i));
      c.addEventListener("blur", () => { if (actif === i) desactiver(); });
      g.appendChild(c);
      noeuds.push({ v, c, x, y });
    });
    // les cercles « vides » (sans chiffre) passent au-dessus : ils sont petits
    g.querySelectorAll(".is-vide").forEach(c => g.appendChild(c));
    el.cercles.appendChild(g);
  }

  // ---------- Tooltip ----------
  function contenu(v) {
    let h = '<div class="mc__tt">' +
      '<p class="mc__tt-dep">' + esc(v.departement) + " (" + esc(v.code_dep) + ")</p>" +
      '<p class="mc__tt-ville">' + esc(v.ville) + "</p>";
    if (v.participants) {
      h += '<p class="mc__tt-nb">' + fmt(v.participants) + " <small>participant" + (v.participants > 1 ? "s" : "") + "</small></p>" +
        '<p class="mc__tt-qui">selon les organisateurs</p>';
    } else {
      h += '<p class="mc__tt-vide">Chiffre non communiqué par le groupe local</p>';
    }
    return h + "</div>";
  }

  function montrer(i, clientX, clientY) {
    const r = el.carte.getBoundingClientRect();
    el.tooltip.innerHTML = contenu(noeuds[i].v);
    let x = clientX - r.left, y = clientY - r.top;
    // garder la bulle dans la carte, et la passer dessous si on est trop haut
    const demi = el.tooltip.offsetWidth / 2;
    x = Math.max(demi + 4, Math.min(r.width - demi - 4, x));
    el.tooltip.classList.toggle("is-dessous", y < el.tooltip.offsetHeight + 24);
    el.tooltip.style.left = x + "px";
    el.tooltip.style.top = y + "px";
    el.tooltip.classList.add("is-visible");
  }
  function montrerSurCercle(i) {
    const n = noeuds[i];
    const svgR = el.cercles.getBoundingClientRect();
    const s = CALAGE.SYSTEMES[systeme];
    const k = svgR.width / s.W;
    montrer(i, svgR.left + n.x * k, svgR.top + n.y * k);
  }
  function cacher() { el.tooltip.classList.remove("is-visible"); }

  function activer(i) {
    desactiver();
    actif = i;
    noeuds[i].c.classList.add("is-actif");
    montrerSurCercle(i);
  }
  function desactiver() {
    if (actif !== null && noeuds[actif]) noeuds[actif].c.classList.remove("is-actif");
    actif = null;
    cacher();
  }

  // ---------- Recherche ----------
  const libelle = v => v.ville + " (" + v.code_dep + ")";
  function construireRecherche() {
    const tri = data.villes.slice().sort((a, b) => a.ville.localeCompare(b.ville, "fr"));
    el.datalist.innerHTML = tri.map(v => '<option value="' + esc(libelle(v)) + '"></option>').join("");
    const chercher = () => {
      const q = el.input.value.trim().toLowerCase();
      if (!q) return;
      const i = noeuds.findIndex(n => libelle(n.v).toLowerCase() === q) >= 0
        ? noeuds.findIndex(n => libelle(n.v).toLowerCase() === q)
        : noeuds.findIndex(n => n.v.ville.toLowerCase() === q);
      if (i >= 0) activer(i);
    };
    el.input.addEventListener("change", chercher);
    el.input.addEventListener("input", chercher);
  }

  // ---------- Légende (en pixels écran, recalculée au redimensionnement) ----------
  function construireLegende() {
    const s = CALAGE.SYSTEMES[systeme];
    const k = el.carte.clientWidth / s.W;             // px par unité viewBox
    const vals = LEGENDE_VALEURS[systeme];
    const rs = vals.map(n => rayon(n, systeme) * k);
    const R = rs[0], larg = 2 * R + 46, haut = 2 * R + 2;
    let svg = '<svg class="mc__leg-cercles" width="' + larg.toFixed(0) + '" height="' + haut.toFixed(0) + '">';
    vals.forEach((n, j) => {
      const r = rs[j], cy = haut - 1 - r;
      svg += '<circle cx="' + R.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + r.toFixed(1) + '"/>' +
        '<line x1="' + R.toFixed(1) + '" x2="' + (2 * R + 4).toFixed(1) + '" y1="' + (cy - r).toFixed(1) + '" y2="' + (cy - r).toFixed(1) + '"/>' +
        '<text x="' + (2 * R + 6).toFixed(1) + '" y="' + (cy - r + 3.5).toFixed(1) + '">' + fmt(n) + "</text>";
    });
    svg += "</svg>";
    const rv = RAYON_VIDE[systeme] * k;
    el.legende.innerHTML =
      '<div><div style="margin-bottom:.25rem">Participants</div>' + svg + "</div>" +
      '<span class="mc__leg-vide"><svg width="' + (2 * rv + 3).toFixed(0) + '" height="' + (2 * rv + 3).toFixed(0) + '"><circle cx="' +
      (rv + 1.5).toFixed(1) + '" cy="' + (rv + 1.5).toFixed(1) + '" r="' + rv.toFixed(1) + '"/></svg>Chiffre non communiqué</span>';
  }

  function construireChiffres() {
    const d = data;
    const item = (n, t) => '<div class="mc__chiffre"><b>' + n + "</b>" + t + "</div>";
    el.chiffres.innerHTML =
      item(fmt(d.total), "participants déclarés") +
      item(fmt(d.nb_mobilisations), "mobilisations") +
      item(fmt(d.nb_departements), "départements");
    const [a, m, j] = d.maj.split("-");
    el.maj.textContent = "données au " + (+j) + "/" + m + "/" + a;
  }

  // ---------- Bascule de format + mode sombre ----------
  function basculerSysteme() {
    const sys = el.carte.clientWidth <= SEUIL_MOBILE ? "350" : "700";
    if (sys === systeme) return false;
    systeme = sys;
    desactiver();
    chargerFrontieres(sys);
    construireCercles(sys);
    return true;
  }
  function estSombre() {
    const m = document.documentElement.getAttribute("data-color-mode");
    if (m === "dark") return true;
    if (m === "light") return false;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function appliquerFond() {
    const sombre = estSombre();
    root.classList.toggle("is-dark", sombre);
    const src = el.fond.getAttribute("data-" + (sombre ? "sombre" : "clair") + "-" + systeme);
    if (src && el.fond.getAttribute("src") !== src) el.fond.setAttribute("src", src);
  }
  function onResize() {
    basculerSysteme();
    appliquerFond();
    construireLegende();
    if (actif !== null) montrerSurCercle(actif);
  }

  // ---------- Démarrage ----------
  fetch(BASE + "marches.json").then(r => r.json()).then(d => {
    data = d;
    max = Math.max(...d.villes.map(v => v.participants || 0));
    construireChiffres();
    basculerSysteme();
    appliquerFond();
    construireLegende();
    construireRecherche();

    // toucher/cliquer hors d'un cercle ferme la bulle
    el.carte.addEventListener("click", desactiver);
    document.addEventListener("keydown", e => { if (e.key === "Escape") desactiver(); });
    if (window.matchMedia) {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", appliquerFond);
    }
    new MutationObserver(appliquerFond).observe(document.documentElement,
      { attributes: true, attributeFilter: ["data-color-mode"] });
    window.addEventListener("resize", onResize);

    // lien direct vers une ville : index.html#Grenoble
    const ouvrirAncre = () => {
      const q = decodeURIComponent(location.hash.slice(1)).trim().toLowerCase();
      const i = q ? noeuds.findIndex(n => n.v.ville.toLowerCase() === q) : -1;
      if (i >= 0) activer(i);
    };
    window.addEventListener("hashchange", ouvrirAncre);
    requestAnimationFrame(ouvrirAncre);
  }).catch(err => {
    root.insertAdjacentHTML("beforeend", '<p style="padding:2rem;text-align:center">Erreur de chargement des données : ' + esc(err) + "</p>");
  });
})();
