// Shared UI behaviour for every page: themes, icons, navbar, mobile menu, toasts, scroll reveal
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
  const t = document.documentElement.dataset.theme;
  return THEMES.some(x => x.id === t) ? t : DEFAULT_THEME;
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

// Build the theme picker in the navbar
(function buildThemePicker() {
  const nav = document.querySelector(".nav-inner");
  if (!nav) return;
  let seen = false;
  try { seen = localStorage.getItem("manaThemeSeen") === "1"; } catch {}

  const wrap = document.createElement("div");
  wrap.className = "theme-wrap";
  wrap.innerHTML = `
    <button class="icon-btn${seen ? "" : " pulse"}" id="themeBtn" aria-label="Change theme" aria-controls="themeMenu" aria-expanded="false" title="Change theme">
      <i data-lucide="palette"></i>
    </button>
    <div class="theme-menu" id="themeMenu">
      <div class="theme-menu-head">
        <p>Pick your vibe</p>
        <button class="btn btn-ghost btn-sm" id="themeShuffle"><i data-lucide="shuffle"></i> Surprise me</button>
      </div>
      <div class="theme-grid" role="radiogroup" aria-label="Themes">
        ${THEMES.map(t => `
          <button class="theme-tile" role="radio" data-theme-id="${t.id}" aria-checked="${t.id === currentTheme()}"
                  style="--t-bg:${t.bg};--t-surface:${t.surface};--t-accent:${t.accent};--t-gold:${t.gold}">
            <span class="tile-preview" aria-hidden="true"><i class="tile-bar"></i><i class="tile-card"></i><i class="tile-dot"></i></span>
            <span class="tile-name">${t.name}</span>
            <small>${t.tag}</small>
            <i data-lucide="check" class="tick"></i>
          </button>`).join("")}
      </div>
    </div>`;
  nav.appendChild(wrap);

  const btn = wrap.querySelector("#themeBtn");
  const menu = wrap.querySelector("#themeMenu");
  const close = () => { menu.classList.remove("open"); btn.setAttribute("aria-expanded", false); };
  const pick = id => {
    setTheme(id);
    toast(`Theme: ${THEMES.find(t => t.id === id).name}`);
  };

  btn.addEventListener("click", e => {
    e.stopPropagation();
    const open = menu.classList.toggle("open");
    btn.setAttribute("aria-expanded", open);
    if (open && navLinks?.classList.contains("open")) setMenu(false);   // never stack over the mobile menu
    btn.classList.remove("pulse");
    try { localStorage.setItem("manaThemeSeen", "1"); } catch {}
  });
  menu.addEventListener("click", e => {
    const tile = e.target.closest(".theme-tile");
    if (tile) { pick(tile.dataset.themeId); return; }
    if (e.target.closest("#themeShuffle")) {
      const others = THEMES.filter(t => t.id !== currentTheme());
      pick(others[Math.floor(Math.random() * others.length)].id);
    }
  });
  // Arrow keys move between the theme tiles (Space or Enter picks one)
  const steps = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
  menu.addEventListener("keydown", e => {
    const tiles = [...menu.querySelectorAll(".theme-tile")];
    const i = tiles.indexOf(document.activeElement);
    if (i < 0 || !steps[e.key]) return;
    e.preventDefault();
    tiles[(i + steps[e.key] + tiles.length) % tiles.length].focus();
  });
  // Close on an outside click, on Escape (focus goes back to the palette button) or when focus leaves
  document.addEventListener("click", e => { if (!wrap.contains(e.target)) close(); });
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape" || !menu.classList.contains("open")) return;
    const inside = wrap.contains(document.activeElement);
    close();
    if (inside) btn.focus();
  });
  // relatedTarget is null when a tile is clicked in Safari (buttons don't take focus), so that never closes it
  wrap.addEventListener("focusout", e => { if (e.relatedTarget && !wrap.contains(e.relatedTarget)) close(); });
})();
setTheme(currentTheme(), false, false);

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
function posterHTML(m, { compact = false } = {}) {
  if (compact) return `<div class="poster" ${imgAttr(m)} style="${posterStyle(m)}" aria-hidden="true">${heroArt(m)}</div>`;
  return `
    <div class="poster" ${imgAttr(m)} style="${posterStyle(m)}">
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
