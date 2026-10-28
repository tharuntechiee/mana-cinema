// Shared UI behaviour for every page: themes, search, icons, navbar, mobile menu, toasts, scroll reveal
document.documentElement.classList.add("js");

// ---------- Icons (Lucide) ----------
// Write <i data-lucide="film"></i> in HTML, then call icons() after rendering
function icons() {
  if (window.lucide) lucide.createIcons();
  if (typeof markPhotos === "function") markPhotos();
}

// ---------- Themes ----------
// Each theme sets colours plus its own atmosphere (see the theme blocks in css/style.css)
const THEMES = [
  { id: "district", name: "District Black", tag: "Clean black, white type", bg: "#0F0F13", surface: "#1E1E20", accent: "#FFFFFF", gold: "#6CB4FF" },
  { id: "neon",     name: "Neon Nights",    tag: "Synthwave glow",      bg: "#0c0716", surface: "#211536", accent: "#d63bff", gold: "#29e0ff" },
  { id: "velvet",   name: "Royal Velvet",   tag: "Curtains & spotlight", bg: "#12030a", surface: "#2a0d19", accent: "#d4a73a", gold: "#f3d27a" },
  { id: "fire",     name: "Tollywood Fire", tag: "Mass masala embers",  bg: "#110604", surface: "#29120b", accent: "#ff6a00", gold: "#ffd23f" },
  { id: "aurora",   name: "Aurora",         tag: "Northern lights",     bg: "#04090f", surface: "#111e2a", accent: "#00d9a3", gold: "#b69cff" },
  { id: "sunset",   name: "Sunset Drive",   tag: "Golden-hour sky",     bg: "#160a1c", surface: "#2d1638", accent: "#ff5e62", gold: "#ffb347" },
  { id: "noir",     name: "Film Noir",      tag: "Black & white classic", bg: "#0a0a0a", surface: "#1d1d1d", accent: "#f4f4f4", gold: "#e50914" },
  { id: "midnight", name: "Midnight Red",   tag: "Classic cinema",      bg: "#09090d", surface: "#1b1b25", accent: "#e5172b", gold: "#f5b301" },
  { id: "gold",     name: "Gold Premiere",  tag: "Red-carpet luxury",   bg: "#0b0a08", surface: "#1f1c16", accent: "#e0a526", gold: "#ffd77a" },
  { id: "ocean",    name: "Ocean Blue",     tag: "Cool IMAX blue",      bg: "#060b14", surface: "#142036", accent: "#2f8cff", gold: "#4fd1c5" },
  { id: "emerald",  name: "Emerald",        tag: "Festive green",       bg: "#06100c", surface: "#14261d", accent: "#10b981", gold: "#fbbf24" },
];

// District Black is the default. The head script in each page applies the saved choice ("manaLook")
// before the page paints; only a theme the visitor actually picks is saved.
const DEFAULT_THEME = "district";
function currentTheme() {
  return DEFAULT_THEME;
}

function setTheme(id, animate = true, save = true) {
  const root = document.documentElement;
  if (animate) {
    root.classList.add("theme-anim");
    setTimeout(() => root.classList.remove("theme-anim"), 450);
  }
  root.dataset.theme = id;
  if (save) try { localStorage.setItem("manaLook", id); } catch {}
  const t = THEMES.find(x => x.id === id);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t.bg);
  document.querySelectorAll(".theme-tile").forEach(o => o.setAttribute("aria-checked", o.dataset.themeId === id));
}

// One look for everyone: District Black. (The theme picker was removed on 2026-10-27; older visits may
// have saved another theme in "manaLook", which is now ignored.)
setTheme(DEFAULT_THEME, false, false);

