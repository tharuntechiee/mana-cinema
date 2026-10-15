// Home page: cover (title and star ring), featured Telugu films, box-office pulse, new this week,
// all-India leaderboard, films, coming soon, how we track, feedback, photo credits.
// Every figure comes from js/boxoffice.js; this file only arranges it on the page.

// ---------- Helpers ----------
const $ = id => document.getElementById(id);
const releasedFilms = MOVIES.filter(isReleased);
const upcomingFilms = MOVIES.filter(m => !isReleased(m));
const filmURL = m => `film.html?id=${Number(m.id)}`;
const listsURL = (lang, list = "top") => `lists.html?lang=${encodeURIComponent(lang)}&list=${list}`;
// Release year; films without an exact date fall back to their year field
const yearOf = m => parseDay(m.release)?.getFullYear() ?? (Number(m.year) || null);
const releaseTime = m => parseDay(m.release)?.getTime() ?? 0;
const byTitle = (a, b) => String(a.title).localeCompare(String(b.title));
const outOf10 = v => `${v.toFixed(1)}<small>/10</small>`;
// Drawn artwork (js/art.js). List films have none, so their posters print the title instead.
const hasArt = m => Boolean(HEROES[m.art]);
// "Hindi · 2016" (already escaped)
const langYear = m => [m.lang && esc(m.lang), yearOf(m)].filter(Boolean).join(" · ");
// The opening day figure counts paid previews: a Day 0 row, or previews a list film reported apart
// (Stree 2). It then differs from the figure without them.
function openingHasPreviews(m) {
  const od = openingDay(m);
  return od !== null && od !== openingDay(m, { previews: false });
}

// Figures the cards, sorts and search need, worked out once per film.
// The catalogue doesn't change while the page is open, so the cache lives as long as the page.
const filmCache = new Map();
function filmFacts(m) {
  let f = filmCache.get(m);
  if (!f) {
    f = {
      ww: worldwideGross(m),
      net: indiaNet(m),
      opening: openingDay(m),
      score: overallScore(m),
      year: yearOf(m),
      text: [m.title, m.genre, m.director, m.cast, m.lang].join(" ").toLowerCase(),
    };
    filmCache.set(m, f);
  }
  return f;
}

// The "All languages" chip's value. Empty, so it can't clash with a language an admin typed in ("all").
const ALL_LANGS = "";
// Years with released films in a language (ALL_LANGS = every language), newest first
const yearsOf = lang => [...new Set(releasedFilms.filter(m => lang === ALL_LANGS || m.lang === lang).map(yearOf).filter(Boolean))].sort((a, b) => b - a);
const releasedLangs = languagesIn(releasedFilms);

// "Fri 16 Oct", with the year only when it isn't this year ("Thu 25 Sep 2025")
const shortDate = d => dayLabel(d, { weekday: true, year: d.getFullYear() !== startOfToday().getFullYear() });

// "Today", "Tomorrow", "In 12 days", then weeks and months further out. Empty without an exact date.
function countdown(m) {
  const n = daysUntil(m);
  if (n === null) return "";
  if (n <= 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n <= 30) return `In ${n} days`;
  if (n <= 90) return `In ${Math.round(n / 7)} weeks`;
  const months = Math.round(n / 30.44);
  return months < 24 ? `In ${months} months` : `In ${Math.round(months / 12)} years`;
}

// Facts in one line: "A | Telugu | 2h 34m". Each item is HTML that is already escaped.
// The bars come from CSS (.pipe-line), so screen readers don't read them out.
function pipeLine(items, cls = "") {
  const list = items.filter(Boolean);
  return list.length ? `<p class="pipe-line${cls ? " " + cls : ""}">${list.map(x => `<span>${x}</span>`).join("")}</p>` : "";
}

// Certificate | language | runtime | release date, then the genre as pills ("Action", "Gangster Drama")
function heroFactsHTML(m) {
  const facts = pipeLine([
    m.cert && `<span class="sr-only">Certificate </span>${esc(m.cert)}`,
    m.lang && esc(m.lang),
    m.duration && esc(m.duration),
    parseDay(m.release)
      ? `<span class="sr-only">${isReleased(m) ? "Released" : "Releasing"} </span>${dayLabel(m.release)}`
      : yearOf(m),   // list films without an exact date show their year
  ], "hero-line");
  const genres = String(m.genre || "").split("/").map(g => g.trim()).filter(Boolean);
  const pills = genres.length
    ? `<ul class="genre-pills" aria-label="Genre">${genres.map(g => `<li class="tag">${esc(g)}</li>`).join("")}</ul>`
    : "";
  return facts + pills;
}

// Headline figures on a carousel slide. A figure that isn't reported is left out, never shown as 0.
// The rating is IMDb's, else the critics' average.
function statsHTML(m) {
  const od = openingDay(m), ww = worldwideGross(m), imdb = imdbScore(m), cs = imdb ? null : criticsScore(m);
  const items = [
    od !== null && ["Opening day", `<span class="money">${crore(od)}</span>${openingHasPreviews(m) ? "<small>incl. previews</small>" : ""}`],
    ww !== null && ["Worldwide gross", `<span class="money">${crore(ww)}</span>`],
    verdict(m) && ["Verdict", verdictHTML(m)],
    imdb && ["IMDb", `<span class="score">${outOf10(imdb.score)}</span>`],
    cs && ["Critics", `<span class="score">${outOf10(cs.score)}</span>`],
  ].filter(Boolean);
  return items.length
    ? `<dl class="stat-strip">${items.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("")}</dl>`
    : "";
}

// The title (and "Hindi · 2016") printed on a poster without artwork, so it isn't a blank gradient.
// Decorative: the title is in the text next to it as well.
const posterNameHTML = m => `
  <div class="poster-name" aria-hidden="true">
    <span class="poster-title">${esc(m.title)}</span>
    <span class="poster-lang">${langYear(m)}</span>
  </div>`;

// Chip buttons for a filter row: [value, label] pairs, the current value pressed
const chipsHTML = (items, current, attr) => items
  .map(([value, label]) => `<button type="button" class="chip" data-${attr}="${esc(value)}" aria-pressed="${String(value) === String(current)}">${esc(label)}</button>`).join("");
const langChips = current => chipsHTML([[ALL_LANGS, "All languages"], ...releasedLangs.map(l => [l, l])], current, "lang");
const yearChips = (lang, current, allLabel) => chipsHTML([["all", allLabel], ...yearsOf(lang).map(y => [y, y])], current, "year");

// Selects one chip in a group
function press(group, chip) {
  group.querySelectorAll(".chip").forEach(c => c.setAttribute("aria-pressed", c === chip));
}

// On phones the leaderboard chips scroll sideways: bring the pressed one into view
// (by scrolling the row only, so the page itself doesn't move)
function revealPressed(group) {
  const chip = group.querySelector('[aria-pressed="true"]');
  if (!chip || group.scrollWidth <= group.clientWidth) return;
  const g = group.getBoundingClientRect(), c = chip.getBoundingClientRect();
  if (c.left >= g.left && c.right <= g.right) return;
  const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  group.scrollBy({ left: c.left - g.left - (g.width - c.width) / 2, behavior: smooth ? "smooth" : "auto" });
}

// Released films with at least one reported figure ("How we track" counts these)
const trackedFilms = releasedFilms.filter(m => { const f = filmFacts(m); return f.ww !== null || f.net !== null || f.opening !== null; });
const countText = n => n.toLocaleString("en-IN");

// ---------- Cover: the star ring ----------
// Pawan Kalyan in the centre, heroes from every language on two rings around him (js/cover-stars.js).
// The centre star is styled after They Call Him OG and links to its film page, with its tag and figures
// under his name; every other star links to the box-office lists for his language.
// From 1024px up the stars sit on two ellipses worked out below from the stage's width and the screen's
// height; narrower screens lay them out in CSS (a wrapping grid on tablets, one sideways-scrolling row on phones).
const STAR_LEAD = "pawan-kalyan";
const LEAD_FILM_ID = 10;   // They Call Him OG
const leadFilm = getMovie(LEAD_FILM_ID);
// Clockwise from the top. The outer ring starts half a step on, so its stars sit between the inner ones.
const STAR_RINGS = [
  ["prabhas", "allu-arjun", "jr-ntr", "ram-charan", "shah-rukh-khan", "rajinikanth", "mohanlal", "yash", "vijay"],
  ["mahesh-babu", "chiranjeevi", "salman-khan", "aamir-khan", "ranveer-singh", "mammootty", "rishab-shetty",
    "riteish-deshmukh", "dev", "prosenjit-chatterjee", "diljit-dosanjh", "malhar-thakar"],
];
const coverStars = typeof COVER_STARS !== "undefined" && Array.isArray(COVER_STARS) ? COVER_STARS : [];
const starLead = coverStars.find(s => s.slug === STAR_LEAD) || coverStars[0];
const starRings = (() => {
  const bySlug = new Map(coverStars.map(s => [s.slug, s]));
  const rings = STAR_RINGS.map(ring => ring.map(slug => bySlug.get(slug)).filter(Boolean));
  // A star added to js/cover-stars.js but not to a ring above joins the outer ring
  const placed = new Set([starLead, ...rings.flat()]);
  rings[1].push(...coverStars.filter(s => !placed.has(s)));
  return rings;
})();
const starStage = $("starStage");

// One star: the photo in a circle, the name under it, then the language (shown in the grid and the
// phone row; on the rings it appears on hover). The link's name says where it goes.
const listsLink = s => `lists.html?lang=${esc(encodeURIComponent(s.lang))}`;
function starHTML(s, i) {
  return `
    <a class="star" href="${listsLink(s)}" aria-label="${esc(`${s.name}: ${s.lang} box office lists`)}" style="--i:${i}">
      <span class="star-photo"><img src="${esc(s.img)}" width="360" height="360" alt="${esc(s.name)}" decoding="async" loading="lazy"></span>
      <span class="star-name">${esc(s.name)}</span>
      <span class="star-lang">${esc(s.lang)}</span>
    </a>`;
}

// "₹295.22 Cr worldwide · Hit": the OG film's worldwide gross and verdict, leaving out whichever isn't in
function leadFigures(m) {
  const ww = worldwideGross(m), v = verdict(m);
  return [
    ww !== null && `${crore(ww)} worldwide`,
    v && `${v.running ? "Trending: " : ""}${v.label}${v.indicative || v.running ? "*" : ""}`,
  ].filter(Boolean).join(" · ");
}

// The centre star: his photo in a red ring, his name, then the film's tag and figures. It links to the
// film's page; without the film (an admin removed it) it links to his language's lists like the others.
function leadHTML(s) {
  const m = leadFilm;
  const figures = m ? leadFigures(m) : "";
  return `
    <a class="star star-lead${m ? " star-og" : ""}" href="${m ? filmURL(m) : listsLink(s)}" aria-label="${esc(m ? `${s.name}: ${m.title} box office` : `${s.name}: ${s.lang} box office lists`)}" style="--i:0">
      <span class="star-photo"><img src="${esc(s.img)}" width="520" height="520" alt="${esc(s.name)}" decoding="async" loading="eager" fetchpriority="high"></span>
      <span class="lead-caption">
        <span class="star-name">${esc(s.name)}</span>
        ${m ? `<span class="og-tag">${esc(m.title)}</span>` : ""}
        ${figures ? `<span class="og-figures">${esc(figures)}</span>` : ""}
      </span>
    </a>`;
}

if (starLead) {
  let n = 1;
  starStage.innerHTML = `
    ${leadHTML(starLead)}
    <ul class="star-ring" role="list">
      ${starRings.map((ring, r) => ring.map((s, k) => `<li class="ring-${r}" data-ring="${r}" data-k="${k}">${starHTML(s, n++)}</li>`).join("")).join("")}
    </ul>`;
} else {
  starStage.hidden = true;
}

// The rings are ellipses around the middle circle. The outer ring is as wide as the stage allows (its
// widest star just fits) and the inner ring is a share of it (see below). Their heights start in proportion to
// their widths, squashed if need be so the title, the rings and the calls to action fit on the first
// screen; then each half of a ring (above and below the middle) grows taller until no star comes within
// STAR_GAP of another or of the middle star. The gap always wins over fitting the screen. A star counts
// as the box around its circle and name, so names never touch either; the middle star counts as its
// circle and the caption under it (name, film tag, figures). The halves are sized separately because the
// caption and the names hang below the circles, so the rings need more room below the middle than above.
// The stage then takes the height the rings need (8px spare above the top circle and below the lowest
// name), with the middle circle at its horizontal centre.
const ringMode = matchMedia("(min-width: 1024px)");
// Inner ring width : outer (the usual share first, then others to try); height : width of each ring
// before any squashing. The outer ring stays at least `orbit` times as tall as the inner one (above and
// below), so it still reads as the outer orbit.
const RING_SHAPE = { inner: [0.72, 0.76, 0.68, 0.8], innerTall: 0.68, outerTall: 0.6, orbit: 1.1 };
const SQUASH_MIN = 0.3;   // the flattest the rings start, as a share of the heights above
const STAR_GAP = 12;

// Room for the stage on the first screen: the window less what sits above the stage (navbar, the cover's
// top padding, the title) and the calls to action under it, with 12px to spare
function stageBudget() {
  const cover = $("cover"), head = cover.querySelector(".cover-head"), actions = cover.querySelector(".cover-actions");
  const px = (el, prop) => parseFloat(getComputedStyle(el)[prop]) || 0;
  const above = cover.offsetTop + px(cover, "paddingTop") + head.offsetHeight + px(head, "marginBottom");
  const below = actions ? actions.offsetHeight + px(actions, "marginTop") : 0;
  return innerHeight - above - below - 12;
}