// ---------- Search ----------
// A magnifier button at the end of the navbar opens a search box over the page. It finds films by title,
// director, starring names, genre, language and year right in the browser, and, on the server, by anyone
// in a film's cast and crew (api/search). "/" or Ctrl+K opens it from anywhere. Public pages only.
(function buildSearch() {
  const nav = document.querySelector(".nav-inner");
  if (!nav || nav.classList.contains("admin-top")) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "icon-btn";
  btn.id = "searchBtn";
  btn.setAttribute("aria-label", "Search films");
  btn.setAttribute("aria-haspopup", "dialog");
  btn.title = "Search ( / )";
  btn.innerHTML = `<i data-lucide="search"></i>`;
  nav.appendChild(btn);   // the last item in the navbar, after the links

  const dialog = document.createElement("dialog");
  dialog.className = "search-dialog";
  dialog.id = "searchDialog";
  dialog.setAttribute("aria-label", "Search films");
  dialog.innerHTML = `
    <form class="search-box" role="search" id="searchForm">
      <i data-lucide="search" aria-hidden="true"></i>
      <input type="search" id="searchInput" placeholder="Search films, actors, directors, languages" autocomplete="off" spellcheck="false" enterkeyhint="search" aria-label="Search films, actors, directors or languages" maxlength="60">
      <button type="button" class="search-close" id="searchClose" aria-label="Close search"><i data-lucide="x"></i></button>
    </form>
    <div class="search-body" id="searchBody"></div>
    <p class="sr-only" id="searchStatus" role="status" aria-live="polite"></p>`;
  document.body.appendChild(dialog);

  const input = dialog.querySelector("#searchInput");
  const body = dialog.querySelector("#searchBody");
  const status = dialog.querySelector("#searchStatus");
  const MAX_ROWS = 20;
  const state = { seq: 0, query: "", remote: null, timer: 0 };

  // Lower case, no accents or punctuation: "Dhurandhar: The Revenge" -> "dhurandhar the revenge"
  const fold = s => String(s ?? "").toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
  let index = null;
  const build = () => MOVIES.map(m => ({
    m,
    title: fold(m.title),
    people: fold([m.director, m.cast].filter(Boolean).join(" ")),
    other: fold([m.lang, ...(m.languages || []), m.genre, m.year, String(m.release || "").slice(0, 4)].filter(Boolean).join(" ")),
  }));

  // How well a film matches: every word typed must be found somewhere; title matches count most
  function score(e, tokens, q) {
    let total = 0;
    for (const t of tokens) {
      let best;
      if (e.title.split(" ").some(w => w.startsWith(t))) best = e.title.startsWith(t) ? 100 : 70;
      else if (e.title.includes(t)) best = 45;
      else if (e.people.split(" ").some(w => w.startsWith(t))) best = 30;
      else if (e.people.includes(t)) best = 20;
      else if (e.other.split(" ").some(w => w.startsWith(t))) best = 15;
      else return 0;
      total += best;
    }
    if (e.title === q) total += 200;
    else if (e.title.startsWith(q)) total += 60;
    return total;
  }
  // Why a film showed up when its title doesn't say: the director, or the starring name that matched
  function why(m, tokens) {
    if (tokens.every(t => fold(m.title).includes(t))) return "";
    const has = text => tokens.every(t => fold(text).includes(t));
    if (m.director && has(m.director)) return `Director: ${m.director}`;
    const star = String(m.cast || "").split(",").map(s => s.trim()).find(has);
    return star ? `Starring: ${star}` : "";
  }
  const popularity = m => (typeof worldwideGross === "function" ? worldwideGross(m) : null) ?? (typeof indiaNet === "function" ? indiaNet(m) : null) ?? 0;
  const yearOf = m => Number(m.year) || Number(String(m.release || "").slice(0, 4)) || 0;

  function localHits(q) {
    const tokens = q.split(" ").filter(Boolean);
    index = index || build();
    return index
      .map(e => ({ m: e.m, s: score(e, tokens, q) }))
      .filter(h => h.s > 0)
      .sort((a, b) => b.s - a.s || popularity(b.m) - popularity(a.m) || yearOf(b.m) - yearOf(a.m))
      .map(h => ({ m: h.m, why: why(h.m, tokens) }));
  }

  function metaLine(m) {
    const parts = [m.lang, yearOf(m) || ""].filter(Boolean);
    const imdb = typeof imdbScore === "function" ? imdbScore(m) : null;
    if (imdb) parts.push(`IMDb ${imdb.score.toFixed(1)}`);
    else if (typeof isReleased === "function" && !isReleased(m)) parts.push("Coming soon");
    return parts.join(" · ");
  }
  const hitHTML = ({ m, why: reason }) => `
    <li><a class="search-hit" href="film.html?id=${Number(m.id)}">
      <span class="search-poster">${posterHTML(m, { compact: true, size: "w185" })}</span>
      <span class="search-info">
        <strong>${esc(m.title)}</strong>
        <small>${esc(metaLine(m))}</small>
        ${reason ? `<small class="search-why">${esc(reason)}</small>` : ""}
      </span>
    </a></li>`;

  // People: the home page cover stars at once (where js/cover-stars.js is loaded), then the server's: those
  // credited here, then anyone TMDB finds. Each opens their page (person.html).
  const PERSON_PHOTO = /^(images\/heroes\/[\w-]+\.jpg|img\/w185\/[A-Za-z0-9]{8,64}\.(jpg|png))$/;
  function peopleHits(q, tokens) {
    const stars = typeof COVER_STARS !== "undefined" && Array.isArray(COVER_STARS) ? COVER_STARS : [];
    const out = stars.filter(st => Number.isInteger(st.tmdb) && tokens.every(t => fold(st.name).split(" ").some(w => w.startsWith(t))))
      .map(st => ({ tmdbId: st.tmdb, name: st.name, photo: st.img, line: `${st.lang} star` }));
    const seen = new Set(out.map(p => p.tmdbId));
    for (const p of (state.remote && state.remote.q === q ? state.remote.persons : [])) {
      if (!Number.isInteger(p.tmdbId) || seen.has(p.tmdbId)) continue;
      seen.add(p.tmdbId);
      const role = p.knownFor === "Directing" ? "Director" : p.knownFor === "Acting" ? "Actor" : p.knownFor === "Writing" ? "Writer" : p.knownFor === "Sound" ? "Music" : p.knownFor || "";
      const line = p.filmsHere ? `${p.filmsHere} ${p.filmsHere === 1 ? "film" : "films"} on MANA CINEMA` : (p.films || []).length ? `Known for ${p.films.join(", ")}` : "";
      out.push({ tmdbId: p.tmdbId, name: p.name, photo: p.photo, line: [role, line].filter(Boolean).join(" · ") });
    }
    return out.slice(0, 6);
  }
  const personHitHTML = p => `
    <li><a class="search-hit" href="person.html?id=${Number(p.tmdbId)}">
      <span class="search-face" aria-hidden="true">${esc(String(p.name).trim().slice(0, 1))}${PERSON_PHOTO.test(p.photo || "") ? `<img src="${p.photo}" alt="" loading="lazy" decoding="async" width="40" height="40" onerror="this.remove()">` : ""}</span>
      <span class="search-info">
        <strong>${esc(p.name)}</strong>
        ${p.line ? `<small>${esc(p.line)}</small>` : ""}
      </span>
    </a></li>`;

  function render() {
    const q = state.query;
    if (!q) {
      // Nothing typed yet: the biggest films, and what can be searched
      index = index || build();
      const top = MOVIES.filter(m => typeof isReleased !== "function" || isReleased(m))
        .sort((a, b) => popularity(b) - popularity(a)).slice(0, 6).map(m => ({ m, why: "" }));
      body.innerHTML = `<p class="search-hint">Search by film title, actor, director, language or year. Actors and directors open their own page.</p>
        ${top.length ? `<h2 class="search-head">Biggest films</h2><ul class="search-list">${top.map(hitHTML).join("")}</ul>` : ""}`;
      status.textContent = "";
      icons();
      return;
    }
    if (q.length < 2) {   // one letter would match half the catalogue
      body.innerHTML = `<p class="search-hint">Keep typing: at least two letters.</p>`;
      status.textContent = "";
      return;
    }
    const tokens = q.split(" ").filter(Boolean);
    const local = localHits(q);
    const seen = new Map(local.map(h => [h.m.id, h]));
    // The server adds films credited to a matching person; for a film already found it adds the reason
    const extra = [];
    for (const r of (state.remote && state.remote.q === q ? state.remote.movies : [])) {
      const known = seen.get(r.id);
      if (known) { if (!known.why) known.why = r.why; continue; }
      const m = typeof getMovie === "function" ? getMovie(r.id) : null;
      if (m) extra.push({ m, why: r.why });
    }
    const hits = [...local, ...extra].slice(0, MAX_ROWS);
    const people = peopleHits(q, tokens);
    const films = hits.length ? `<ul class="search-list">${hits.map(hitHTML).join("")}</ul>` : "";
    body.innerHTML = people.length
      ? `<h2 class="search-head">People</h2><ul class="search-list">${people.map(personHitHTML).join("")}</ul>${films ? `<h2 class="search-head">Films</h2>${films}` : ""}`
      : films || `<p class="search-hint">No films or people match "${esc(input.value.trim())}". Try a shorter name, or search by an actor, director or language.</p>`;
    const total = hits.length + people.length;
    status.textContent = total ? `${total} ${total === 1 ? "result" : "results"}` : "No results";
    icons();
    body.scrollTop = 0;
  }

  // The server's cast-and-crew search runs a moment after typing stops; the browser's own results show at once
  function ask(q) {
    clearTimeout(state.timer);
    state.remote = null;
    if (!ONLINE || q.length < 2) return;
    const seq = ++state.seq;
    state.timer = setTimeout(async () => {
      try {
        const data = await api(`search?q=${encodeURIComponent(q)}`);
        if (seq !== state.seq || state.query !== q) return;
        state.remote = { q, movies: data.movies || [], persons: data.persons || [] };
        render();
      } catch {}   // the results already shown stay
    }, 220);
  }

  input.addEventListener("input", () => {
    state.query = fold(input.value);
    render();
    ask(state.query);
  });

  const open = () => {
    if (dialog.open) return;
    if (typeof setMenu === "function" && navLinks?.classList.contains("open")) setMenu(false);
    dialog.showModal();
    document.documentElement.classList.add("search-open");
    state.query = fold(input.value);
    render();
    input.focus();
    input.select();
  };
  btn.addEventListener("click", open);
  dialog.addEventListener("close", () => document.documentElement.classList.remove("search-open"));
  dialog.querySelector("#searchClose").addEventListener("click", () => dialog.close());
  // A click on the dimmed page around the box closes it; a click on a result goes to the film
  dialog.addEventListener("click", e => {
    if (e.target === dialog) dialog.close();
    else if (e.target.closest(".search-hit")) dialog.close();
  });
  dialog.querySelector("#searchForm").addEventListener("submit", e => {
    e.preventDefault();
    body.querySelector(".search-hit")?.click();   // Enter opens the top result
  });
  // Arrow keys move between the results; going up from the first goes back to the box
  dialog.addEventListener("keydown", e => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const hits = [...body.querySelectorAll(".search-hit")];
    if (!hits.length) return;
    const i = hits.indexOf(document.activeElement);
    e.preventDefault();
    if (e.key === "ArrowDown") (hits[i + 1] || hits[hits.length - 1]).focus();
    else if (i <= 0) input.focus();
    else hits[i - 1].focus();
  });
  // "/" or Ctrl+K from anywhere on the page
  document.addEventListener("keydown", e => {
    const typing = e.target.closest && e.target.closest("input, textarea, select, [contenteditable='true']");
    const slash = e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !typing;
    const ctrlK = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k";
    if (!slash && !ctrlK) return;
    e.preventDefault();
    open();
  });
})();