function layoutStars() {
  if (starStage.hidden) return;
  if (!ringMode.matches) {
    starStage.style.removeProperty("--stage-h");
    starStage.style.removeProperty("--centre-y");
    return;
  }
  const half = starStage.clientWidth / 2 - 4;   // stars stay 4px inside the stage
  const lead = starStage.querySelector(".star-lead");
  const leadD = lead.querySelector(".star-photo").offsetWidth;
  const caption = lead.querySelector(".lead-caption");
  // Boxes are measured from the centre of the middle circle: the circle, then the caption under it
  const fixed = [
    { x0: -leadD / 2, x1: leadD / 2, y0: -leadD / 2, y1: leadD / 2 },
    { x0: -caption.offsetWidth / 2, x1: caption.offsetWidth / 2, y0: caption.offsetTop - leadD / 2, y1: caption.offsetTop + caption.offsetHeight - leadD / 2 },
  ];
  const stars = [...starStage.querySelectorAll(".star-ring > li")].map(li => {
    const ring = Number(li.dataset.ring);
    const step = 2 * Math.PI / starRings[ring].length;
    const angle = (Number(li.dataset.k) + (ring ? 0.5 : 0)) * step;   // clockwise from the top
    return {
      li, ring, angle,
      side: Math.cos(angle) > 1e-6 ? 0 : 1,   // 0: above the middle, 1: level with it or below
      d: li.querySelector(".star-photo").offsetWidth,
      w: li.offsetWidth,
      h: li.offsetHeight,   // from the top of the circle to the bottom of the name
    };
  });
  const fit = list => Math.min(half - 40, ...list.map(s => (half - s.w / 2) / Math.max(Math.abs(Math.sin(s.angle)), 0.2)));
  const outerX = fit(stars.filter(s => s.ring === 1));
  const innerMax = fit(stars.filter(s => s.ring === 0));
  const near = (p, q) => Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0) > -STAR_GAP && Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0) > -STAR_GAP;

  // The rings for one inner share and squash factor: ry[ring][side] starts from the proportions above,
  // then grows
  function place(share, squash) {
    const rx = [Math.min(outerX * share, innerMax), outerX];
    const ry = [rx[0] * RING_SHAPE.innerTall * squash, rx[1] * RING_SHAPE.outerTall * squash].map(v => [v, v]);
    const keepOrbit = () => ry[1].forEach((v, side) => { ry[1][side] = Math.max(v, ry[0][side] * RING_SHAPE.orbit); });
    const boxOf = s => {
      const x = Math.sin(s.angle) * rx[s.ring], y = -Math.cos(s.angle) * ry[s.ring][s.side];
      return { x, y, x0: x - s.w / 2, x1: x + s.w / 2, y0: y - s.d / 2, y1: y - s.d / 2 + s.h };
    };
    keepOrbit();
    let boxes = stars.map(boxOf);
    for (let tries = 0; tries < 400; tries++) {
      // A clash involving an outer star moves that side of the outer ring out; one between inner stars (or
      // with the middle star) moves that side of the inner ring out, which may in turn push the outer ring
      const grow = [[false, false], [false, false]];
      let clashed = false;
      boxes.forEach((p, i) => {
        const clash = (other, b = null) => {
          if (!near(p, other)) return;
          clashed = true;
          const pair = [stars[i], b].filter(Boolean);
          const outer = pair.filter(s => s.ring === 1);
          (outer.length ? outer : pair).forEach(s => { grow[s.ring][s.side] = true; });
        };
        fixed.forEach(f => clash(f));
        for (let j = i + 1; j < boxes.length; j++) clash(boxes[j], stars[j]);
      });
      if (!clashed) break;
      grow.forEach((sides, r) => sides.forEach((on, side) => { if (on) ry[r][side] *= 1.01; }));
      keepOrbit();
      boxes = stars.map(boxOf);
    }
    const all = [...fixed, ...boxes];
    const above = Math.ceil(Math.max(...all.map(b => -b.y0)) + 8);
    const below = Math.ceil(Math.max(...all.map(b => b.y1)) + 8);
    return { boxes, above, height: above + below };
  }

  // The inner ring's share: the first that lets the rings fit the first screen, else whichever packs them
  // flattest. (On a narrower stage the inner ring's bottom stars must spread wider to clear the caption,
  // or they drop below it and push the outer ring down too.)
  const budget = stageBudget();
  const flattest = RING_SHAPE.inner.map(share => ({ share, ...place(share, SQUASH_MIN) }));
  const pick = flattest.find(f => f.height <= budget) || flattest.reduce((a, b) => (b.height < a.height ? b : a));
  // Then the roundest rings that fit: the natural shape if it fits, else the least squash that does
  // (found by halving), else the flattest
  let best = place(pick.share, 1);
  if (best.height > budget) {
    let lo = SQUASH_MIN, hi = 1;
    best = pick;
    if (best.height <= budget) {
      for (let k = 0; k < 8; k++) {
        const mid = (lo + hi) / 2, tried = place(pick.share, mid);
        if (tried.height <= budget) { lo = mid; best = tried; } else hi = mid;
      }
    }
  }
  starStage.style.setProperty("--stage-h", `${best.height}px`);
  starStage.style.setProperty("--centre-y", `${best.above}px`);
  stars.forEach((s, i) => {
    s.li.style.setProperty("--x", `${best.boxes[i].x.toFixed(1)}px`);
    s.li.style.setProperty("--y", `${best.boxes[i].y.toFixed(1)}px`);
  });
}

if (!starStage.hidden) {
  layoutStars();
  // Only a change of the stage's width, the circle sizes (CSS picks them by screen width and height) or
  // the window's height moves the stars. The title block and the middle circle are watched, not the
  // stage, so the stage's own new height can't loop back here.
  const leadPhoto = starStage.querySelector(".star-lead .star-photo");
  const sizeKey = () => `${starStage.clientWidth}:${leadPhoto.offsetWidth}:${innerHeight}`;
  let lastKey = sizeKey();
  const relayout = () => {
    if (sizeKey() === lastKey) return;
    lastKey = sizeKey();
    layoutStars();
  };
  const ruler = document.querySelector(".cover-head");
  if ("ResizeObserver" in window && ruler) {
    const watch = new ResizeObserver(relayout);
    watch.observe(ruler);
    watch.observe(leadPhoto);
  }
  addEventListener("resize", relayout);
  ringMode.addEventListener("change", layoutStars);
  document.fonts?.ready.then(layoutStars);   // the names are measured: measure again in the web font
}

// ---------- Featured carousel ----------
// Telugu stays in the spotlight: the three biggest Telugu worldwide grossers.
// Their rank among Telugu films goes on each slide.
const teluguRanks = ranking(MOVIES.filter(m => m.lang === "Telugu"), "worldwide").slice(0, 3);
const featured = teluguRanks.map(r => r.m);
const featuredRank = new Map(teluguRanks.map(r => [r.m, r.rank]));
const hero = $("home");
const heroContent = $("heroContent");
let heroIndex = 0;
let heroTimer = null;
let heroPaused = false;   // the visitor pressed Pause or picked a slide: stay still until they press Play

// Kicker, title, facts, a short description (or the credits for list films, which have none),
// the headline figures and two calls to action
function slideHTML(m) {
  return `
    <p class="hero-kicker">Telugu spotlight · No. ${featuredRank.get(m)} grosser</p>
    <h2 class="hero-title">${esc(m.title)}</h2>
    ${heroFactsHTML(m)}
    ${m.desc ? `<p class="lead">${esc(m.desc)}</p>` : creditsHTML(m)}
    ${statsHTML(m)}
    <div class="hero-actions">
      <a href="${filmURL(m)}" class="btn btn-primary">Collections &amp; ratings<span class="sr-only">: ${esc(m.title)}</span></a>
      <a href="#films" class="btn btn-ghost">All films</a>
    </div>`;
}

function showHero(i) {
  heroIndex = i;
  const m = featured[i];
  const heroPoster = $("heroPoster");
  heroPoster.setAttribute("style", posterStyle(m));
  heroPoster.innerHTML = hasArt(m) ? heroArt(m) : posterNameHTML(m);
  // A real poster photo replaces the drawn artwork once it loads (as on the film cards)
  const photo = posterImage(m);
  if (photo) {
    const img = new Image();
    const hideArt = () => { if (featured[heroIndex] === m) heroPoster.innerHTML = ""; };
    img.onload = hideArt;
    img.src = photo;
    if (img.complete && img.naturalWidth) hideArt();   // already cached: no flash of the artwork
  }
  heroContent.innerHTML = slideHTML(m);
  icons();
  document.querySelectorAll(".hero-dot").forEach((d, n) => {
    d.classList.toggle("active", n === i);
    d.setAttribute("aria-current", n === i);
  });
}

// Screen readers hear a slide change only when it isn't rotating by itself (WAI carousel pattern)
const canRotate = () => featured.length > 1 && !matchMedia("(prefers-reduced-motion: reduce)").matches;
function startHeroTimer() {
  clearInterval(heroTimer);
  heroTimer = !heroPaused && canRotate()
    ? setInterval(() => showHero((heroIndex + 1) % featured.length), 6500)
    : null;
  heroContent.setAttribute("aria-live", heroTimer ? "off" : "polite");
}
function stopHeroTimer() {
  clearInterval(heroTimer);
  heroTimer = null;
  heroContent.setAttribute("aria-live", "polite");
}
// The Pause / Play button (WCAG 2.2.2): a pause lasts until the visitor presses Play
function setHeroPaused(paused) {
  heroPaused = paused;
  const btn = $("heroPause");
  btn.setAttribute("aria-label", paused ? "Play featured films" : "Pause featured films");
  btn.innerHTML = `<i data-lucide="${paused ? "play" : "pause"}"></i>`;
  icons();
  if (paused) stopHeroTimer(); else startHeroTimer();
}

// Slides differ in height. Keep the slide area as tall as the tallest one (at this width),
// so the page below doesn't jump every time the slide changes.
function fitHero() {
  const live = heroContent.getAttribute("aria-live");
  heroContent.setAttribute("aria-live", "off");
  heroContent.style.minHeight = "";
  const tallest = Math.max(...featured.map(m => {
    heroContent.innerHTML = slideHTML(m);
    icons();
    return heroContent.offsetHeight;
  }));
  heroContent.style.minHeight = `${tallest}px`;
  showHero(heroIndex);
  heroContent.setAttribute("aria-live", live);
}

if (featured.length) {
  $("heroDots").innerHTML = featured
    .map((m, i) => `<button type="button" class="hero-dot" aria-label="${esc(m.title)}" data-i="${i}"></button>`).join("");
  // No rotation (one film, or reduced motion): nothing to pause
  $("heroPause").hidden = !canRotate();
  $("heroPause").addEventListener("click", () => setHeroPaused(!heroPaused));
  // Picking a slide pauses the rotation, as Pause does; it starts again only when the visitor presses Play
  $("heroDots").addEventListener("click", e => {
    const dot = e.target.closest(".hero-dot");
    if (!dot) return;
    setHeroPaused(true);
    showHero(Number(dot.dataset.i));
  });
  // Hold still while someone is reading or using the slide (these holds never undo a pause)
  hero.addEventListener("mouseenter", stopHeroTimer);
  hero.addEventListener("mouseleave", () => { if (!hero.contains(document.activeElement)) startHeroTimer(); });
  hero.addEventListener("focusin", stopHeroTimer);
  hero.addEventListener("focusout", e => { if (!hero.contains(e.relatedTarget) && !hero.matches(":hover")) startHeroTimer(); });
  startHeroTimer();
  fitHero();   // also shows the first slide
  // Heights change once the web fonts arrive and when the width changes
  document.fonts?.ready.then(fitHero);
  let fitWidth = innerWidth, fitTimer;
  addEventListener("resize", () => {
    if (innerWidth === fitWidth) return;   // phones fire resize as the address bar hides; only width matters
    fitWidth = innerWidth;
    clearTimeout(fitTimer);
    fitTimer = setTimeout(fitHero, 200);
  });
} else {
  hero.hidden = true;
}

// ---------- Box-office pulse ----------
// Each tile: what it is, the film, its language, then the figure
function pulseTile(m, icon, label, figure) {
  return `
    <li>
      <a class="pulse-tile" href="${filmURL(m)}">
        <span class="pulse-label"><i data-lucide="${icon}"></i>${label}</span>
        <strong class="pulse-title">${esc(m.title)}</strong>
        ${m.lang ? `<span class="pulse-lang">${esc(m.lang)}</span>` : ""}
        <span class="pulse-figure">${figure}</span>
      </a>
    </li>`;
}

(function renderPulse() {
  // Across every language
  const opening = ranking(MOVIES, "opening")[0];
  const grosser = ranking(MOVIES, "worldwide")[0];
  const latest = [...releasedFilms].sort((a, b) => releaseTime(b) - releaseTime(a))[0];
  const next = upcomingFilms.filter(m => daysUntil(m) !== null).sort((a, b) => daysUntil(a) - daysUntil(b))[0];
  // Verdict first, then the worldwide total, then India net (a running film often has day-wise net only)
  const latestFigure = m => {
    if (verdict(m)) return verdictHTML(m);
    const ww = worldwideGross(m);
    if (ww !== null) return `<strong class="money">${crore(ww)}</strong><small>worldwide</small>`;
    const net = indiaNet(m);
    return net !== null
      ? `<strong class="money">${crore(net)}</strong><small>India net${boxOffice(m).running ? " so far" : ""}</small>`
      : `<small>Collections pending</small>`;
  };
  const tiles = [
    opening && pulseTile(opening.m, "zap", "Biggest opening", `<strong class="money">${crore(opening.value)}</strong><small>India net${openingHasPreviews(opening.m) ? ", incl. previews" : ""}</small>`),
    grosser && pulseTile(grosser.m, "globe", "Highest grosser", `<strong class="money">${crore(grosser.value)}</strong><small>worldwide</small>`),
    latest && pulseTile(latest, "clapperboard", "Latest release", `${latestFigure(latest)}${parseDay(latest.release) ? `<small>${esc(shortDate(parseDay(latest.release)))}</small>` : ""}`),
    next && pulseTile(next, "calendar-clock", "Next release", `<strong>${countdown(next)}</strong><small>${esc(shortDate(parseDay(next.release)))}</small>`),
  ].filter(Boolean);
  $("pulse").innerHTML = tiles.join("");
  $("pulse").hidden = !tiles.length;
})();