// ---------- Navbar ----------
const navbar = document.querySelector(".navbar");
const onScroll = () => navbar && navbar.classList.toggle("scrolled", scrollY > 10);
addEventListener("scroll", onScroll, { passive: true });
onScroll();

// Mobile menu
const menuBtn = document.getElementById("menuBtn");
const navLinks = document.getElementById("navLinks");
function setMenu(open) {
  navLinks.classList.toggle("open", open);
  menuBtn.setAttribute("aria-expanded", open);
  menuBtn.innerHTML = `<i data-lucide="${open ? "x" : "menu"}"></i>`;
  icons();
}
if (menuBtn && navLinks) {
  menuBtn.addEventListener("click", () => setMenu(!navLinks.classList.contains("open")));
  navLinks.addEventListener("click", e => { if (e.target.closest("a")) setMenu(false); });
  // Close on Escape or a click outside. composedPath(), because setMenu swaps the button's icon
  // and the clicked <svg> part is already detached by the time the click reaches the document.
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape" || !navLinks.classList.contains("open")) return;
    const inside = navLinks.contains(document.activeElement) || document.activeElement === menuBtn;
    setMenu(false);
    if (inside) menuBtn.focus();
  });
  document.addEventListener("click", e => {
    if (!navLinks.classList.contains("open")) return;
    const path = e.composedPath();
    if (!path.includes(menuBtn) && !path.includes(navLinks)) setMenu(false);
  });
}