// ---------- New this week ----------
// Every film releasing this week (Monday to Sunday), by release date; on the same day the bigger film
// first (more critics' reviews, then the bigger worldwide gross), then by title.
// Coming soon leaves these out, so no film shows in both.
const weekStart = addDays(startOfToday(), -((startOfToday().getDay() + 6) % 7));   // this week's Monday
const weekEnd = addDays(weekStart, 6);                                              // and Sunday
const reviewCount = m => criticsScore(m)?.count || 0;
const newThisWeek = MOVIES
  .filter(m => { const d = parseDay(m.release); return d && d >= weekStart && d <= weekEnd; })
  .sort((a, b) => releaseTime(a) - releaseTime(b) || reviewCount(b) - reviewCount(a)
    || (filmFacts(b).ww ?? -1) - (filmFacts(a).ww ?? -1) || byTitle(a, b));
const inNewThisWeek = new Set(newThisWeek);

// "Out today", "Out now" (earlier this week) or "Releases Fri 16 Oct"
function weekStatus(m) {
  const n = daysUntil(m);
  if (n === 0) return ["Out today", "is-today"];
  if (n < 0) return ["Out now", "is-out"];
  return [`Releases ${dayLabel(m.release, { weekday: true, year: false })}`, "is-soon"];
}

// The first number: the opening day once reported; until then, when it's due. Upcoming films show none.
function weekFigure(m) {
  const od = openingDay(m);
  if (od !== null) return `<p class="week-figure"><span>Day 1</span> <strong class="money">${crore(od)}</strong>${openingHasPreviews(m) ? " <small>incl. previews</small>" : ""}</p>`;
  if (!isReleased(m)) return "";
  const n = daysUntil(m);
  const note = n === 0 ? "Day 1 figures due tomorrow" : n === -1 ? "Day 1 figures due today" : "Collections pending";
  return `<p class="week-figure week-pending">${note}</p>`;
}

// The critics' average and how many reviews it's from. On a narrow card the count drops to a second
// line after the dot, never in the middle of "5.7/10" or "9 reviews".
function weekRating(m) {
  const cs = criticsScore(m);
  if (!cs) return "";
  return `<p class="week-rating"><i data-lucide="star" class="star-icon"></i><span>Critics <strong>${cs.score.toFixed(1)}</strong>/10 ·</span> <span>${cs.count} ${cs.count === 1 ? "review" : "reviews"}</span></p>`;
}

// The films-grid card: poster, title, "Tamil | UA 16+", the status, then the numbers
function weekCard(m) {
  const [status, tone] = weekStatus(m);
  return `
    <article class="movie-card film-card week-card">
      ${cardPoster(m)}
      <div class="card-info week-info">
        <h3 class="card-title"><a class="card-link" href="${filmURL(m)}">${esc(m.title)}</a></h3>
        ${pipeLine([m.lang && esc(m.lang), m.cert && esc(m.cert)], "card-meta")}
        <p class="week-status ${tone}">${esc(status)}</p>
        ${weekFigure(m)}
        ${weekRating(m)}
      </div>
    </article>`;
}

(function renderNewThisWeek() {
  $("newWeekRange").textContent = `Releases from ${dayLabel(weekStart)} to ${dayLabel(weekEnd)}`;
  const grid = $("newWeekGrid");
  grid.classList.toggle("is-empty", !newThisWeek.length);
  grid.innerHTML = newThisWeek.length
    ? newThisWeek.map(weekCard).join("")
    : `<p class="week-empty">No new releases this week.</p>`;
})();

// ---------- Box office leaderboard ----------
const BOARD_TOP = 10;
// Empty-state wording per metric ("No 2023 film has a reported India net figure yet.")
const BOARD_EMPTY = {
  opening: "a reported opening day figure",
  weekend: "a reported opening weekend figure",
  first7: "a reported first 7 days figure",
  indiaNet: "a reported India net figure",
  worldwide: "a reported worldwide gross figure",
  rating: "a rating",
};
// Language and year filter the films first; the ranking then leaves out films without the figure
const board = { key: "opening", lang: ALL_LANGS, year: "all", previews: true, showAll: false };
try {
  const saved = localStorage.getItem("manaBoard");
  if (RANKINGS[saved]) board.key = saved;
} catch {}
const latestAsOf = MOVIES.map(m => boxOffice(m).asOf).filter(parseDay).sort().pop();

$("boardMetrics").innerHTML = Object.entries(RANKINGS)
  .map(([key, r]) => `<button type="button" class="chip" data-key="${key}" aria-pressed="${key === board.key}">${esc(r.label)}</button>`).join("");
$("boardLangs").innerHTML = langChips(board.lang);
// Year chips list only the years the chosen language has films in
function renderBoardYears() {
  $("boardYears").innerHTML = yearChips(board.lang, board.year, "All time");
}
renderBoardYears();
revealPressed($("boardMetrics"));   // a metric remembered from last visit may sit off to the right

// Small print under a figure: the weekend's day count, and whether previews are in it
function boardDetail(m) {
  const r = RANKINGS[board.key];
  return [
    board.key === "weekend" && `${openingWeekend(m, { previews: board.previews })?.days}-day`,
    r.usesPreviews && board.previews && (board.key === "opening" ? openingHasPreviews(m) : previewsNet(m) > 0) && "incl. previews",
  ].filter(Boolean).join(" · ");
}

// Small poster: the artwork (or photo), else the title's first letter on the film's colours
function boardThumb(m) {
  if (hasArt(m) || posterImage(m)) return posterHTML(m, { compact: true });
  const letter = (String(m.title).match(/[\p{L}\p{N}]/u) || [""])[0];
  return `<div class="poster poster-mono" style="${posterStyle(m)}" aria-hidden="true"><span>${esc(letter)}</span></div>`;
}

function boardRow({ m, value, rank }, tied, max) {
  const detail = boardDetail(m);
  const width = Math.max(1.5, Math.min(100, (value / max) * 100));
  return `
    <li class="board-row${rank === 1 ? " is-top" : ""}${rank <= 3 ? " is-podium" : ""}">
      <span class="board-rank"><span class="sr-only">${tied ? "Joint rank" : "Rank"} </span>${rank}</span>
      ${boardThumb(m)}
      <div class="board-film">
        <a href="${filmURL(m)}" class="board-title">${esc(m.title)}</a>
        <span class="board-sub"><span>${langYear(m)}</span>${verdictHTML(m)}</span>
      </div>
      <div class="board-figure">
        <span class="board-bar" aria-hidden="true"><span style="width:${width.toFixed(1)}%"></span></span>
        <span class="board-value"><strong class="money">${esc(RANKINGS[board.key].format(value))}</strong>${detail ? `<small>${detail}</small>` : ""}</span>
      </div>
    </li>`;
}

function renderBoard() {
  const r = RANKINGS[board.key];
  const pool = MOVIES.filter(m => (board.lang === ALL_LANGS || m.lang === board.lang) && (board.year === "all" || yearOf(m) === board.year));
  const rows = ranking(pool, board.key, { previews: board.previews });
  const period = board.year === "all" ? "all time" : String(board.year);
  const langName = board.lang === ALL_LANGS ? "all languages" : board.lang;
  $("boardPreviewsWrap").hidden = !r.usesPreviews;
  const note = r.usesPreviews && !board.previews ? r.noteNoPreviews : r.note;
  $("boardNote").textContent = [
    note,
    board.key === "rating" ? "" : `Trade estimates${latestAsOf ? `, as of ${dayLabel(latestAsOf)}` : ""}`,
  ].filter(Boolean).join(" · ");
  $("boardStatus").textContent = `${r.label}, ${langName}, ${period}: ${rows.length} ${rows.length === 1 ? "film" : "films"} ranked.`;

  // A chosen language links to its all-time lists: the opening days list when ranking opening days,
  // else the top grossers
  const lists = $("boardLists");
  lists.hidden = board.lang === ALL_LANGS;
  if (board.lang !== ALL_LANGS) {
    lists.href = listsURL(board.lang, board.key === "opening" ? "opening" : "top");
    lists.innerHTML = `See full ${esc(board.lang)} lists <i data-lucide="arrow-right"></i>`;
  }

  const more = $("boardMore");
  if (!rows.length) {
    const who = [board.year === "all" ? "" : board.year, board.lang === ALL_LANGS ? "" : esc(board.lang)].filter(Boolean).join(" ");
    // Weekend and first-7-days figures need day-by-day collections, which older and smaller films don't have
    const dayWiseOnly = board.key === "weekend" || board.key === "first7";
    $("boardList").innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><i data-lucide="bar-chart-3"></i></div>
        No ${who ? who + " " : ""}film has ${esc(BOARD_EMPTY[board.key] || "a reported figure")} yet.${dayWiseOnly ? " This ranking needs day-by-day figures." : ""}
      </div>`;
    more.hidden = true;
    icons();
    return;
  }
  // Ratings are out of 10; money bars are relative to the leader
  const max = board.key === "rating" ? 10 : rows[0].value || 1;
  const perRank = new Map();
  rows.forEach(x => perRank.set(x.rank, (perRank.get(x.rank) || 0) + 1));
  const shown = board.showAll ? rows : rows.slice(0, BOARD_TOP);
  $("boardList").innerHTML = `<ol class="board" role="list">${shown.map(row => boardRow(row, perRank.get(row.rank) > 1, max)).join("")}</ol>`;
  more.hidden = rows.length <= BOARD_TOP;
  more.setAttribute("aria-expanded", board.showAll);
  more.innerHTML = board.showAll
    ? `<i data-lucide="chevron-up"></i> Show top ${BOARD_TOP}`
    : `<i data-lucide="chevron-down"></i> Show all ${rows.length}`;
  icons();
}

$("boardMetrics").addEventListener("click", e => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  press($("boardMetrics"), chip);
  revealPressed($("boardMetrics"));
  board.key = chip.dataset.key;
  try { localStorage.setItem("manaBoard", board.key); } catch {}
  renderBoard();
});
$("boardLangs").addEventListener("click", e => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  press($("boardLangs"), chip);
  revealPressed($("boardLangs"));
  board.lang = chip.dataset.lang;
  // Keep the year only if the language has films that year
  if (board.year !== "all" && !yearsOf(board.lang).includes(board.year)) board.year = "all";
  renderBoardYears();
  revealPressed($("boardYears"));
  renderBoard();
});
$("boardYears").addEventListener("click", e => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  press($("boardYears"), chip);
  revealPressed($("boardYears"));
  board.year = chip.dataset.year === "all" ? "all" : Number(chip.dataset.year);
  renderBoard();
});
$("boardPreviews").addEventListener("change", e => {
  board.previews = e.target.checked;
  renderBoard();
});
$("boardMore").addEventListener("click", () => {
  board.showAll = !board.showAll;
  renderBoard();
});
renderBoard();

// ---------- Films ----------
// 24 cards at a time; "Show more" adds the next 24 without redrawing the ones already there.
// Any change of filter, search or sort starts again from the first 24.
const FILM_PAGE = 24;
const filmFilters = { query: "", lang: ALL_LANGS, year: "all", sort: "latest" };
let filmList = [];   // the films that match, sorted
let filmShown = 0;   // how many of them are on the page

// Values to sort by, highest first. Films without the figure go last (never treated as 0).
const FILM_SORTS = {
  // Newest year first; within a year, films with an exact date by date, then those with only a year
  latest: m => (filmFacts(m).year || 0) * 1e13 + releaseTime(m),
  worldwide: m => filmFacts(m).ww,
  opening: m => filmFacts(m).opening,
  rating: m => filmFacts(m).score,
};

function sortFilms(list, key) {
  if (!FILM_SORTS[key]) return [...list].sort(byTitle);
  const value = new Map(list.map(m => [m, FILM_SORTS[key](m)]));
  return [...list].sort((a, b) => (value.get(b) ?? -Infinity) - (value.get(a) ?? -Infinity) || byTitle(a, b));
}

// District-style card: the poster on top (artwork only; the title is in the text block below),
// then title, "U/A | Telugu | 2024" and the figures. A film without artwork (most list films)
// prints its title on the poster instead, so the poster isn't a blank gradient.
// The title link stretches over the whole card (see .card-link in css/style.css).
function cardPoster(m, top) {
  const art = hasArt(m);
  return `
    <div class="poster${art ? "" : " poster-named"}" ${imgAttr(m)} style="${posterStyle(m)}">
      ${art ? heroArt(m) : posterNameHTML(m)}
      ${top ? `<div class="poster-top">${top}</div>` : ""}
    </div>`;
}

// The worldwide total when it's in, else India net (a running film often has day-wise net only),
// else the opening day (some list films only have that). Sorted by opening day, the opening day
// comes first, so the order on screen matches the figures.
function cardFigure(m) {
  const f = filmFacts(m);
  // Says when paid previews are in the figure, as the pulse tile and leaderboard do
  const opening = () => `<span><strong class="money">${crore(f.opening)}</strong> opening day${openingHasPreviews(m) ? ", incl. previews" : ""}</span>`;
  if (filmFilters.sort === "opening" && f.opening !== null) return opening();
  if (f.ww !== null) return `<span><strong class="money">${crore(f.ww)}</strong> worldwide</span>`;
  if (f.net !== null) return `<span><strong class="money">${crore(f.net)}</strong> India net${boxOffice(m).running ? " so far" : ""}</span>`;
  if (f.opening !== null) return opening();
  return `<span>Collections pending</span>`;
}

function filmCard(m) {
  const score = filmFacts(m).score;
  return `
    <article class="movie-card film-card reveal">
      ${cardPoster(m, verdictHTML(m))}
      <div class="card-info">
        <h3 class="card-title"><a class="card-link" href="${filmURL(m)}">${esc(m.title)}</a></h3>
        ${pipeLine([m.cert && esc(m.cert), m.lang && esc(m.lang), yearOf(m)], "card-meta")}
        <p class="card-figures">
          ${cardFigure(m)}
          ${score !== null ? `<span class="card-score"><i data-lucide="star" class="star-icon"></i><span><strong>${score.toFixed(1)}</strong>/10</span><span class="sr-only"> overall rating</span></span>` : ""}
        </p>
      </div>
    </article>`;
}

// "Showing 24 of 201 films" and the Show more button
function updateFilmFoot() {
  const total = filmList.length;
  $("filmFoot").hidden = !total;
  $("filmCount").textContent = filmShown < total
    ? `Showing ${filmShown} of ${total} films`
    : total === 1 ? "1 film" : `Showing all ${total} films`;
  $("filmMore").hidden = filmShown >= total;
}

function renderFilms() {
  const { query, lang, year } = filmFilters;
  const q = query.toLowerCase();
  const matches = m => (lang === ALL_LANGS || m.lang === lang) && (!q || filmFacts(m).text.includes(q));
  filmList = sortFilms(releasedFilms.filter(m => matches(m) && (year === "all" || filmFacts(m).year === year)), filmFilters.sort);
  filmShown = Math.min(FILM_PAGE, filmList.length);
  // This grid holds released films only, so point to an upcoming film the search would have found
  // (in New this week when it releases this week, else in Coming soon)
  const soon = q ? upcomingFilms.filter(matches).sort((a, b) => inNewThisWeek.has(b) - inNewThisWeek.has(a)) : [];
  const thisWeek = soon.filter(m => inNewThisWeek.has(m)).length;
  const where = !thisWeek ? ["#coming-soon", "Coming soon"]
    : thisWeek === soon.length ? ["#new-this-week", "New this week"] : ["#new-this-week", "New this week and Coming soon"];
  const soonHint = soon.length
    ? ` <a class="empty-link" href="${where[0]}">See ${esc(soon[0].title)}${soon.length > 1 ? ` and ${soon.length - 1} more` : ""} in ${where[1]}.</a>`
    : " Try another search, language or year.";
  const grid = $("filmGrid");
  grid.innerHTML = filmList.length
    ? filmList.slice(0, filmShown).map(filmCard).join("")
    : `<div class="empty-state">
        <div class="empty-icon"><i data-lucide="search-x"></i></div>
        No released ${lang === ALL_LANGS ? "" : `${esc(lang)} `}films match${query ? ` “${esc(query)}”` : ""}${year === "all" ? "" : ` in ${year}`}.${soonHint}
      </div>`;
  $("filmStatus").textContent = `${filmList.length} ${filmList.length === 1 ? "film matches" : "films match"}.`;
  updateFilmFoot();
  observeReveal(grid);
  icons();
}

function showMoreFilms() {
  const from = filmShown;
  filmShown = Math.min(filmShown + FILM_PAGE, filmList.length);
  const grid = $("filmGrid");
  grid.insertAdjacentHTML("beforeend", filmList.slice(from, filmShown).map(filmCard).join(""));
  updateFilmFoot();
  $("filmStatus").textContent = `Showing ${filmShown} of ${filmList.length} films.`;
  observeReveal(grid);
  icons();
  // Carry on from the first new card (the button may have just been hidden)
  grid.children[from]?.querySelector(".card-link")?.focus({ preventScroll: true });
}

// Year chips list only the years the chosen language has films in
function renderFilmYears() {
  $("filmYears").innerHTML = yearChips(filmFilters.lang, filmFilters.year, "All years");
}
$("filmLangs").innerHTML = langChips(filmFilters.lang);
renderFilmYears();

$("filmLangs").addEventListener("click", e => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  press($("filmLangs"), chip);
  revealPressed($("filmLangs"));
  filmFilters.lang = chip.dataset.lang;
  if (filmFilters.year !== "all" && !yearsOf(filmFilters.lang).includes(filmFilters.year)) filmFilters.year = "all";
  renderFilmYears();
  revealPressed($("filmYears"));
  renderFilms();
});
$("filmYears").addEventListener("click", e => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  press($("filmYears"), chip);
  revealPressed($("filmYears"));
  filmFilters.year = chip.dataset.year === "all" ? "all" : Number(chip.dataset.year);
  renderFilms();
});
// Search waits for a pause in typing, so the grid isn't redrawn on every key
let searchTimer;
$("filmSearch").addEventListener("input", e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const query = e.target.value.trim();
    if (query === filmFilters.query) return;
    filmFilters.query = query;
    renderFilms();
  }, 160);
});
$("filmSort").addEventListener("change", e => {
  filmFilters.sort = e.target.value;
  renderFilms();
});
$("filmMore").addEventListener("click", showMoreFilms);
renderFilms();

// ---------- Coming soon ----------
// The film's name is in the button's accessible name, so screen readers can tell the cards apart
const remindLabel = (m, on) => (on
  ? `<i data-lucide="bell-ring"></i> Reminder set<span class="sr-only"> for ${esc(m.title)}</span>`
  : `<i data-lucide="bell"></i> Remind me<span class="sr-only"> about ${esc(m.title)}</span>`);

// "Releasing 16 Oct 2026", or the announced window ("Expected Sankranti 2027"). Returns escaped HTML;
// the date wraps as one piece on narrow cards.
const releasingHTML = m => (parseDay(m.release)
  ? `Releasing <span class="soon-day">${esc(releaseLabel(m))}</span>`
  : esc(m.releaseNote ? `Expected ${m.releaseNote}` : releaseLabel(m)));

// The reminder button is a real button above the card's stretched link, so it works on its own
function soonCard(m) {
  const on = hasReminder(m.id);
  const n = daysUntil(m);
  const pill = `<span class="pill${n !== null && n <= 30 ? " pill-gold" : ""}">${esc(countdown(m) || "Date TBA")}</span>`;
  return `
    <article class="movie-card film-card soon-card reveal">
      ${cardPoster(m, pill)}
      <div class="card-info soon-info">
        <h3 class="card-title"><a class="card-link" href="${filmURL(m)}">${esc(m.title)}</a></h3>
        ${pipeLine([m.cert && esc(m.cert), m.lang && esc(m.lang), m.genre && esc(m.genre)], "card-meta")}
        <p class="soon-date">${releasingHTML(m)}</p>
        <button type="button" class="btn btn-ghost btn-sm remind-btn" data-remind="${Number(m.id)}" aria-pressed="${on}">${remindLabel(m, on)}</button>
      </div>
    </article>`;
}

// Soonest first; films without an exact date go last. Films releasing this week are in New this week instead.
const soonList = upcomingFilms.filter(m => !inNewThisWeek.has(m)).sort((a, b) =>
  (daysUntil(a) ?? Infinity) - (daysUntil(b) ?? Infinity) || (Number(a.year) || 9999) - (Number(b.year) || 9999) || byTitle(a, b));
const soonGrid = $("soonGrid");
if (!soonList.length) {
  $("coming-soon").hidden = true;
  document.querySelectorAll('a[href="#coming-soon"]').forEach(a => { a.closest("li").hidden = true; });
}
soonGrid.innerHTML = soonList.map(soonCard).join("");
observeReveal(soonGrid);

soonGrid.addEventListener("click", e => {
  const btn = e.target.closest("[data-remind]");
  if (!btn) return;
  const m = getMovie(btn.dataset.remind);
  if (!m) return;
  const on = toggleReminder(m.id);
  if (on === null) return toast("Couldn't save the reminder. Your browser storage may be full or blocked.");
  btn.setAttribute("aria-pressed", on);
  btn.innerHTML = remindLabel(m, on);
  icons();
  toast(on ? `Reminder set for ${m.title}. We'll flag it here once it's out.` : `Reminder removed for ${m.title}.`);
});

// Films the visitor asked about that have now released: announce them once
const due = takeDueReminders(MOVIES);
if (due.length) toast(due.length === 1 ? `${due[0].title} is out now. See its first numbers.` : `${due.length} films you follow are out now.`);

// ---------- How we track ----------
(function renderTrackStats() {
  const stats = [
    [trackedFilms.length, "Films tracked"],
    [languagesIn(MOVIES).length, "Languages"],
    [MOVIES.reduce((n, m) => n + dayRows(m).length, 0), "Days of collections"],
    [MOVIES.reduce((n, m) => n + (criticsScore(m)?.count || 0), 0), "Critic reviews counted"],
  ];
  $("trackStats").innerHTML = stats
    .map(([n, label]) => `<div><dt>${label}</dt><dd>${countText(n)}</dd></div>`).join("");
})();

// ---------- Footer ----------
if (latestAsOf) $("asOf").textContent = `Figures as of ${dayLabel(latestAsOf)}`;

// ---------- Active nav link while scrolling ----------
const spySections = [...document.querySelectorAll("main section[id]")];
const spyLinks = document.querySelectorAll('.nav-links a[href^="#"]:not(.nav-cta)');
function spy() {
  let current = "";
  spySections.forEach(s => { if (!s.hidden && scrollY >= s.offsetTop - 140) current = s.id; });
  spyLinks.forEach(a => a.classList.toggle("active", a.getAttribute("href") === "#" + current));
}
addEventListener("scroll", spy, { passive: true });
spy();

// ---------- Feedback form (saved in this browser for the admin inbox) ----------
const TOPIC_HINTS = {
  "Report a wrong figure": "Which figure looks wrong, and where did you see a different one?",
  "Suggest a film to track": "Which film should we add?",
  "Ratings or reviews": "Tell us about a rating or review.",
};
const fTopic = $("cTopic"), fFilm = $("cFilm"), fMsg = $("cMsg");
fFilm.innerHTML += [...MOVIES].sort(byTitle)
  .map(m => `<option value="${Number(m.id)}">${esc(m.title)}${m.lang || yearOf(m) ? ` (${[yearOf(m), m.lang && esc(m.lang)].filter(Boolean).join(", ")})` : ""}</option>`).join("");

function setTopic(topic) {
  fTopic.value = topic;
  fMsg.placeholder = TOPIC_HINTS[fTopic.value] || "What's on your mind?";
}
fTopic.addEventListener("change", () => setTopic(fTopic.value));
// Footer "Report a wrong figure" link
document.addEventListener("click", e => {
  const link = e.target.closest("a[data-topic]");
  if (link) setTopic(link.dataset.topic);
});

// Ties the error message to an empty required field for screen readers; cleared as the visitor types
function markInvalid(id, invalid) {
  const field = $(id);
  if (invalid) {
    field.setAttribute("aria-invalid", "true");
    field.setAttribute("aria-describedby", "formMsg");
  } else {
    field.removeAttribute("aria-invalid");
    field.removeAttribute("aria-describedby");
  }
}
["cName", "cMsg"].forEach(id => $(id).addEventListener("input", () => { if ($(id).value.trim()) markInvalid(id, false); }));

$("contactForm").addEventListener("submit", e => {
  e.preventDefault();
  const val = id => $(id).value.trim();
  const status = $("formMsg");
  const blanks = ["cName", "cMsg"].filter(id => !val(id));
  ["cName", "cMsg"].forEach(id => markInvalid(id, blanks.includes(id)));
  if (blanks.length) {
    status.classList.add("error");
    status.textContent = "Please fill in your name and message.";
    $(blanks[0]).focus();
    return;
  }
  const movieId = Number(fFilm.value) || null;
  const message = { id: Date.now(), name: val("cName"), email: val("cEmail"), topic: val("cTopic") };
  if (movieId) message.movieId = movieId;
  Object.assign(message, { message: val("cMsg"), at: new Date().toISOString(), read: false });
  const saved = saveStore("manaMessages", [message, ...loadStore("manaMessages", [])]);
  status.classList.toggle("error", !saved);
  status.textContent = saved
    ? "Thanks! Your message has been saved."
    : "Couldn't save your message. Your browser storage may be full or blocked.";
  if (saved) {
    e.target.reset();
    setTopic("");
  }
});

// The sections above are drawn by this script, so the browser's own jump to a #fragment can land
// short. Jump now and again once images and fonts have loaded, without the smooth scroll.
function jumpTo(section, then) {
  const jump = () => {
    const root = document.documentElement;
    root.style.scrollBehavior = "auto";
    section.scrollIntoView({ block: "start" });
    root.style.scrollBehavior = "";
    then?.();
  };
  jump();
  if (document.readyState !== "complete") addEventListener("load", jump, { once: true });
}

// index.html?report=<id>#contact: open the form ready to report a figure for that film
const reportId = new URLSearchParams(location.search).get("report");
if (reportId !== null) {
  setTopic("Report a wrong figure");
  if (getMovie(reportId)) fFilm.value = Number(reportId);
  jumpTo($("contact"), () => fMsg.focus({ preventScroll: true }));
}

// ---------- Photo credits ----------
// Each star photo with its author, licence and source, as the licences ask; the poster photos are
// listed in index.html. The list opens when a link (the footer's, or another page's) points to #credits.
const httpsOnly = url => (/^https:\/\//i.test(String(url || "")) ? String(url) : "");
// "File:Mammootty,_2022.jpg" in a Commons address -> "Mammootty, 2022.jpg"
function commonsFile(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/wiki/").pop()).replace(/^File:/, "").replace(/_/g, " ");
  } catch {
    return "File page";
  }
}
const outLink = (url, text) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(text)}</a>` : esc(text));
$("starCredits").innerHTML = coverStars.map(s => `
  <li><strong>${esc(s.name)}</strong>: ${esc(s.author)}, ${outLink(httpsOnly(s.licenceUrl), s.licence)}, via Wikimedia Commons (${outLink(httpsOnly(s.source), commonsFile(s.source))}) — cropped</li>`).join("");
$("starCredits").hidden = !coverStars.length;
$("starCreditsHead").hidden = !coverStars.length;
$("creditsSummary").textContent = `Photo credits (${document.querySelectorAll("#credits .credit-list > li").length} photos)`;

const creditsBox = $("creditsBox");
const openCredits = () => { if (location.hash === "#credits") creditsBox.open = true; };
addEventListener("hashchange", openCredits);
// Following the link again when the address already ends in #credits doesn't change the hash
document.addEventListener("click", e => { if (e.target.closest('a[href="#credits"]')) creditsBox.open = true; });
if (location.hash === "#credits") {
  openCredits();
  jumpTo($("credits"));
}

icons();

// index.html#box-office, #films and the like (the other pages link to these): the browser jumps before
// this script has drawn the cover, New this week and the rest above, so it lands short. Jump again.
const hashSection = reportId === null && location.hash.length > 1 && location.hash !== "#credits"
  ? document.getElementById(location.hash.slice(1)) : null;
if (hashSection && !hashSection.hidden) jumpTo(hashSection);