// ---------- Toast ----------
let toastTimer;
function toast(message) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

// ---------- Scroll reveal ----------
function observeReveal(root = document) {
  const items = root.querySelectorAll(".reveal:not(.in)");
  if (!("IntersectionObserver" in window)) return items.forEach(i => i.classList.add("in"));
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  items.forEach(i => io.observe(i));
}
observeReveal();

// ---------- Movie photos ----------
// When a poster's photo file exists, mark it so the drawn title is hidden
// (a real poster already shows the title).
const photoCache = {};
function markPhotos(root = document) {
  root.querySelectorAll(".poster[data-img]:not(.photo-checked)").forEach(el => {
    el.classList.add("photo-checked");
    const src = el.dataset.img;
    photoCache[src] ??= new Promise(res => {
      const img = new Image();
      img.onload = () => res(true);
      img.onerror = () => res(false);
      img.src = src;
    });
    photoCache[src].then(ok => el.classList.toggle("has-photo", ok));
  });
}

// ---------- Shared helpers ----------
// size: which TMDB poster size to use ("w185" for small thumbs, "w342" for cards, "w500" for big cards)
function posterHTML(m, { compact = false, size } = {}) {
  if (compact) return `<div class="poster" ${imgAttr(m, size)} style="${posterStyle(m, size)}" aria-hidden="true">${heroArt(m)}</div>`;
  return `
    <div class="poster" ${imgAttr(m, size)} style="${posterStyle(m, size)}">
      ${heroArt(m)}
      <div class="poster-title">${esc(m.title)}</div>
      <div class="poster-lang">${esc(m.lang)}</div>
    </div>`;
}

// "Director X  Starring Y", skipping whichever is empty
function creditsHTML(m) {
  const parts = [m.director && `<span>Director</span> ${esc(m.director)}`, m.cast && `<span>Starring</span> ${esc(m.cast)}`].filter(Boolean);
  return parts.length ? `<p class="credits">${parts.join(" ")}</p>` : "";
}

// "Thu 25 Sep" by default. Plain dates ("2025-09-25") are read as local dates, never UTC,
// so visitors west of UTC don't see the previous day. Same style as dayLabel() in boxoffice.js.
function formatDate(value, { weekday = true, year = false } = {}) {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  const d = iso ? new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])) : new Date(value);
  if (isNaN(d)) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `${weekday ? days[d.getDay()] + " " : ""}${d.getDate()} ${months[d.getMonth()]}${year ? " " + d.getFullYear() : ""}`;
}

icons();
