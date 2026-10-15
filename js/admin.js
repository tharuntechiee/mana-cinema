// MANA CINEMA admin portal: films, day-wise collections, ratings, feedback and backups.
// Front-end demo: everything is stored in this browser's localStorage, and the
// password check below is NOT real security (anyone can read this file).
// Shared helpers (esc, loadStore, saveStore, posterHTML, crore, dayRows, verdict...) come from
// data.js, ui.js and boxoffice.js, which load first. Don't redeclare their names here.

const ADMIN_PASSWORD = "MANA-admin-2026"; // demo password, change it here

const $ = id => document.getElementById(id);
const MOVIES_KEY = "manaMovies";
const MESSAGES_KEY = "manaMessages";
const SAVE_FAILED = "Couldn't save. Browser storage may be full or blocked.";

// Fresh copies on every read: data.js reads MOVIES once per page load, and DEFAULT_MOVIES must never be edited in place
const db = {
  movies: () => structuredClone(loadStore(MOVIES_KEY, DEFAULT_MOVIES)),
  peek: () => loadStore(MOVIES_KEY, DEFAULT_MOVIES),   // read-only (no copy): checks that run on every keystroke
  reviews: () => allReviews(),
  messages: () => loadStore(MESSAGES_KEY, []),
};

// ---------- Small helpers ----------
const todayISO = () => isoDay(startOfToday());
const isLink = url => /^https?:\/\/\S+$/i.test(String(url || "").trim());
const plural = (n, word, many = word + "s") => `${n} ${n === 1 ? word : many}`;
const findFilm = (movies, id) => movies.find(m => m.id === Number(id));
const blank = v => v === null || v === undefined || v === "";

// "" -> null, "12.5" -> 12.5, anything else -> NaN (so it can be reported, not silently dropped)
function toNum(v) {
  if (blank(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}
// A number input's value: null when empty, NaN when the browser rejected what was typed
function readNum(el) {
  if (el.value === "") return el.validity.badInput ? NaN : null;
  return toNum(el.value);
}
// Dates come from dayLabel() in boxoffice.js ("25 Sep 2025"), not the en-IN locale's month names.
// Review and message timestamps: "25 Sep 2025, 11:05 pm"
const clockTime = d => d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
function fmtTime(at) {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? "" : `${dayLabel(d)}, ${clockTime(d)}`;
}
// The same in a table cell: the date, with the time under it in small type
function timeCellHTML(at) {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? `<span class="muted">–</span>` : `${dayLabel(d)}<small>${clockTime(d)}</small>`;
}
function countdown(n) {
  return n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`;
}
// [4, 5, 6, 9] -> "4–6, 9"; long lists are cut short ("... and 3 more" counts days, not ranges)
function rangeText(nums, max = 3) {
  const groups = [];
  nums.forEach(n => {
    const g = groups[groups.length - 1];
    if (g && n === g[1] + 1) g[1] = n;
    else groups.push([n, n]);
  });
  const text = groups.slice(0, max).map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(", ");
  const rest = groups.slice(max).reduce((s, [a, b]) => s + b - a + 1, 0);
  return rest ? `${text} and ${rest} more` : text;
}
function dayName(day) {
  return day === 0 ? "Previews" : `Day ${day}`;
}
function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}
function storedFilm(key) {
  try { return Number(sessionStorage.getItem(key)) || null; } catch { return null; }
}
function rememberFilm(key, id) {
  try { sessionStorage.setItem(key, String(id)); } catch {}
}
// Re-render can replace the focused button; put focus back on its replacement
function refocus(selector, fallback) {
  const el = document.querySelector(selector) || (fallback && document.querySelector(fallback));
  if (el) el.focus();
}
function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function toCsv(rows) {
  return rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
}

// Released films first (newest first, undated ones by year), then upcoming (soonest first, undated last)
function sortFilms(movies) {
  const time = m => parseDay(m.release)?.getTime() ?? (m.year ? new Date(Number(m.year), 0, 1).getTime() : undefined);
  const released = movies.filter(isReleased).sort((a, b) => (time(b) ?? 0) - (time(a) ?? 0) || a.title.localeCompare(b.title));
  const upcoming = movies.filter(m => !isReleased(m)).sort((a, b) => (parseDay(a.release)?.getTime() ?? 9e15) - (parseDay(b.release)?.getTime() ?? 9e15));
  return { released, upcoming, all: [...released, ...upcoming] };
}

// When a released film came out: "5 Dec 2024", or just the year for older list films without an exact date
function releasedWhen(m) {
  return parseDay(m.release) ? releaseLabel(m) : m.year ? String(m.year) : "";
}
// Released films: their date (or year); upcoming: the date or the release note
function whenLabel(m) {
  return isReleased(m) ? releasedWhen(m) || "Released" : releaseLabel(m);
}
// Released in the last RECENT_DAYS days: the films that should be getting day-wise figures
const RECENT_DAYS = 60;
function isRecent(m) {
  const r = parseDay(m.release);
  return Boolean(r) && isReleased(m) && (startOfToday() - r) / 864e5 <= RECENT_DAYS;
}
// Search by title, director or cast (q is already lower case)
function filmMatches(m, q) {
  return [m.title, m.director, m.cast].join(" ").toLowerCase().includes(q);
}

// Film menus: one group per original language (LANGUAGES order), released films first (newest first)
// inside each group. A search narrows the menu, but the selected film always stays in it, so
// filtering never switches film by itself. Matching options carry data-match for "Enter opens the first match".
function filmOptionsHTML(movies, selected, q = "") {
  const shown = sortFilms(movies).all.filter(m => m.id === selected || !q || filmMatches(m, q));
  const opt = m => `<option value="${m.id}"${m.id === selected ? " selected" : ""}${q && filmMatches(m, q) ? " data-match" : ""}>${esc(m.title)} · ${isReleased(m) ? "" : "upcoming, "}${esc(whenLabel(m))}</option>`;
  const group = (label, list) => (list.length ? `<optgroup label="${esc(label)}">${list.map(opt).join("")}</optgroup>` : "");
  return languagesIn(shown).map(lang => group(lang, shown.filter(m => m.lang === lang))).join("") +
    group("Language not set", shown.filter(m => !m.lang));
}
// Fills a film menu and its search's match count
function fillPicker(sel, find, count, movies, selected) {
  const q = find.value.trim().toLowerCase();
  sel.innerHTML = filmOptionsHTML(movies, selected, q);
  sel.value = String(selected);
  const n = q ? sel.querySelectorAll("option[data-match]").length : 0;
  count.textContent = q ? (n ? plural(n, "match", "matches") : "No match") : "";
}
// Typing in a film search narrows its menu; Enter opens the first match that isn't already open
// (through the menu's own change handler, so unsaved changes are still guarded)
function wirePicker(sel, find, count, refill) {
  find.addEventListener("input", refill);
  find.addEventListener("keydown", e => {
    if (e.key !== "Enter") return;
    e.preventDefault();   // never submits the ratings form
    if (!find.value.trim()) return;
    const first = sel.querySelector(`option[data-match]:not([value="${sel.value}"])`);
    if (!first) return toast(count.textContent === "No match" ? "No film matches that search" : "That film is already open");
    sel.value = first.value;
    sel.dispatchEvent(new Event("change"));
  });
}

// The film an editor opens with: the one still in theatres, else the newest release with day-wise figures
function defaultFilmId(movies) {
  const { released, all } = sortFilms(movies);
  return (released.find(m => boxOffice(m).running) || released.find(hasDayWise) || released[0] || all[0])?.id ?? null;
}
function statusChip(m) {
  if (isReleased(m)) return `<span class="chip chip-ok">Released${releasedWhen(m) ? " " + esc(releasedWhen(m)) : ""}</span>`;
  return parseDay(m.release)
    ? `<span class="chip chip-accent">Coming ${esc(releaseLabel(m))}</span>`
    : `<span class="chip">${esc(releaseLabel(m))}</span>`;
}

// ---------- Data checks (shared by the dashboard and the Collections editor) ----------
// Day numbers missing between Day 1 and the last listed day
function missingDays(m) {
  const days = new Set(dayRows(m).filter(d => d.day > 0).map(d => d.day));
  const last = Math.max(0, ...days);
  const gaps = [];
  for (let d = 1; d <= last; d++) if (!days.has(d)) gaps.push(d);
  return gaps;
}

// Figures that don't add up. Each: { text, late } (late = a gap after the first four weeks,
// usually days with too little business to be reported)
function dataWarnings(m) {
  const out = [];
  const t = boxOffice(m).totals || {};
  const life = indiaNet(m), gross = indiaGross(m), ww = worldwideGross(m), overseas = overseasGross(m);
  const reportedLife = toNum(t.indiaNet), reportedWw = toNum(t.worldwideGross), tracked = trackedNet(m);
  const gaps = missingDays(m);
  if (gaps.length) {
    const first = gaps[0];
    const late = first > 28;
    const what = `${gaps.length === 1 ? "Day" : "Days"} ${rangeText(gaps)} ${gaps.length === 1 ? "is" : "are"} missing`;
    out.push({
      late,
      text: first === 1
        ? `${what}, so opening figures and running totals can't be worked out.`
        : `${what}, so the running total stops at Day ${first - 1}.${late ? " Fine if nothing was reported late in the run." : ""}`,
    });
  }
  if (gross !== null && life !== null && gross < life) {
    out.push({ text: `India gross (${crore(gross)}) is lower than India net (${crore(life)}). Gross includes GST, so it should be higher.` });
  }
  if (ww !== null && gross !== null && ww < gross) {
    out.push({ text: `Worldwide gross (${crore(ww)}) is lower than India gross (${crore(gross)}).` });
  }
  if (reportedWw !== null && gross !== null && overseas !== null && Math.abs(reportedWw - (gross + overseas)) > Math.max(1, reportedWw * 0.02)) {
    out.push({ text: `Worldwide gross (${crore(reportedWw)}) doesn't match India gross + overseas (${crore(gross + overseas)}).` });
  }
  if (reportedLife !== null && tracked !== null && reportedLife < tracked - 0.005) {
    out.push({ text: `Lifetime India net (${crore(reportedLife)}) is lower than the day-wise total (${crore(tracked)}).` });
  }
  // A figure that wasn't reported stays blank (shown as "–"); a 0 is shown as ₹0.00 Cr
  const zero = [["indiaNet", "India net"], ["indiaGross", "India gross"], ["overseasGross", "Overseas gross"], ["worldwideGross", "Worldwide gross"]]
    .filter(([k]) => toNum(t[k]) === 0).map(([, label]) => label);
  if (zero.length) {
    out.push({ text: `${zero.join(" and ")} ${zero.length === 1 ? "is" : "are"} 0. If ${zero.length === 1 ? "it wasn't" : "they weren't"} reported, leave ${zero.length === 1 ? "it" : "them"} blank: the website shows a blank as "–" but 0 as ₹0.00 Cr.` });
  }
  return out;
}

// ---------- Sign in ----------
function signedIn() {
  try { return sessionStorage.getItem("manaAdmin") === "1"; } catch { return false; }
}
function showApp() {
  $("login").hidden = true;
  $("app").hidden = false;
  go(location.hash.slice(1) || "dashboard", { focus: false });
}
$("loginForm").addEventListener("submit", e => {
  e.preventDefault();
  if ($("adminPass").value === ADMIN_PASSWORD) {
    try { sessionStorage.setItem("manaAdmin", "1"); } catch {}
    $("loginError").textContent = "";
    $("adminPass").removeAttribute("aria-invalid");
    showApp();
    $("viewTitle").focus();
  } else {
    $("loginError").textContent = "That password isn't right. Try again.";
    $("adminPass").setAttribute("aria-invalid", "true");
    $("adminPass").select();
  }
});
$("adminPass").addEventListener("input", () => $("adminPass").removeAttribute("aria-invalid"));
function signOut() {
  if (!canLeave()) return;
  try { sessionStorage.removeItem("manaAdmin"); } catch {}
  location.hash = "";
  location.reload();
}
$("logoutBtn").addEventListener("click", signOut);
$("logoutTop").addEventListener("click", signOut);

// ---------- Navigation ----------
const VIEWS = { dashboard: "Dashboard", films: "Films", collections: "Collections", ratings: "Ratings", messages: "Messages", settings: "Settings" };
const OLD_VIEWS = { movies: "films" };   // links saved from the old portal
const RENDER = {
  dashboard: renderDashboard, films: renderFilms, collections: renderCollections,
  ratings: renderRatings, messages: renderMessages, settings: () => {},
};
let currentView = null;

function go(view, { film = null, focus = true } = {}) {
  view = OLD_VIEWS[view] || view;
  if (!VIEWS[view]) view = "dashboard";
  if (!confirmLeave(view, film)) return false;
  // Editors reload from storage whenever they're opened, so they never show stale data
  if (view !== currentView) {
    co.draft = rt.draft = null;
    if (film === null) rvFilter = "";   // Ratings opened from the menu or "See all" lists every review
    scrollTo({ top: 0, behavior: "instant" });   // a jump, not the page's smooth scroll: the old view is already gone
  }
  if (film !== null) openFilmIn(view, film);
  currentView = view;
  history.replaceState(null, "", "#" + view);
  document.querySelectorAll(".admin-view").forEach(v => (v.hidden = v.id !== "view-" + view));
  document.querySelectorAll(".admin-nav button").forEach(b => b.setAttribute("aria-current", b.dataset.view === view ? "page" : "false"));
  // On phones the menu is a sideways-scrolling strip; keep the current view's tab in sight.
  // (Set scrollLeft directly: scrollIntoView would also stop the page's smooth scroll to the top.)
  const strip = document.querySelector(".admin-side"), tab = strip.querySelector(`[data-view="${view}"]`);
  if (strip.scrollWidth > strip.clientWidth) strip.scrollLeft = tab.offsetLeft - (strip.clientWidth - tab.offsetWidth) / 2;
  $("viewTitle").textContent = VIEWS[view];
  document.title = `${VIEWS[view]} · Admin | MANA CINEMA`;
  RENDER[view]();
  updateBadge();
  icons();
  if (focus) $("viewTitle").focus({ preventScroll: true });
  return true;
}
function openFilmIn(view, id) {
  if (view === "collections" && id !== co.id) {
    co.id = id;
    co.draft = null;
    rememberFilm(CO_KEY, id);
  }
  if (view === "ratings") {
    if (id !== rt.id) { rt.id = id; rt.draft = null; rememberFilm(RT_KEY, id); }
    rvFilter = String(id);
  }
}

// Leaving an editor (or switching its film) with unsaved changes needs a yes
function confirmLeave(view, film) {
  const pending = [];
  if (currentView === "collections" && isCoDirty() && (view !== "collections" || (film !== null && film !== co.id))) pending.push("co");
  if (currentView === "ratings" && isRtDirty() && (view !== "ratings" || (film !== null && film !== rt.id))) pending.push("rt");
  if (!pending.length) return true;
  const names = pending.map(p => (p === "co" ? `${co.draft.title}'s collections` : `${rt.draft.title}'s critics scores`)).join(" and ");
  if (!confirm(`You have unsaved changes to ${names}. Leave without saving?`)) return false;
  if (pending.includes("co")) co.draft = null;
  if (pending.includes("rt")) rt.draft = null;
  return true;
}
// Before signing out or reloading
function canLeave() {
  const dirty = [isCoDirty() && "collections", isRtDirty() && "critics scores"].filter(Boolean);
  if (dirty.length && !confirm(`You have unsaved ${dirty.join(" and ")} changes. Leave without saving?`)) return false;
  co.draft = rt.draft = null;
  return true;
}
addEventListener("beforeunload", e => {
  if (isCoDirty() || isRtDirty()) {
    e.preventDefault();
    e.returnValue = "";
  }
});

document.querySelector(".admin-nav").addEventListener("click", e => {
  const b = e.target.closest("[data-view]");
  if (b) go(b.dataset.view);
});
document.addEventListener("click", e => {
  const g = e.target.closest("[data-goto]");
  if (g) go(g.dataset.goto, { film: g.dataset.film ? Number(g.dataset.film) : null });
});

function updateBadge() {
  const unread = db.messages().filter(m => !m.read).length;
  $("msgBadge").hidden = !unread;
  $("msgBadge").textContent = unread;
}

// ---------- Dashboard ----------
function renderDashboard() {
  const movies = db.movies();
  const released = movies.filter(isReleased);
  const reviews = db.reviews();
  const filmIds = new Set(movies.map(m => m.id));
  // Only ratings the website shows: visible, and for a film that still exists
  const rated = reviews.filter(r => filmIds.has(r.movieId) && !r.hidden && Number.isInteger(r.stars) && r.stars >= 1 && r.stars <= 5);
  const messages = db.messages();
  const unread = messages.filter(m => !m.read).length;
  const langs = languagesIn(movies);
  // Released films with any reported figure (some list films only have the opening day), and how many are tracked day by day
  const withFigures = released.filter(m => indiaNet(m) !== null || worldwideGross(m) !== null || openingDay(m) !== null);
  const dayWise = withFigures.filter(hasDayWise).length;
  const avg = rated.length ? rated.reduce((s, r) => s + r.stars, 0) / rated.length : null;

  const stats = [
    { icon: "clapperboard", label: "Films listed", value: movies.length, note: `${plural(langs.length, "language")} · ${released.length} released · ${movies.length - released.length} upcoming`, view: "films" },
    { icon: "bar-chart-3", label: "With collections", value: withFigures.length, note: `${dayWise} day by day · ${withFigures.length - dayWise} with headline figures only`, view: "collections" },
    { icon: "star", label: "Audience ratings", value: rated.length, note: avg === null ? "None yet" : `Average ${avg.toFixed(1)} / 5`, view: "ratings" },
    { icon: "inbox", label: "Unread messages", value: unread, note: `${messages.length} in total`, view: "messages" },
  ];
  $("statGrid").innerHTML = stats.map(s => `
    <button type="button" class="stat" data-goto="${s.view}">
      <span class="stat-icon"><i data-lucide="${s.icon}"></i></span>
      <span><small>${s.label}</small><strong class="money">${s.value}</strong><em>${esc(s.note)}</em></span>
    </button>`).join("");

  // One tile per language: opens Films filtered to it
  $("langTiles").innerHTML = langs.map(lang => {
    const films = movies.filter(m => m.lang === lang);
    const dw = films.filter(hasDayWise).length;
    return `
      <button type="button" class="lang-tile" data-film-lang="${esc(lang)}" aria-label="${esc(lang)}: ${plural(films.length, "film")}, ${dw} with day-wise figures. Show them in Films">
        <span>${esc(lang)}</span><strong>${films.length}</strong><small>${dw ? `${dw} day-wise` : "Totals only"}</small>
      </button>`;
  }).join("") || `<p class="empty-line">No films yet.</p>`;

  // Top 10 by worldwide gross (the site's own ranking); the full table is on the website
  const top = ranking(movies, "worldwide").slice(0, 10);
  const max = top[0]?.value || 1;
  const noFigure = released.filter(m => worldwideGross(m) === null).length;
  $("grossBars").innerHTML = top.length ? top.map(({ m, value, rank }) => `
    <div class="bar-row">
      <span class="bar-label">
        <span class="bar-name"><span class="bar-rank">${rank}</span><button type="button" class="plain-link" data-goto="collections" data-film="${m.id}">${esc(m.title)}</button></span>
        <span class="bar-meta"><small>${esc([m.lang, parseDay(m.release)?.getFullYear() ?? m.year].filter(Boolean).join(" · "))}</small>${verdictHTML(m)}</span>
      </span>
      <span class="bar-track" aria-hidden="true"><span class="bar-fill" style="width:${((value / max) * 100).toFixed(1)}%"></span></span>
      <span class="bar-value money">${crore(value)}</span>
    </div>`).join("") + (noFigure ? `<p class="fine-print">${plural(noFigure, "released film")} ${noFigure === 1 ? "has" : "have"} no worldwide figure yet.</p>` : "")
    : `<div class="admin-empty"><i data-lucide="globe"></i><p>No worldwide figures yet. Add them in Collections.</p></div>`;

  const items = attentionItems(movies);
  const shown = attentionOpen ? items : items.slice(0, ATTENTION_CAP);
  const more = items.length - ATTENTION_CAP;
  $("attentionCount").textContent = items.length ? plural(items.length, "item") : "";
  $("attentionList").innerHTML = items.length ? shown.map(it => `
    <li>
      <button type="button" class="attention attention-${it.tone}" data-goto="${it.view}" data-film="${it.film}">
        <i data-lucide="${it.icon}"></i>
        <span>${it.text}</span>
        <i data-lucide="chevron-right" class="go-icon"></i>
      </button>
    </li>`).join("") + (more > 0 ? `
    <li class="attention-more">
      <button type="button" class="link-btn" id="attentionMore" aria-expanded="${attentionOpen}">${attentionOpen ? "Show fewer" : `And ${more} more · show all`}</button>
    </li>` : "")
    : `<li class="admin-empty"><i data-lucide="check-circle-2"></i><p>${movies.length ? "All clear. Recent releases have day-wise figures and day-wise films have ratings." : "Nothing to check yet. Add a film in Films."}</p></li>`;

  const titles = new Map(movies.map(m => [m.id, m.title]));
  const latest = [...reviews].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 5);
  $("latestReviews").innerHTML = latest.length ? latest.map(r => `
    <li class="review-item">
      <div class="review-head">
        ${starsHTML(r.stars, { size: "sm" })}
        <strong>${esc(r.name)}</strong>
        <span class="muted">on</span>
        <button type="button" class="plain-link" data-goto="ratings" data-film="${Number(r.movieId)}">${esc(titles.get(r.movieId) || "a deleted film")}</button>
        ${r.hidden ? `<span class="chip">Hidden</span>` : ""}
        <small class="muted">${fmtTime(r.at)}</small>
      </div>
      ${r.text ? `<p>${esc(r.text.length > 180 ? r.text.slice(0, 180).trimEnd() + "…" : r.text)}</p>` : `<p class="muted">No written review, just stars.</p>`}
    </li>`).join("")
    : `<li class="admin-empty"><i data-lucide="message-square"></i><p>No audience reviews yet. Visitors rate released films on each film's page.</p></li>`;
  icons();
}

// "Needs attention" shows this many items until "show all" is pressed
const ATTENTION_CAP = 8;
let attentionOpen = false;
$("attentionList").addEventListener("click", e => {
  if (!e.target.closest("#attentionMore")) return;
  attentionOpen = !attentionOpen;
  renderDashboard();
  $("attentionMore")?.focus();
});
// A language tile opens Films showing just that language
$("langTiles").addEventListener("click", e => {
  const t = e.target.closest("[data-film-lang]");
  if (!t) return;
  Object.assign(filmView, { lang: t.dataset.filmLang, q: "", shown: FILM_PAGE });
  $("filmSearch").value = "";
  go("films");
});

// What the admin should look at next, most urgent first.
// The language lists hold many older films with totals only, so missing day-wise figures are flagged only
// for releases from the last RECENT_DAYS days, and missing critics/IMDb only for films tracked day by day.
function attentionItems(movies) {
  const items = [];
  const now = startOfToday();
  movies.forEach(m => {
    const name = `<strong>${esc(m.title)}</strong>`;
    if (!isReleased(m)) {
      const n = daysUntil(m);
      if (n !== null && n >= 1 && n <= 7) {
        items.push({ rank: 0, tone: "todo", icon: "calendar-clock", text: `${name} releases ${countdown(n)}. Add Day 1 when it's reported.`, view: "collections", film: m.id });
      }
      return;
    }
    const bo = boxOffice(m);
    const asOf = parseDay(bo.asOf);
    const age = asOf ? Math.round((now - asOf) / 864e5) : null;
    if (bo.running && (age === null || age > 7)) {
      items.push({ rank: 1, tone: "warn", icon: "clock", text: `${name} is still in theatres, but its figures ${age === null ? "have no as-of date" : `are ${age} days old (${esc(dayLabel(bo.asOf))})`}.`, view: "collections", film: m.id });
    }
    const dayWise = hasDayWise(m);
    if (!dayWise && isRecent(m)) {
      items.push({ rank: 2, tone: "warn", icon: "calendar-x", text: `${name} came out ${esc(dayLabel(m.release))} and has no day-wise collections yet.`, view: "collections", film: m.id });
    }
    dataWarnings(m).forEach(w => {
      items.push({ rank: w.late ? 5 : 3, tone: w.late ? "info" : "warn", icon: w.late ? "info" : "triangle-alert", text: `${name}: ${esc(w.text)}`, view: "collections", film: m.id });
    });
    const noCritics = !criticsScore(m), noImdb = !imdbScore(m);
    if (dayWise && (noCritics || noImdb)) {
      const what = noCritics && noImdb ? "critics scores or IMDb rating" : noCritics ? "critics scores" : "IMDb rating";
      items.push({ rank: 4, tone: "todo", icon: "star-off", text: `${name} has no ${what}.`, view: "ratings", film: m.id });
    }
  });
  return items.sort((a, b) => a.rank - b.rank);
}

// ---------- Films ----------
const CERTS = ["U", "U/A", "UA 7+", "UA 13+", "UA 16+", "A", "S"];
const DEFAULT_COLORS = ["#d63bff", "#0c0716"];
const OTHER_LANG = "other";   // the "Other…" choice in the language menu (the real languages are capitalised)
// Films added here get ids from 9001 up, clear of the catalogue's ranges (Telugu under 1000, day-wise
// films 1001+, list films 2001+), so a later catalogue update can never reuse an admin-added film's id
const FIRST_ADMIN_ID = 9001;
let editingId = null;
let filmSnapshot = "";   // the dialog's values when it opened, to spot unsaved edits

// ---------- Films: language filter, search and paging ----------
// ~200 films: the list shows FILM_PAGE at a time ("Show more"), filtered by language and a search
const FILM_PAGE = 30;
const filmView = { lang: "", q: "", shown: FILM_PAGE, all: [] };   // lang "" = every language; all = the sorted films

function renderFilms() {
  const movies = db.movies();
  const { released, upcoming, all } = sortFilms(movies);
  const langs = languagesIn(movies);
  if (filmView.lang && !langs.includes(filmView.lang)) filmView.lang = "";
  filmView.all = all;
  $("filmCount").textContent = `${plural(all.length, "film")} · ${plural(langs.length, "language")} · ${released.length} released · ${upcoming.length} upcoming`;
  const count = lang => movies.filter(m => m.lang === lang).length;
  $("filmLangs").innerHTML = [["", "All", all.length], ...langs.map(l => [l, l, count(l)])]
    .map(([value, label, n]) => `<button type="button" class="chip" data-lang="${esc(value)}" aria-pressed="${value === filmView.lang}">${esc(label)} <span class="chip-count">${n}</span></button>`).join("");
  $("filmLangs").hidden = !all.length;
  $("filmSearch").closest(".search").hidden = !all.length;
  renderFilmList();
}

// The films the current language and search let through, in list order
function filteredFilms() {
  const q = filmView.q.trim().toLowerCase();
  return filmView.all.filter(m => (!filmView.lang || m.lang === filmView.lang) && (!q || filmMatches(m, q)));
}

// The cards for the current language and search, FILM_PAGE at a time
function renderFilmList() {
  const q = filmView.q.trim();
  const list = filteredFilms();
  const page = list.slice(0, filmView.shown);
  const what = plural(list.length, `${filmView.lang ? filmView.lang + " " : ""}film`);
  const total = q ? `${what} matching “${q}”` : what;
  $("filmResults").textContent = !filmView.all.length ? "" : list.length > page.length ? `Showing ${page.length} of ${total}` : total;
  $("filmList").innerHTML = page.map(filmCardHTML).join("") || (filmView.all.length
    ? `<div class="admin-empty"><i data-lucide="search-x"></i><p>No films match. Try another language or search.</p><button type="button" class="btn btn-ghost btn-sm" id="clearFilmFilters">Show every film</button></div>`
    : `<div class="admin-empty"><i data-lucide="film"></i><p>No films yet. Add one to start tracking it.</p></div>`);
  const rest = list.length - page.length;
  $("filmMore").innerHTML = rest > 0 ? `
    <button type="button" class="btn btn-ghost btn-sm" data-more="${Math.min(FILM_PAGE, rest)}"><i data-lucide="chevrons-down"></i> Show ${Math.min(FILM_PAGE, rest)} more</button>
    ${rest > FILM_PAGE ? `<button type="button" class="link-btn" data-more="${rest}">Show all ${list.length}</button>` : ""}` : "";
  icons();
}

$("filmLangs").addEventListener("click", e => {
  const chip = e.target.closest("[data-lang]");
  if (!chip) return;
  filmView.lang = chip.dataset.lang;
  filmView.shown = FILM_PAGE;
  renderFilms();
  refocus(`#filmLangs [data-lang="${CSS.escape(filmView.lang)}"]`);
});
$("filmSearch").addEventListener("input", e => {
  filmView.q = e.target.value;
  filmView.shown = FILM_PAGE;
  renderFilmList();
});
$("filmMore").addEventListener("click", e => {
  const b = e.target.closest("[data-more]");
  if (!b) return;
  const first = filmView.shown;
  filmView.shown += Number(b.dataset.more);
  renderFilmList();
  // Focus moves to the first newly shown film, so keyboard users carry on where the list grew
  $("filmList").querySelectorAll("[data-edit]")[first]?.focus();
});
$("filmList").addEventListener("click", e => {
  if (!e.target.closest("#clearFilmFilters")) return;
  Object.assign(filmView, { lang: "", q: "", shown: FILM_PAGE });
  $("filmSearch").value = "";
  renderFilms();
  $("filmSearch").focus();
});
// After a save the film's card is in view: a language or search that would hide it is changed, and the
// list grows to reach it (a new film without a date sorts last, after every released film)
function showFilmCard(film) {
  if (filmView.lang && film.lang !== filmView.lang) filmView.lang = film.lang || "";
  if (filmView.q.trim() && !filmMatches(film, filmView.q.trim().toLowerCase())) {
    filmView.q = "";
    $("filmSearch").value = "";
  }
  renderFilms();
  const i = filteredFilms().findIndex(m => m.id === film.id);
  if (i >= filmView.shown) {
    filmView.shown = i + 1;
    renderFilmList();
  }
}

function filmCardHTML(m) {
  // Short items never break inside ("3h 9m"); the genre may wrap
  const meta = [m.genre && esc(m.genre), ...[m.lang, m.cert, m.duration].filter(Boolean).map(x => `<span class="nowrap">${esc(x)}</span>`)]
    .filter(Boolean).join(" · ");
  let facts;
  if (isReleased(m)) {
    // The headline figure: worldwide, else India net, else the opening day (some list films only have that)
    const ww = worldwideGross(m), net = indiaNet(m), od = openingDay(m), days = dayRows(m).filter(d => d.day > 0).length;
    const headline = ww !== null ? `Worldwide ${crore(ww)}` : net !== null ? `India net ${crore(net)}` : od !== null ? `Opening day ${crore(od)}` : "No figures yet";
    facts = [headline, days ? `${plural(days, "day")} listed` : ww !== null || net !== null ? "Totals only" : "No day-wise figures"].join(" · ");
  } else {
    const n = daysUntil(m);
    facts = n === null ? "Exact date to be announced" : `Releases ${countdown(n)}`;
  }
  return `
    <article class="admin-film">
      ${posterHTML(m, { compact: true })}
      <div class="admin-film-info">
        <h3>${esc(m.title)}</h3>
        <p class="meta">${meta}</p>
        <p class="meta film-status">${statusChip(m)} ${verdictHTML(m)} <span>${facts}</span></p>
      </div>
      <div class="admin-film-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-edit="${m.id}" aria-label="Edit ${esc(m.title)}"><i data-lucide="pencil"></i> Edit</button>
        <button type="button" class="link-btn" data-goto="collections" data-film="${m.id}" aria-label="Collections for ${esc(m.title)}"><i data-lucide="bar-chart-3"></i> Collections</button>
        <button type="button" class="link-btn danger" data-delete="${m.id}" aria-label="Delete ${esc(m.title)}"><i data-lucide="trash-2"></i> Delete</button>
      </div>
    </article>`;
}

$("filmList").addEventListener("click", e => {
  const edit = e.target.closest("[data-edit]");
  const del = e.target.closest("[data-delete]");
  if (edit) openFilm(Number(edit.dataset.edit));
  if (del) deleteFilm(Number(del.dataset.delete));
});

function deleteFilm(id) {
  const movies = db.movies();
  const m = findFilm(movies, id);
  if (!m) return;
  const reviewCount = db.reviews().filter(r => r.movieId === m.id).length;
  const extra = reviewCount ? `, critics scores and ${plural(reviewCount, "audience review")}` : " and critics scores";
  if (!confirm(`Delete "${m.title}"? Its collections${extra} go too. This can't be undone.`)) return;
  if (!saveStore(MOVIES_KEY, movies.filter(x => x.id !== m.id))) return toast(SAVE_FAILED);
  saveStore(REVIEWS_KEY, db.reviews().filter(r => r.movieId !== m.id));
  saveStore(REMINDERS_KEY, loadStore(REMINDERS_KEY, []).filter(x => x !== m.id));
  if (co.id === m.id) co.id = co.draft = null;
  if (rt.id === m.id) rt.id = rt.draft = null;
  renderFilms();
  toast(`${m.title} deleted`);
  $("addFilm").focus();
}

// Film form
// "Not yet" is short because the box is half width on phones
$("fCert").innerHTML = `<option value="">Not yet</option>` + CERTS.map(c => `<option>${c}</option>`).join("");
$("fArt").innerHTML = Object.keys(HEROES).map(k => `<option value="${k}">${k}</option>`).join("") + `<option value="">none</option>`;
$("fLangSel").innerHTML = LANGUAGES.map(l => `<option>${esc(l)}</option>`).join("") + `<option value="${OTHER_LANG}">Other…</option>`;

function openFilm(id = null) {
  const lang = filmView.lang || "Telugu";   // a new film starts in the language the list is showing
  const m = id !== null ? findFilm(db.movies(), id) : { lang, languages: [lang], art: Object.keys(HEROES)[0], colors: DEFAULT_COLORS };
  if (!m) return;
  editingId = id;
  $("filmDialogTitle").textContent = id !== null ? `Edit ${m.title}` : "Add film";
  const set = (field, value) => { $(field).value = value ?? ""; };
  set("fTitle", m.title);
  set("fGenre", m.genre);
  // A language outside the list (saved earlier or typed under "Other…") is kept in the text box
  const known = LANGUAGES.includes(m.lang);
  set("fLangSel", known ? m.lang : m.lang ? OTHER_LANG : "");
  set("fLang", known ? "" : m.lang);
  set("fLanguages", (m.languages || []).join(", "));
  lastLang = formLang();
  set("fRelease", parseDay(m.release) ? m.release : "");
  set("fReleaseNote", m.releaseNote);
  set("fYear", m.year);
  $("fReleased").checked = !parseDay(m.release) && m.status === "released";
  set("fDuration", m.duration);
  // Keep a certificate saved by an older version selectable
  $("fCert").querySelectorAll("[data-extra]").forEach(o => o.remove());
  if (m.cert && !CERTS.includes(m.cert)) $("fCert").insertAdjacentHTML("beforeend", `<option data-extra>${esc(m.cert)}</option>`);
  set("fCert", m.cert);
  set("fArt", Object.keys(HEROES).includes(m.art) ? m.art : "");
  set("fDirector", m.director);
  set("fCast", m.cast);
  set("fDesc", m.desc);
  set("fImage", m.image);
  $("fColor1").value = /^#[0-9a-f]{6}$/i.test(m.colors?.[0] || "") ? m.colors[0] : DEFAULT_COLORS[0];
  $("fColor2").value = /^#[0-9a-f]{6}$/i.test(m.colors?.[1] || "") ? m.colors[1] : DEFAULT_COLORS[1];
  syncFilmForm();
  filmSnapshot = JSON.stringify(formFilm());
  $("filmDialog").showModal();
  $("fTitle").focus();
  icons();
}

// Original language: the menu's choice, or the "Other…" box. Typed in any case, a listed language
// (or one another film already uses) is stored as already spelled, so "odia" and "Odia" stay one language
function formLang() {
  if ($("fLangSel").value !== OTHER_LANG) return $("fLangSel").value;
  const typed = $("fLang").value.trim(), key = typed.toLowerCase();
  const known = [...LANGUAGES, ...languagesIn(db.peek().filter(m => m && m.id !== editingId && typeof m.lang === "string"))];
  return known.find(l => l.toLowerCase() === key) || typed;
}
// "Languages released" follows the original language while it lists only that language (or nothing),
// so a new film switched from Telugu to Hindi isn't saved as released in Telugu
let lastLang = "";
function followLang() {
  const lang = formLang(), now = $("fLanguages").value.trim();
  if (!now || now.toLowerCase() === lastLang.toLowerCase()) $("fLanguages").value = lang;
  lastLang = lang;
}

function formFilm() {
  const v = id => $(id).value.trim();
  const release = $("fRelease").value;
  const lang = formLang();
  const languages = [...new Set(v("fLanguages").split(",").map(s => s.trim()).filter(Boolean))];
  return {
    title: v("fTitle"), genre: v("fGenre"), lang,
    languages: languages.length ? languages : (lang ? [lang] : []),
    release, releaseNote: release ? "" : v("fReleaseNote"),
    // Without an exact date, "released" says the film is already out (older films in the language lists)
    status: !release && $("fReleased").checked ? "released" : "",
    year: release ? parseDay(release)?.getFullYear() : Number(v("fYear")) || undefined,
    duration: v("fDuration"), cert: $("fCert").value, director: v("fDirector"), cast: v("fCast"), desc: v("fDesc"),
    art: $("fArt").value, colors: [$("fColor1").value, $("fColor2").value], image: v("fImage"),
  };
}

// Show the note/year fields only without a date, check the title and photo path, redraw the preview
function syncFilmForm() {
  const noDate = !$("fRelease").value;
  // Disabled too, so a stale value in a hidden field can't block saving with an error nobody can see
  document.querySelectorAll("[data-no-date]").forEach(f => {
    f.hidden = !noDate;
    f.querySelector("input").disabled = !noDate;
  });
  const other = $("fLangSel").value === OTHER_LANG;
  $("fLang").hidden = $("fLang").disabled = !other;
  $("fLang").required = other;
  const data = formFilm();
  // "required" lets a box of spaces through, and "all" is what the language filters use for every language
  $("fLang").setCustomValidity(other && (!data.lang || ["all", OTHER_LANG].includes(data.lang.toLowerCase())) ? "Type the language's name." : "");
  const clash = db.peek().some(m => m.id !== editingId && String(m.title).trim().toLowerCase() === data.title.toLowerCase());
  $("fTitle").setCustomValidity(clash ? "Another film already has this title." : "");
  $("fImage").setCustomValidity(data.image && !posterImage(data) ? "Use a file like images/posters/name.jpg or an https link to a .jpg, .png or .webp." : "");
  $("filmPreview").innerHTML = posterHTML({ ...data, title: data.title || "Preview" }, { compact: true });
  markPhotos($("filmPreview"));
}
$("filmForm").addEventListener("input", syncFilmForm);
$("fLangSel").addEventListener("change", () => {
  followLang();
  if ($("fLangSel").value === OTHER_LANG) $("fLang").focus();
});
$("fLang").addEventListener("input", followLang);
$("addFilm").addEventListener("click", () => openFilm());

// Cancel, the close button and Escape all ask first when something was changed.
// Focus goes back to the film's Edit button (or "Add film"), never left inside the closed dialog.
function closeFilmDialog() {
  const changed = JSON.stringify(formFilm()) !== filmSnapshot;
  if (changed && !confirm(editingId !== null ? "Close without saving your changes to this film?" : "Close without adding this film?")) return;
  $("filmDialog").close();
  refocus(`[data-edit="${editingId}"]`, "#addFilm");
}
$("closeDialog").addEventListener("click", closeFilmDialog);
$("cancelDialog").addEventListener("click", closeFilmDialog);
$("filmDialog").addEventListener("cancel", e => {
  e.preventDefault();
  closeFilmDialog();
});

$("filmForm").addEventListener("submit", e => {
  e.preventDefault();
  let movies = db.movies();
  const data = formFilm();
  let film;
  if (editingId !== null) {
    const old = findFilm(movies, editingId);
    if (!old) { $("filmDialog").close(); toast("That film was deleted."); renderFilms(); return $("addFilm").focus(); }
    // critics and boxOffice stay as they are, and so do fields the form no longer edits (an old "cover" flag)
    film = { ...old, ...data, id: editingId };
  } else {
    film = { ...data, id: Math.max(FIRST_ADMIN_ID - 1, ...movies.map(x => x.id)) + 1, critics: {}, boxOffice: {} };
  }
  // Empty optional fields are removed, not saved as ""
  ["release", "releaseNote", "status", "year", "duration", "cert", "director", "cast", "image", "art"].forEach(k => { if (blank(film[k])) delete film[k]; });
  movies = editingId !== null ? movies.map(x => (x.id === editingId ? film : x)) : [...movies, film];
  if (!saveStore(MOVIES_KEY, movies)) return toast(SAVE_FAILED);
  $("filmDialog").close();
  showFilmCard(film);
  toast(`${film.title} saved`);
  refocus(`[data-edit="${film.id}"]`, "#addFilm");
});

// ---------- Collections editor ----------
const CO_KEY = "manaAdminCollectionsFilm";
const TOTAL_KEYS = ["indiaNet", "indiaGross", "overseasGross", "worldwideGross", "producerClaim"];
const OPENING_KEYS = ["net", "previews", "includesPreviews"];   // boxOffice.opening: the reported opening day
const co = { id: null, draft: null, snapshot: "" };   // draft = a copy of the film being edited
let pasted = null;

$("vLabel").innerHTML = `<option value="">Auto (indicative)</option>` + VERDICTS.map(v => `<option>${esc(v.label)}</option>`).join("");

function isCoDirty() {
  return Boolean(co.draft) && JSON.stringify(cleanBoxOffice(co.draft.boxOffice)) !== co.snapshot;
}

function renderCollections() {
  const movies = db.movies();
  // With no films there's nothing to edit, so the editor and its buttons are hidden
  const none = !movies.length;
  ["coLayout", "coExport", "coSaveTop", "coState"].forEach(id => ($(id).hidden = none));
  $("coFilm").disabled = none;
  if (none) {
    co.id = co.draft = null;
    $("coContext").textContent = "No films yet. Add one in Films first.";
    $("coFilm").innerHTML = "";
    return;
  }
  if (!findFilm(movies, co.id)) co.id = findFilm(movies, storedFilm(CO_KEY))?.id ?? defaultFilmId(movies);
  if (!co.draft || co.draft.id !== co.id) loadCollections(findFilm(movies, co.id));
  fillPicker($("coFilm"), $("coFind"), $("coFindCount"), movies, co.id);
  renderCoForm();
}
wirePicker($("coFilm"), $("coFind"), $("coFindCount"), () => fillPicker($("coFilm"), $("coFind"), $("coFindCount"), db.peek(), co.id));

// Editable copy of a film's collections; blank inputs are null until saved
function loadCollections(m) {
  const draft = structuredClone(m);
  const bo = draft.boxOffice = draft.boxOffice || {};
  bo.days = (bo.days || [])
    .map(d => ({ day: toNum(d.day), net: toNum(d.net), note: d.note || "" }))
    .sort((a, b) => (a.day ?? 1e9) - (b.day ?? 1e9));
  if (bo.opening && typeof bo.opening === "object") {
    const o = bo.opening;
    bo.opening = { ...o, net: toNum(o.net), previews: toNum(o.previews), includesPreviews: typeof o.includesPreviews === "boolean" ? o.includesPreviews : null };
  }
  bo.sources = (bo.sources || []).map(s => ({ title: s.title || "", url: s.url || "" }));
  bo.notes = Array.isArray(bo.notes) ? [...bo.notes] : [];
  co.draft = draft;
  co.snapshot = JSON.stringify(cleanBoxOffice(bo));
  co.id = m.id;
  rememberFilm(CO_KEY, m.id);
}

// What gets saved: blank fields removed, days sorted, text trimmed. Other keys are kept as they were.
function cleanBoxOffice(src) {
  const bo = structuredClone(src || {});
  bo.days = (bo.days || [])
    .filter(d => !blank(d.net))
    .map(d => {
      const row = { day: d.day, net: d.net };
      if (String(d.note || "").trim()) row.note = String(d.note).trim();
      return row;
    })
    .sort((a, b) => a.day - b.day);
  const tidy = (obj, keys) => {
    const out = { ...(obj || {}) };
    (keys || Object.keys(out)).forEach(k => { if (blank(out[k])) delete out[k]; });
    return Object.keys(out).length ? out : null;
  };
  // A reported opening needs a figure: "includes previews" on its own says nothing
  const opening = tidy(bo.opening, OPENING_KEYS);
  const parts = {
    totals: tidy(bo.totals, TOTAL_KEYS), budget: tidy(bo.budget, ["low", "high"]), day1Split: tidy(bo.day1Split),
    opening: opening && ("net" in opening || "previews" in opening) ? opening : null,
  };
  Object.entries(parts).forEach(([k, v]) => { if (v) bo[k] = v; else delete bo[k]; });
  ["verdict", "verdictSource", "asOf", "previewsDate"].forEach(k => {
    const v = String(bo[k] ?? "").trim();
    if (v) bo[k] = v; else delete bo[k];
  });
  bo.running = Boolean(bo.running);
  bo.sources = (bo.sources || [])
    .map(s => ({ title: String(s.title || "").trim(), url: String(s.url || "").trim() }))
    .filter(s => s.title || s.url)
    .map(s => (s.url ? { title: s.title || hostOf(s.url), url: s.url } : { title: s.title }));
  bo.notes = (bo.notes || []).map(n => String(n).trim()).filter(Boolean);
  ["days", "sources", "notes"].forEach(k => { if (!bo[k].length) delete bo[k]; });
  return bo;
}

// The draft as the website would see it, for the live summary
function previewFilm() {
  return { ...co.draft, boxOffice: cleanBoxOffice(co.draft.boxOffice) };
}

// Problems that block saving
function collectionErrors(bo) {
  const errs = [];
  const seen = new Set();
  const check = (v, what) => {
    if (Number.isNaN(v)) errs.push(`${what} isn't a number.`);
    else if (v !== null && v !== undefined && v < 0) errs.push(`${what} can't be negative.`);
  };
  bo.days.forEach((d, i) => {
    const ok = Number.isInteger(d.day) && d.day >= 0 && d.day <= 1000;
    const label = ok ? dayName(d.day) : `Row ${i + 1}`;
    if (!ok) errs.push(`Row ${i + 1}: the day must be a whole number from 0 up.`);
    else if (!blank(d.net)) {
      if (seen.has(d.day)) errs.push(`${label} is listed twice.`);
      seen.add(d.day);
    }
    check(d.net, `${label}'s figure`);
  });
  const t = bo.totals || {};
  [["indiaNet", "India net"], ["indiaGross", "India gross"], ["overseasGross", "Overseas gross"], ["worldwideGross", "Worldwide gross"], ["producerClaim", "Makers' claim"]]
    .forEach(([k, label]) => check(t[k], label));
  const o = bo.opening || {};
  check(o.net, "Reported opening day");
  check(o.previews, "Reported paid previews");
  if (o.includesPreviews === true && !blank(o.net) && !blank(o.previews) && o.previews >= o.net) errs.push("The paid previews must be less than the reported opening day that includes them.");
  const b = bo.budget || {};
  check(b.low, "Budget low");
  check(b.high, "Budget high");
  if (b.low > 0 && b.high > 0 && b.low > b.high) errs.push("Budget low is higher than budget high.");
  Object.entries(bo.day1Split || {}).forEach(([lang, v]) => check(v, `Day 1 ${lang}`));
  bo.sources.forEach((s, i) => {
    if (s.url.trim() && !isLink(s.url)) errs.push(`Source ${i + 1}: the link must start with http:// or https://.`);
  });
  return errs;
}

// Things worth a second look, but fine to save
function collectionWarnings(p, draftBo) {
  const warns = dataWarnings(p).map(w => w.text);
  const empty = draftBo.days.filter(d => d.net === null && Number.isInteger(d.day));
  if (empty.length) warns.push(`${empty.map(d => dayName(d.day)).join(", ")} ${empty.length === 1 ? "has" : "have"} no figure and won't be saved.`);
  if (!isReleased(p) && dayRows(p).length) warns.push("This film isn't released yet, but day figures are entered.");
  const d1 = dayRows(p).find(d => d.day === 1);
  const split = languageSplit(p).reduce((s, x) => s + x.net, 0);
  if (d1 && split > 0 && Math.abs(split - d1.net) > 0.05) warns.push(`Day 1 by language adds up to ${crore(split)}, but Day 1 is ${crore(d1.net)}.`);
  const bo = boxOffice(p), asOf = parseDay(bo.asOf);
  if (bo.running && (!asOf || (startOfToday() - asOf) / 864e5 > 7)) warns.push("Still in theatres, but the as-of date is over a week old. Update the figures and the date.");
  // Reported opening day
  const o = bo.opening || {};
  if (blank(o.net) && !blank(o.previews)) warns.push("Paid previews are entered without the opening-day figure, so they aren't used.");
  else if (!blank(o.net) && !blank(o.previews) && typeof o.includesPreviews !== "boolean") warns.push("Say whether the reported opening includes the paid previews. Until then it's shown as reported.");
  if (d1 && !blank(o.net)) {
    // Both ways of reading the reported figure are checked, so a like-for-like match never warns
    const reported = openingDay({ ...p, boxOffice: { ...bo, days: [] } });
    const same = [openingDay(p), openingDay(p, { previews: false })].some(v => v !== null && Math.abs(v - reported) < 0.05);
    if (reported !== null && !same) warns.push(`The reported opening (${crore(reported)}) differs from the day-wise opening (${crore(openingDay(p))}). The day-wise figure is used.`);
  }
  return warns;
}

// Says whether the reported opening day is what the website uses for this film
function openingUseHTML(p) {
  const o = boxOffice(p).opening || {};
  const od = openingDay(p);
  if (dayRows(p).some(d => d.day === 1)) {
    return `<i data-lucide="info"></i><span>Not used for this film: Day 1 is in the day-wise table, so the opening day is <strong class="money">${crore(od)}</strong>.</span>`;
  }
  if (od === null) {
    return `<i data-lucide="info"></i><span>Nothing reported yet. Without Day 1 or a reported figure, this film stays out of the opening-day lists.</span>`;
  }
  const pre = toNum(o.previews);
  const how = o.includesPreviews === true ? "paid previews included"
    : o.includesPreviews === false ? (pre ? `${crore(toNum(o.net))} + ${crore(pre)} paid previews` : "no paid previews")
    : "as reported; whether it includes paid previews isn't known";
  return `<i data-lucide="check-circle-2"></i><span>In use: the website shows an opening day of <strong class="money">${crore(od)}</strong> (${esc(how)}).</span>`;
}

function renderCoForm() {
  const d = co.draft, bo = d.boxOffice;
  const released = isReleased(d);
  $("coContext").innerHTML = `${d.lang ? `<span class="chip">${esc(d.lang)}</span>` : ""} ${statusChip(d)} ${released ? verdictHTML(previewFilm()) : ""}
    <span>${released ? "" : "Not released yet: figures stay off the website until release day. "}Release date and film details are edited in <button type="button" class="plain-link" data-goto="films">Films</button>.</span>`;
  renderDayTable();
  $("coForm").querySelectorAll("[data-path]").forEach(el => {
    const v = el.dataset.path.split(".").reduce((o, k) => (o ? o[k] : undefined), bo);
    if (el.type === "checkbox") el.checked = Boolean(v);
    else if (el.dataset.type === "tri") el.value = v === true ? "yes" : v === false ? "no" : "";
    else el.value = blank(v) || Number.isNaN(v) ? "" : v;
  });
  // A verdict typed by hand in an older version stays selectable
  $("vLabel").querySelectorAll("[data-extra]").forEach(o => o.remove());
  if (bo.verdict && !VERDICTS.some(v => v.label === bo.verdict)) {
    $("vLabel").insertAdjacentHTML("beforeend", `<option data-extra>${esc(bo.verdict)}</option>`);
    $("vLabel").value = bo.verdict;
  }
  // The film's own languages (original + released in) and any already in the split, in LANGUAGES order
  const own = [...new Set([d.lang, ...(d.languages || []), ...Object.keys(bo.day1Split || {})].filter(Boolean))];
  const langs = [...LANGUAGES.filter(l => own.includes(l)), ...own.filter(l => !LANGUAGES.includes(l))];
  $("splitFields").innerHTML = langs.map((lang, i) => `
    <div class="field"><label for="split${i}">${esc(lang)}</label>
      <input id="split${i}" type="number" min="0" step="0.01" inputmode="decimal" data-split="${esc(lang)}" value="${blank(bo.day1Split?.[lang]) ? "" : esc(bo.day1Split[lang])}"></div>`).join("");
  renderSources();
  $("coNotes").value = bo.notes.join("\n");
  $("pasteText").value = "";
  showPasteResult();
  renderSummary();
  icons();
}

// ----- Day-wise table -----
function rowDate(m, day) {
  if (!Number.isInteger(day) || day < 0) return null;
  const release = parseDay(m.release);
  if (day === 0) return parseDay(m.boxOffice?.previewsDate) || (release && addDays(release, -1));
  return release && addDays(release, day - 1);
}

function renderDayTable() {
  const bo = co.draft.boxOffice;
  bo.days.sort((a, b) => (Number.isInteger(a.day) ? a.day : 1e9) - (Number.isInteger(b.day) ? b.day : 1e9));
  $("dayTable").innerHTML = bo.days.length ? `
    <table class="admin-table day-table">
      <caption class="sr-only">Day-wise India net for ${esc(co.draft.title)}, in ₹ crore</caption>
      <thead><tr>
        <th scope="col">Day</th><th scope="col">Date</th><th scope="col" class="num">Net (₹ Cr)</th>
        <th scope="col" class="num">Total so far</th><th scope="col">Note</th><th scope="col"><span class="sr-only">Remove</span></th>
      </tr></thead>
      <tbody>${bo.days.map((d, i) => `
        <tr data-i="${i}">
          <td><input class="cell-input cell-day" type="number" min="0" max="1000" step="1" value="${Number.isInteger(d.day) ? d.day : ""}" data-i="${i}" data-f="day"></td>
          <td class="date-cell"></td>
          <td class="num"><input class="cell-input cell-net" type="number" min="0" step="0.01" inputmode="decimal" value="${blank(d.net) || Number.isNaN(d.net) ? "" : d.net}" data-i="${i}" data-f="net"></td>
          <td class="num cum-cell money"></td>
          <td><input class="cell-input cell-note" maxlength="120" value="${esc(d.note)}" data-i="${i}" data-f="note"></td>
          <td class="num"><button type="button" class="icon-btn icon-btn-sm" data-remove-day="${i}"><i data-lucide="x"></i></button></td>
        </tr>`).join("")}
      </tbody>
    </table>`
    : isReleased(co.draft) && !isRecent(co.draft)
      ? `<p class="empty-line">Totals only: no day-wise figures are listed for this film, so its totals and reported opening day are used. Add days here if they're reported.</p>`
      : `<p class="empty-line">No day-wise figures yet. Add Day 1 when it's reported, or paste a table below.</p>`;
  refreshDayCells();
  icons();
}

// Dates, running totals and labels follow the day numbers as they're typed (no re-render, so focus stays put)
function refreshDayCells() {
  const p = previewFilm();
  const cum = new Map(dayRows(p).map(r => [r.day, r.cum]));
  co.draft.boxOffice.days.forEach((d, i) => {
    const row = $("dayTable").querySelector(`tr[data-i="${i}"]`);
    if (!row) return;
    const date = rowDate(co.draft, d.day);
    const label = Number.isInteger(d.day) ? dayName(d.day) : `Row ${i + 1}`;
    row.querySelector(".date-cell").innerHTML = date
      ? `<span class="${[5, 6, 0].includes(date.getDay()) && d.day > 0 ? "wkend" : ""}" title="${dayLabel(date, { weekday: true })}">${dayLabel(date, { weekday: true, year: false })}</span>`
      : `<span class="muted">–</span>`;
    row.querySelector(".cum-cell").textContent = !blank(d.net) && cum.has(d.day) ? crore(cum.get(d.day)) : "–";
    row.querySelector(".cell-day").setAttribute("aria-label", `Day number, row ${i + 1}`);
    row.querySelector(".cell-net").setAttribute("aria-label", `${label} India net in ₹ crore`);
    row.querySelector(".cell-note").setAttribute("aria-label", `${label} note`);
    row.querySelector("[data-remove-day]").setAttribute("aria-label", `Remove ${label}`);
  });
  $("addPreviews").disabled = co.draft.boxOffice.days.some(d => d.day === 0);
}

$("addDay").addEventListener("click", () => {
  const days = co.draft.boxOffice.days;
  const next = Math.max(0, ...days.map(d => d.day).filter(Number.isInteger)) + 1;
  days.push({ day: next, net: null, note: "" });
  renderDayTable();
  renderSummary();
  const i = days.findIndex(d => d.day === next);
  $("dayTable").querySelector(`tr[data-i="${i}"] .cell-net`)?.focus();
});
$("addPreviews").addEventListener("click", () => {
  co.draft.boxOffice.days.unshift({ day: 0, net: null, note: "" });
  renderDayTable();
  renderSummary();
  $("dayTable").querySelector(`tr[data-i="0"] .cell-net`)?.focus();
});
$("dayTable").addEventListener("click", e => {
  const b = e.target.closest("[data-remove-day]");
  if (!b) return;
  const i = Number(b.dataset.removeDay);
  co.draft.boxOffice.days.splice(i, 1);
  renderDayTable();
  renderSummary();
  refocus(`[data-remove-day="${i}"]`, `[data-remove-day="${i - 1}"]`);
  if (!$("dayTable").contains(document.activeElement)) $("addDay").focus();
});

// ----- Paste figures -----
// Turns pasted lines into day figures. Understands "1, 63.75", "Day 2 18.45", "Previews 21",
// "Day 19 ₹48 L", and spreadsheet rows (tab-separated, dates and % changes are ignored).
const MONTH_WORDS = "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec";
const DATE_CELL = new RegExp(`^((mon|tue|wed|thu|fri|sat|sun)[a-z]*|(${MONTH_WORDS})[a-z]*\\.?(\\s+\\d{1,2})?(,?\\s+\\d{4})?)\\.?$`, "i");   // "Sat", "Oct 3"
function parseDayFigures(text) {
  const found = new Map();
  const skipped = [];
  String(text).split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const skip = reason => skipped.push({ line: i + 1, text: line, reason });
    const cells = line.split("\t").map(c => c.trim()).filter(Boolean);
    let s = line.replace(/\t/g, " ").replace(/(\d),(?=\d{3}(?!\d))/g, "$1");   // 1,742.10 -> 1742.10
    if (/^(week|weekend|total|lifetime|overall|gross|worldwide|overseas|india|net|first|opening)\b/i.test(s)) return skip("a total, not a single day");
    let day = null;
    let m;
    // A dash counts as a separator only when a space follows it ("Day 4 - 3"); "Day 4 -3" is a negative figure
    if ((m = /^(?:paid\s+)?(?:previews?|premieres?)\b[\s:,;|=]*(?:[-–](?=\s))?\s*/i.exec(s))) day = 0;
    else if ((m = /^day\s*(\d+)\b[\s:,;|=]*(?:[-–](?=\s))?\s*/i.exec(s))) day = Number(m[1]);
    else if ((m = /^(\d{1,3})(?:\s*[,;:|=]\s*|\s+)/.exec(s))) day = Number(m[1]);
    else return skip(/^\d/.test(s) ? "no day number (try \"Day 3 18.5\")" : "no day number");
    s = s.slice(m[0].length)
      .replace(/\[[^\]]*\]|\([^)]*\)/g, " ")                                       // [1st Thursday], (Thu)
      .replace(/\b\d{4}-\d{1,2}-\d{1,2}\b|(?<![\d.])\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g, " ") // dates
      .replace(new RegExp(`(?<![\\d.])\\d{1,2}\\s+(${MONTH_WORDS})[a-z]*\\.?(\\s+\\d{4})?\\b`, "gi"), " ")
      .replace(new RegExp(`\\b(${MONTH_WORDS})[a-z]*\\.?\\s+\\d{1,2}(,?\\s+\\d{4})?\\b`, "gi"), " ")
      .replace(/\b\d+(st|nd|rd|th)\b/gi, " ")
      .replace(/₹|\brs\.?|\binr\b/gi, " ");
    const n = /(-?\d+(?:\.\d+)?)\s*(%|cr(?:ores?)?\b|crores?\b|l\b|lakhs?\b|lacs?\b)?/i.exec(s);
    if (!n) return skip("no figure");
    if (n[2] === "%") return skip("only a % change, no figure");
    let net = Number(n[1]);
    if (/^l/i.test(n[2] || "")) net = net / 100;   // lakh -> crore
    net = Math.round(net * 100) / 100;
    if (net < 0) return skip("negative figure");
    if (day > 1000) return skip("day number too large");
    if (net > 1000) return skip(`₹${net} Cr in one day looks wrong`);
    // A spreadsheet row's last cell is kept as the note when it's words, not a number or % change
    const last = cells.length >= 3 ? cells[cells.length - 1] : "";
    const note = /[a-z]{3}/i.test(last) && !/%|\bcr\b|crore|lakh/i.test(last) && !DATE_CELL.test(last) ? last.slice(0, 120) : "";
    if (found.has(day)) skipped.push({ line: found.get(day).line, text: found.get(day).text, reason: `${dayName(day)} appears again later; kept the later one` });
    found.set(day, { day, net, note, line: i + 1, text: line });
  });
  const days = [...found.values()].sort((a, b) => a.day - b.day).map(({ day, net, note }) => ({ day, net, note }));
  return { days, skipped: skipped.sort((a, b) => a.line - b.line) };
}

function showPasteResult() {
  const text = $("pasteText").value;
  pasted = text.trim() ? parseDayFigures(text) : null;
  const ready = pasted?.days.length || 0;
  $("pasteReplace").disabled = $("pasteMerge").disabled = !ready;
  if (!pasted) { $("pasteResult").innerHTML = ""; return; }
  const dayList = pasted.days.map(d => d.day);
  const names = [dayList.includes(0) ? "Previews" : "", dayList.some(d => d > 0) ? `Day ${rangeText(dayList.filter(d => d > 0), 6)}` : ""].filter(Boolean).join(", ");
  const total = pasted.days.reduce((s, d) => s + d.net, 0);
  $("pasteResult").innerHTML = `
    <p><strong>${plural(ready, "day")} ready</strong>${ready ? ` (${esc(names)}, ${crore(Math.round(total * 100) / 100)} in all)` : ""}${pasted.skipped.length ? `, ${plural(pasted.skipped.length, "line")} skipped` : ""}.</p>
    ${pasted.skipped.length ? `<ul class="skip-list">${pasted.skipped.slice(0, 8).map(s => `<li>Line ${s.line} <q>${esc(s.text.length > 50 ? s.text.slice(0, 50) + "…" : s.text)}</q>: ${esc(s.reason)}</li>`).join("")}${pasted.skipped.length > 8 ? `<li>…and ${pasted.skipped.length - 8} more</li>` : ""}</ul>` : ""}`;
}
$("pasteText").addEventListener("input", showPasteResult);

function applyPaste(mode) {
  if (!pasted?.days.length) return;
  const bo = co.draft.boxOffice;
  const count = pasted.days.length;
  if (mode === "replace") {
    bo.days = pasted.days.map(d => ({ ...d }));
  } else {
    // Pasted figures win; an existing note stays unless the paste has its own
    const byDay = new Map(bo.days.filter(d => Number.isInteger(d.day)).map(d => [d.day, d]));
    pasted.days.forEach(p => {
      const old = byDay.get(p.day);
      if (old) { old.net = p.net; if (p.note) old.note = p.note; }
      else bo.days.push({ ...p });
    });
  }
  $("pasteText").value = "";
  showPasteResult();
  renderDayTable();
  renderSummary();
  toast(`${plural(count, "day")} ${mode === "replace" ? "pasted" : "merged"}. Not saved yet`);
  $("addDay").focus();
}
$("pasteReplace").addEventListener("click", () => applyPaste("replace"));
$("pasteMerge").addEventListener("click", () => applyPaste("merge"));

// ----- Sources -----
function renderSources() {
  const list = co.draft.boxOffice.sources;
  $("sourceRows").innerHTML = list.length ? `
    <div class="table-wrap">
      <table class="admin-table edit-table source-table">
        <thead><tr><th scope="col">Title</th><th scope="col">Link</th><th scope="col"><span class="sr-only">Remove</span></th></tr></thead>
        <tbody>${list.map((s, i) => `
          <tr>
            <td><input class="cell-input" maxlength="160" value="${esc(s.title)}" data-src="title" data-i="${i}" aria-label="Source ${i + 1} title"></td>
            <td><input class="cell-input" type="url" inputmode="url" maxlength="400" placeholder="https://" value="${esc(s.url)}" data-src="url" data-i="${i}" aria-label="Source ${i + 1} link" aria-invalid="${Boolean(s.url.trim() && !isLink(s.url))}"></td>
            <td class="num"><button type="button" class="icon-btn icon-btn-sm" data-remove-src="${i}" aria-label="Remove source ${i + 1}"><i data-lucide="x"></i></button></td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>`
    : `<p class="empty-line">No sources yet. Add the pages the figures came from.</p>`;
  icons();
}
$("addSource").addEventListener("click", () => {
  co.draft.boxOffice.sources.push({ title: "", url: "" });
  renderSources();
  renderSummary();
  $("sourceRows").querySelector(`[data-src="title"][data-i="${co.draft.boxOffice.sources.length - 1}"]`)?.focus();
});
$("sourceRows").addEventListener("click", e => {
  const b = e.target.closest("[data-remove-src]");
  if (!b) return;
  co.draft.boxOffice.sources.splice(Number(b.dataset.removeSrc), 1);
  renderSources();
  renderSummary();
  $("addSource").focus();
});

// ----- Typing anywhere in the editor updates the draft and the summary -----
function setPath(obj, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  const target = keys.reduce((o, k) => (o[k] = o[k] && typeof o[k] === "object" ? o[k] : {}), obj);
  target[last] = value;
}
$("coForm").addEventListener("input", e => {
  const el = e.target, bo = co.draft?.boxOffice;
  if (!bo) return;
  if (el.dataset.f) {
    const row = bo.days[Number(el.dataset.i)];
    row[el.dataset.f] = el.dataset.f === "note" ? el.value : readNum(el);
    refreshDayCells();
  } else if (el.dataset.path) {
    const type = el.dataset.type;
    const tri = () => (el.value === "yes" ? true : el.value === "no" ? false : null);
    setPath(bo, el.dataset.path, type === "num" ? readNum(el) : type === "bool" ? el.checked : type === "tri" ? tri() : el.value);
    if (el.dataset.path === "previewsDate") refreshDayCells();
  } else if (el.dataset.split) {
    bo.day1Split = bo.day1Split || {};
    bo.day1Split[el.dataset.split] = readNum(el);
  } else if (el.dataset.src) {
    bo.sources[Number(el.dataset.i)][el.dataset.src] = el.value;
    if (el.dataset.src === "url") el.setAttribute("aria-invalid", Boolean(el.value.trim() && !isLink(el.value)));
  } else if (el.id === "coNotes") {
    bo.notes = el.value.split("\n");
  } else return;
  renderSummary();
});
$("coForm").addEventListener("submit", e => { e.preventDefault(); saveCollections(); });
$("asOfToday").addEventListener("click", () => {
  $("asOf").value = todayISO();
  $("asOf").dispatchEvent(new Event("input", { bubbles: true }));
});

// ----- Live summary -----
function renderSummary() {
  if (!co.draft) return;
  const p = previewFilm();
  const bo = p.boxOffice;
  const errs = collectionErrors(co.draft.boxOffice);
  const warns = collectionWarnings(p, co.draft.boxOffice);
  const release = parseDay(p.release);
  const prev = dayRows(p).some(d => d.day === 0) ? previewsNet(p) : 0;
  const withPrev = prev ? `incl. ${crore(prev)} previews` : "";
  const od = openingDay(p), ow = openingWeekend(p), fw = firstWeek(p), f7 = first7Days(p);
  const tracked = trackedNet(p), listed = dayRows(p).filter(d => d.day > 0).length, untracked = untrackedNet(p);
  const life = indiaNet(p), ww = worldwideGross(p), b = budget(p), multiple = budgetMultiple(p);
  const wkDays = release ? weekendLength(release) : null;
  const missing = needed => `<span class="muted">Needs ${needed}</span>`;
  const length = n => ` <span class="nowrap">(${n} days)</span>`;   // a narrow summary wraps before "(4 days)", never inside it
  const fromDays = dayRows(p).some(d => d.day === 1);
  // Older films with totals only skip the weekend and week rows: those can only come from day-wise figures
  const showDays = hasDayWise(p) || !isReleased(p) || isRecent(p);
  const rows = [
    ["Opening day", od !== null ? crore(od) : missing("Day 1 or a reported figure"), od === null ? "" : fromDays ? withPrev : "Reported opening (no Day 1 in the table)"],
    ...(showDays ? [
      [`Opening weekend${wkDays ? length(wkDays) : ""}`, ow ? crore(ow.value) : release ? missing(`Days 1–${wkDays}`) : missing("a release date"),
        ow ? [ow.extended && "Extended weekend", withPrev].filter(Boolean).join(" · ") : ""],
      [`Week 1${length(week1Length(p))}`, fw ? crore(fw.value) : missing(`Days 1–${week1Length(p)}`), fw && prev ? withPrev : ""],
      ["First 7 days", f7 !== null ? crore(f7) : missing("Days 1–7"), f7 !== null ? withPrev : ""],
      ["Day-wise total", crore(tracked), listed ? `${plural(listed, "day")} listed${prev ? " + previews" : ""}` : ""],
      ["Not listed day by day", crore(untracked), untracked !== null ? "Lifetime minus the listed days" : ""],
    ] : [
      ["Day by day", `<span class="muted">Not listed</span>`, "Totals only: weekend and week figures need day-wise collections"],
    ]),
    ["Lifetime India net", crore(life), life === null ? "" : toNum(bo.totals?.indiaNet) !== null ? "Reported" : "From the day-wise total"],
    ["Worldwide gross", crore(ww), ww === null ? "" : toNum(bo.totals?.worldwideGross) !== null ? "Reported" : "India gross + overseas"],
    ["Budget", b ? croreRange(b.low, b.high) : "–", multiple !== null ? `India net is ${multiple.toFixed(2)}× the budget` : ""],
  ];
  const v = verdict(p);
  const verdictCell = !isReleased(p) ? `<span class="muted">After release</span>` : v ? verdictHTML(p) : missing("a verdict or budget");
  const dirty = isCoDirty();
  $("coState").textContent = dirty ? "Unsaved changes" : "All changes saved";
  $("coState").classList.toggle("dirty", dirty);
  $("openingUse").innerHTML = openingUseHTML(p);
  const when = isReleased(p) ? `Released${releasedWhen(p) ? " " + esc(releasedWhen(p)) : ""}` : release ? `Releases ${countdown(daysUntil(p))}` : esc(releaseLabel(p));
  $("coSummary").innerHTML = `
    <div class="sum-head">
      <strong>${esc(p.title)}</strong>
      <small>${p.lang ? `${esc(p.lang)} · ` : ""}${when}${bo.asOf ? ` · as of ${esc(dayLabel(bo.asOf))}` : ""}</small>
    </div>
    <dl class="sum-list">
      ${rows.map(([k, val, note]) => `<div class="sum-row"><dt>${k}</dt><dd class="money">${val}</dd>${note ? `<dd class="sum-note">${esc(note)}</dd>` : ""}</div>`).join("")}
      <div class="sum-row"><dt>Verdict</dt><dd>${verdictCell}</dd>${v?.indicative ? `<dd class="sum-note">Indicative, from India net vs budget</dd>` : v?.source ? `<dd class="sum-note sum-source">${esc(v.source)}</dd>` : ""}</div>
    </dl>
    <ul class="check-list" id="coChecks">
      ${errs.map(t => `<li class="check-error"><i data-lucide="circle-x"></i><span>${esc(t)}</span></li>`).join("")}
      ${warns.map(t => `<li class="check-warn"><i data-lucide="triangle-alert"></i><span>${esc(t)}</span></li>`).join("")}
      ${!errs.length && !warns.length ? `<li class="check-ok"><i data-lucide="check-circle-2"></i><span>${listed || life !== null || ww !== null || od !== null ? "Figures add up." : "No figures yet."}</span></li>` : ""}
    </ul>
    <div class="sum-actions">
      <button type="button" class="btn btn-primary btn-block" data-co-save><i data-lucide="save"></i> Save changes</button>
      ${dirty ? `<button type="button" class="link-btn" data-co-discard>Discard changes</button>` : ""}
    </div>`;
  icons();
}

function saveCollections() {
  if (!co.draft) return;
  const errs = collectionErrors(co.draft.boxOffice);
  if (errs.length) {
    toast(`Fix ${plural(errs.length, "problem")} before saving`);
    $("coChecks")?.scrollIntoView({ block: "nearest" });
    return;
  }
  const movies = db.movies();
  const m = findFilm(movies, co.id);
  if (!m) { toast("That film was deleted."); co.id = co.draft = null; return renderCollections(); }
  m.boxOffice = cleanBoxOffice(co.draft.boxOffice);
  if (!saveStore(MOVIES_KEY, movies)) return toast(SAVE_FAILED);
  const fromSummary = Boolean(document.activeElement?.closest("#coSummary"));
  loadCollections(findFilm(db.movies(), co.id));   // read back exactly what was stored
  renderCoForm();
  toast(`${m.title}: collections saved`);
  if (fromSummary) refocus("[data-co-save]");
}
$("coSaveTop").addEventListener("click", saveCollections);
$("coSummary").addEventListener("click", e => {
  if (e.target.closest("[data-co-save]")) saveCollections();
  if (e.target.closest("[data-co-discard]") && confirm(`Discard your unsaved changes to ${co.draft.title}?`)) {
    loadCollections(findFilm(db.movies(), co.id));
    renderCoForm();
    $("coFilm").focus();
  }
});
$("coFilm").addEventListener("change", e => {
  const id = Number(e.target.value);
  if (isCoDirty() && !confirm(`You have unsaved changes to ${co.draft.title}'s collections. Switch film without saving?`)) {
    e.target.value = co.id;
    return;
  }
  co.id = id;
  co.draft = null;
  rememberFilm(CO_KEY, id);
  renderCollections();
});
$("coExport").addEventListener("click", () => {
  const p = previewFilm();
  const rows = dayRows(p);
  if (!rows.length) return toast("No day-wise figures to export");
  const csv = toCsv([
    ["Day", "Date", "India net (₹ Cr)", "Running total (₹ Cr)"],
    ...rows.map(r => [r.label, r.date ? isoDay(r.date) : "", r.net, r.cum ?? ""]),
  ]);
  download(`${slug(p.title)}-day-wise-${todayISO()}.csv`, "﻿" + csv, "text/csv");
  toast(`Exported ${plural(rows.length, "day")}${isCoDirty() ? ", including unsaved changes" : ""}`);
});

// ---------- Ratings: critics and IMDb ----------
const RT_KEY = "manaAdminRatingsFilm";
const rt = { id: null, draft: null, snapshot: "" };
let rvFilter = "";

function isRtDirty() {
  return Boolean(rt.draft) && JSON.stringify(cleanCritics(rt.draft.critics)) !== rt.snapshot;
}
function renderRatings() {
  renderCritics();
  renderReviews();
}

function renderCritics() {
  const movies = db.movies();
  $("rtForm").hidden = !movies.length;
  $("rtEmpty").hidden = Boolean(movies.length);
  if (!movies.length) { rt.id = rt.draft = null; $("rtFilm").innerHTML = ""; return; }
  if (!findFilm(movies, rt.id)) rt.id = findFilm(movies, storedFilm(RT_KEY))?.id ?? defaultFilmId(movies);
  if (!rt.draft || rt.draft.id !== rt.id) loadCritics(findFilm(movies, rt.id));
  fillPicker($("rtFilm"), $("rtFind"), $("rtFindCount"), movies, rt.id);
  const imdb = rt.draft.critics.imdb;
  $("imdbScore").value = blank(imdb.score) || Number.isNaN(imdb.score) ? "" : imdb.score;
  $("imdbVotes").value = imdb.votes;
  $("imdbAsOf").value = imdb.asOf;
  renderCriticRows();
  renderCriticsPreview();
}
wirePicker($("rtFilm"), $("rtFind"), $("rtFindCount"), () => fillPicker($("rtFilm"), $("rtFind"), $("rtFindCount"), db.peek(), rt.id));

function loadCritics(m) {
  const draft = structuredClone(m);
  const c = draft.critics = draft.critics || {};
  c.imdb = { score: toNum(c.imdb?.score), votes: String(c.imdb?.votes ?? ""), asOf: c.imdb?.asOf || "" };
  c.reviews = (c.reviews || []).map(r => ({ outlet: r.outlet || "", score: toNum(r.score), outOf: toNum(r.outOf) ?? 5, url: r.url || "" }));
  rt.draft = draft;
  rt.snapshot = JSON.stringify(cleanCritics(c));
  rt.id = m.id;
  rememberFilm(RT_KEY, m.id);
}

function cleanCritics(src) {
  const c = structuredClone(src || {});
  const i = c.imdb || {};
  if (blank(i.score)) delete c.imdb;
  else c.imdb = { score: i.score, votes: String(i.votes || "").trim(), asOf: i.asOf || "" };
  c.reviews = (c.reviews || [])
    .filter(r => String(r.outlet || "").trim() || !blank(r.score))
    .map(r => {
      const row = { outlet: String(r.outlet || "").trim(), score: r.score, outOf: r.outOf };
      if (String(r.url || "").trim()) row.url = String(r.url).trim();
      return row;
    });
  return c;
}

function criticsErrors(c) {
  const errs = [];
  const i = c.imdb;
  if (Number.isNaN(i.score) || (!blank(i.score) && (i.score <= 0 || i.score > 10))) errs.push("IMDb score must be between 0.1 and 10.");
  if (blank(i.score) && (String(i.votes).trim() || i.asOf)) errs.push("Add the IMDb score, or clear its votes and date.");
  c.reviews.forEach((r, n) => {
    const name = String(r.outlet).trim() || `Critic ${n + 1}`;
    if (!String(r.outlet).trim() && blank(r.score)) return;   // empty row, dropped on save
    if (!String(r.outlet).trim()) errs.push(`Critic ${n + 1} needs the outlet's name.`);
    if (Number.isNaN(r.score) || Number.isNaN(r.outOf)) errs.push(`${name}: the score isn't a number.`);
    else if (blank(r.score)) errs.push(`${name} needs a score.`);
    else if (blank(r.outOf) || r.outOf <= 0) errs.push(`${name}: "out of" must be more than 0.`);
    else if (r.score < 0) errs.push(`${name}: the score can't be negative.`);
    else if (r.score > r.outOf) errs.push(`${name}: ${r.score} is more than ${r.outOf}.`);
    if (String(r.url).trim() && !isLink(r.url)) errs.push(`${name}: the link must start with http:// or https://.`);
  });
  return errs;
}

function renderCriticRows() {
  const list = rt.draft.critics.reviews;
  $("criticRows").innerHTML = list.length ? `
    <table class="admin-table edit-table critic-table">
      <caption class="sr-only">Critics' scores for ${esc(rt.draft.title)}</caption>
      <thead><tr><th scope="col">Outlet</th><th scope="col">Score</th><th scope="col">Out of</th><th scope="col">Link</th><th scope="col"><span class="sr-only">Remove</span></th></tr></thead>
      <tbody>${list.map((r, i) => `
        <tr>
          <td><input class="cell-input" maxlength="80" value="${esc(r.outlet)}" data-cf="outlet" data-i="${i}" aria-label="Critic ${i + 1} outlet"></td>
          <td><input class="cell-input cell-score" type="number" min="0" step="0.25" inputmode="decimal" value="${blank(r.score) || Number.isNaN(r.score) ? "" : r.score}" data-cf="score" data-i="${i}" aria-label="Critic ${i + 1} score"></td>
          <td><input class="cell-input cell-score" type="number" min="1" step="1" value="${blank(r.outOf) || Number.isNaN(r.outOf) ? "" : r.outOf}" data-cf="outOf" data-i="${i}" aria-label="Critic ${i + 1} score out of"></td>
          <td><input class="cell-input" type="url" inputmode="url" maxlength="400" placeholder="https://" value="${esc(r.url)}" data-cf="url" data-i="${i}" aria-label="Critic ${i + 1} review link" aria-invalid="${Boolean(r.url.trim() && !isLink(r.url))}"></td>
          <td class="num"><button type="button" class="icon-btn icon-btn-sm" data-remove-critic="${i}" aria-label="Remove ${esc(r.outlet || `critic ${i + 1}`)}"><i data-lucide="x"></i></button></td>
        </tr>`).join("")}
      </tbody>
    </table>`
    : `<p class="empty-line">No critics' scores yet.</p>`;
  icons();
}

function renderCriticsPreview() {
  if (!rt.draft) return;
  const p = { ...rt.draft, critics: cleanCritics(rt.draft.critics) };
  const cs = criticsScore(p), imdb = imdbScore(p), overall = overallScore(p), aud = audienceScore(p.id);
  $("rtPreview").innerHTML = `
    <div><small>Critics</small>${cs ? `<strong class="score">${cs.score.toFixed(1)}/10</strong> ${starsHTML(cs.score / 2, { size: "sm" })}<em>${plural(cs.count, "critic")}</em>` : `<strong>–</strong><em>None yet</em>`}</div>
    <div><small>IMDb</small>${imdb ? `<strong class="score">${imdb.score.toFixed(1)}/10</strong><em>${imdb.votes ? esc(imdb.votes) + " votes" : "Votes not given"}${imdb.asOf ? ` · ${esc(dayLabel(imdb.asOf))}` : ""}</em>` : `<strong>–</strong><em>Not added</em>`}</div>
    <div><small>Audience</small>${aud.avg !== null ? `<strong class="score">${aud.avg.toFixed(1)}/5</strong><em>${plural(aud.count, "rating")}${aud.early ? " · early" : ""}</em>` : `<strong>–</strong><em>No ratings</em>`}</div>
    <div><small>Overall</small><strong class="score">${overall !== null ? `${overall.toFixed(1)}/10` : "–"}</strong><em>Used for Top rated</em></div>`;
  const errs = criticsErrors(rt.draft.critics);
  $("rtChecks").innerHTML = errs.map(t => `<li class="check-error"><i data-lucide="circle-x"></i><span>${esc(t)}</span></li>`).join("");
  const dirty = isRtDirty();
  $("rtState").textContent = dirty ? "Unsaved changes" : "";
  $("rtState").classList.toggle("dirty", dirty);
  $("rtDiscard").hidden = !dirty;
  icons();
}

$("rtForm").addEventListener("input", e => {
  const el = e.target, c = rt.draft?.critics;
  if (!c) return;
  if (el.dataset.imdb) c.imdb[el.dataset.imdb] = el.dataset.imdb === "score" ? readNum(el) : el.value;
  else if (el.dataset.cf) {
    const key = el.dataset.cf;
    c.reviews[Number(el.dataset.i)][key] = key === "score" || key === "outOf" ? readNum(el) : el.value;
    if (key === "url") el.setAttribute("aria-invalid", Boolean(el.value.trim() && !isLink(el.value)));
  } else return;
  renderCriticsPreview();
});
$("addCritic").addEventListener("click", () => {
  const list = rt.draft.critics.reviews;
  list.push({ outlet: "", score: null, outOf: 5, url: "" });
  renderCriticRows();
  renderCriticsPreview();
  $("criticRows").querySelector(`[data-cf="outlet"][data-i="${list.length - 1}"]`)?.focus();
});
$("criticRows").addEventListener("click", e => {
  const b = e.target.closest("[data-remove-critic]");
  if (!b) return;
  const i = Number(b.dataset.removeCritic);
  rt.draft.critics.reviews.splice(i, 1);
  renderCriticRows();
  renderCriticsPreview();
  refocus(`[data-remove-critic="${i}"]`, `[data-remove-critic="${i - 1}"]`);
  if (!$("criticRows").contains(document.activeElement)) $("addCritic").focus();
});
$("imdbToday").addEventListener("click", () => {
  $("imdbAsOf").value = todayISO();
  $("imdbAsOf").dispatchEvent(new Event("input", { bubbles: true }));
});
$("rtFilm").addEventListener("change", e => {
  const id = Number(e.target.value);
  if (isRtDirty() && !confirm(`You have unsaved changes to ${rt.draft.title}'s critics scores. Switch film without saving?`)) {
    e.target.value = rt.id;
    return;
  }
  rt.id = id;
  rt.draft = null;
  rememberFilm(RT_KEY, id);
  renderCritics();
});
$("rtDiscard").addEventListener("click", () => {
  if (!confirm(`Discard your unsaved changes to ${rt.draft.title}'s critics scores?`)) return;
  loadCritics(findFilm(db.movies(), rt.id));
  renderCritics();
  $("rtFilm").focus();
});
$("rtForm").addEventListener("submit", e => {
  e.preventDefault();
  const errs = criticsErrors(rt.draft.critics);
  if (errs.length) {
    toast(`Fix ${plural(errs.length, "problem")} before saving`);
    return;
  }
  const movies = db.movies();
  const m = findFilm(movies, rt.id);
  if (!m) { toast("That film was deleted."); rt.id = rt.draft = null; return renderCritics(); }
  m.critics = cleanCritics(rt.draft.critics);
  if (!saveStore(MOVIES_KEY, movies)) return toast(SAVE_FAILED);
  loadCritics(findFilm(db.movies(), rt.id));
  renderCritics();
  toast(`${m.title}: ratings saved`);
});

// ---------- Ratings: audience review moderation ----------
function renderReviews() {
  const films = new Map(db.peek().map(m => [m.id, m]));
  const titles = new Map([...films].map(([id, m]) => [id, m.title]));
  const all = db.reviews().sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const counts = new Map();
  all.forEach(r => counts.set(r.movieId, (counts.get(r.movieId) || 0) + 1));
  const filmName = id => titles.get(id) || `Deleted film #${id}`;   // the number tells deleted films apart
  if (rvFilter && !counts.has(Number(rvFilter))) rvFilter = "";
  // Films with reviews, grouped by language (A-Z inside each); reviews of deleted films last
  const reviewed = [...counts.keys()].filter(id => films.has(id)).map(id => films.get(id));
  const opt = id => `<option value="${esc(String(id))}">${esc(filmName(id))} (${counts.get(id)})</option>`;
  const group = (label, ids) => (ids.length ? `<optgroup label="${esc(label)}">${ids.sort((a, b) => filmName(a).localeCompare(filmName(b))).map(opt).join("")}</optgroup>` : "");
  $("rvFilm").innerHTML = `<option value="">All films (${all.length})</option>` +
    languagesIn(reviewed).map(lang => group(lang, reviewed.filter(m => m.lang === lang).map(m => m.id))).join("") +
    group("Language not set", reviewed.filter(m => !m.lang).map(m => m.id)) +
    group("Deleted films", [...counts.keys()].filter(id => !films.has(id)));
  $("rvFilm").value = rvFilter;
  const q = $("rvSearch").value.trim().toLowerCase();
  const list = all.filter(r => (!rvFilter || r.movieId === Number(rvFilter)) &&
    (!q || [r.name, r.text, filmName(r.movieId)].join(" ").toLowerCase().includes(q)));
  const hidden = all.filter(r => r.hidden).length;
  $("rvFilm").closest(".filter-bar").hidden = !all.length;   // nothing to filter or search yet
  $("reviewCount").textContent = all.length ? `${plural(all.length, "review")} · ${hidden} hidden` : "";
  $("reviewTable").innerHTML = list.length ? `
    <table class="admin-table review-table">
      <thead><tr><th scope="col">Film</th><th scope="col">Name</th><th scope="col">Stars</th><th scope="col">Review</th><th scope="col">Posted</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
      <tbody>${list.map(r => {
        const id = esc(String(r.id));
        const long = String(r.text || "").length > 120;
        return `
        <tr class="${r.hidden ? "is-hidden" : ""}">
          <td class="rv-film">${esc(filmName(r.movieId))}</td>
          <td class="rv-name"><strong>${esc(r.name)}</strong></td>
          <td>${starsHTML(r.stars, { size: "sm" })}</td>
          <td class="rv-cell">
            ${r.text ? `<p class="rv-text${long ? " clamp" : ""}" id="rv-${id}">${esc(r.text)}</p>` : `<p class="muted">Stars only</p>`}
            ${long ? `<button type="button" class="link-btn" data-expand aria-expanded="false" aria-controls="rv-${id}">Show all</button>` : ""}
          </td>
          <td class="nowrap">${timeCellHTML(r.at)}</td>
          <td><span class="chip ${r.hidden ? "" : "chip-ok"}">${r.hidden ? "Hidden" : "Visible"}</span></td>
          <td class="num actions-cell">
            <button type="button" class="link-btn" data-toggle-review="${id}">${r.hidden ? "Show" : "Hide"}<span class="sr-only"> ${esc(r.name)}'s review</span></button>
            <button type="button" class="link-btn danger" data-del-review="${id}">Delete<span class="sr-only"> ${esc(r.name)}'s review</span></button>
          </td>
        </tr>`;
      }).join("")}
      </tbody>
    </table>`
    : `<div class="admin-empty"><i data-lucide="message-square"></i><p>${all.length ? "No reviews match." : "No audience reviews yet. Visitors rate released films on each film's page."}</p></div>`;
  icons();
}
$("rvFilm").addEventListener("change", e => { rvFilter = e.target.value; renderReviews(); });
$("rvSearch").addEventListener("input", renderReviews);
$("reviewTable").addEventListener("click", e => {
  const more = e.target.closest("[data-expand]");
  if (more) {
    const open = more.getAttribute("aria-expanded") !== "true";
    $(more.getAttribute("aria-controls")).classList.toggle("clamp", !open);
    more.setAttribute("aria-expanded", open);
    more.textContent = open ? "Show less" : "Show all";
    return;
  }
  const toggle = e.target.closest("[data-toggle-review]");
  const del = e.target.closest("[data-del-review]");
  if (!toggle && !del) return;
  const id = (toggle || del).dataset[toggle ? "toggleReview" : "delReview"];
  const list = db.reviews();
  const r = list.find(x => String(x.id) === id);
  if (!r) return renderReviews();
  if (del && !confirm(`Delete ${r.name}'s review? This can't be undone.`)) return;
  const next = toggle ? list.map(x => (x === r ? { ...x, hidden: !x.hidden } : x)) : list.filter(x => x !== r);
  if (!saveStore(REVIEWS_KEY, next)) return toast(SAVE_FAILED);
  renderReviews();
  renderCriticsPreview();   // the audience score next to the critics changes too
  toast(toggle ? (r.hidden ? "Review visible again" : "Review hidden from the website") : "Review deleted");
  if (toggle) refocus(`[data-toggle-review="${CSS.escape(id)}"]`, "#rvSearch");
  else ($("rvSearch").offsetParent ? $("rvSearch") : $("viewTitle")).focus();   // the search is hidden once the last review is gone
});

// ---------- Messages ----------
const TOPIC_VIEW = { "Ratings or reviews": "ratings" };   // other topics with a film open its collections
const MAILTO_SAFE = /^[^\s@?&%#\/:]+@[^\s@?&%#\/:]+\.[^\s@?&%#\/:]+$/;   // no ?, &, % or # that would add mailto fields

function renderMessages() {
  const list = db.messages().slice().sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const titles = new Map(db.movies().map(m => [m.id, m.title]));
  const unread = list.filter(m => !m.read).length;
  $("msgCount").textContent = list.length ? `${plural(list.length, "message")} · ${unread} unread` : "";
  $("markAllRead").disabled = !unread;
  $("messageList").innerHTML = list.length ? list.map(m => {
    const id = esc(String(m.id));
    const hasFilm = !blank(m.movieId);
    const film = hasFilm ? titles.get(Number(m.movieId)) : null;
    const view = TOPIC_VIEW[m.topic] || "collections";
    return `
    <article class="panel message${m.read ? "" : " unread"}">
      <div class="message-head">
        <div><strong>${esc(m.name || "Anonymous")}</strong>${m.email ? (MAILTO_SAFE.test(String(m.email)) ? ` <a href="mailto:${esc(m.email)}">${esc(m.email)}</a>` : ` <span class="muted">${esc(m.email)}</span>`) : ""}</div>
        <div class="chip-row">
          ${m.read ? "" : `<span class="chip chip-new">New</span>`}
          <span class="chip">${esc(m.topic || "Other feedback")}</span>
          ${hasFilm ? `<span class="chip chip-film"><i data-lucide="film"></i> ${film ? esc(film) : "Deleted film"}</span>` : ""}
        </div>
      </div>
      <p>${esc(m.message)}</p>
      <div class="message-foot">
        <small class="muted">${fmtTime(m.at)}</small>
        <span>
          ${film ? `<button type="button" class="link-btn" data-goto="${view}" data-film="${Number(m.movieId)}"><i data-lucide="${view === "ratings" ? "star" : "bar-chart-3"}"></i> Open ${view === "ratings" ? "ratings" : "collections"}</button>` : ""}
          ${m.read ? "" : `<button type="button" class="link-btn" data-read="${id}"><i data-lucide="check"></i> Mark read</button>`}
          <button type="button" class="link-btn danger" data-del-msg="${id}"><i data-lucide="trash-2"></i> Delete</button>
        </span>
      </div>
    </article>`;
  }).join("") : `<div class="admin-empty"><i data-lucide="inbox"></i><p>No messages yet. The feedback form on the website sends them here.</p></div>`;
  updateBadge();
  icons();
}
$("messageList").addEventListener("click", e => {
  const r = e.target.closest("[data-read]");
  const d = e.target.closest("[data-del-msg]");
  if (!r && !d) return;
  let list = db.messages();
  if (r) list = list.map(m => (String(m.id) === r.dataset.read ? { ...m, read: true } : m));
  if (d) {
    const msg = list.find(m => String(m.id) === d.dataset.delMsg);
    if (!msg || !confirm(`Delete the message from ${msg.name || "Anonymous"}? This can't be undone.`)) return;
    list = list.filter(m => m !== msg);
  }
  if (!saveStore(MESSAGES_KEY, list)) return toast(SAVE_FAILED);
  renderMessages();
  toast(r ? "Marked as read" : "Message deleted");
  ($("markAllRead").disabled ? $("viewTitle") : $("markAllRead")).focus();
});
$("markAllRead").addEventListener("click", () => {
  if (!saveStore(MESSAGES_KEY, db.messages().map(m => ({ ...m, read: true })))) return toast(SAVE_FAILED);
  renderMessages();
  toast("All messages marked as read");
  $("viewTitle").focus();
});

// ---------- Settings: backup, restore, reset ----------
$("backupBtn").addEventListener("click", () => {
  // catalog: which catalogue the films already include (data.js CATALOG_VERSION), so a restore knows what to add back
  const backup = { app: "mana-cinema", version: DATA_VERSION, catalog: CATALOG_VERSION, exportedAt: new Date().toISOString(), movies: db.movies(), reviews: db.reviews(), messages: db.messages() };
  download(`mana-cinema-backup-${todayISO()}.json`, JSON.stringify(backup, null, 2), "application/json");
  toast(`Backup ready: ${plural(backup.movies.length, "film")}, ${plural(backup.reviews.length, "review")}, ${plural(backup.messages.length, "message")}`);
});

// Why a backup can't be restored, or "" when it's fine
function backupProblem(d) {
  if (!d || typeof d !== "object" || Array.isArray(d) || d.app !== "mana-cinema") return "That file isn't a MANA CINEMA backup.";
  if (d.version !== DATA_VERSION) return "This backup is from another version of the site, so it can't be restored here.";
  if (!Array.isArray(d.movies) || !Array.isArray(d.reviews) || !Array.isArray(d.messages)) return "The backup is missing its films, reviews or messages.";
  const bad = d.movies.findIndex(m => !m || typeof m !== "object" || !(Number.isInteger(m.id) && m.id > 0) || typeof m.title !== "string" || !m.title.trim());
  if (bad >= 0) return `Film ${bad + 1} in the backup has no valid id (a whole number from 1 up) or no title.`;
  if (new Set(d.movies.map(m => m.id)).size !== d.movies.length) return "Two films in the backup share the same id.";
  // Lists the pages loop over: one wrong type would stop every page that shows films
  const isList = (v, each = () => true) => !v || (Array.isArray(v) && v.every(each));
  const isRecord = x => x && typeof x === "object" && !Array.isArray(x);
  const damaged = d.movies.find(m => !isList(m.languages) || !isList(m.colors)
    || !isList(m.boxOffice?.days, isRecord) || !isList(m.boxOffice?.sources) || !isList(m.boxOffice?.notes)
    || !isList(m.critics?.reviews, isRecord));
  if (damaged) return `${damaged.title} has damaged languages, colours, collections or ratings in the backup, so it can't be restored.`;
  const badReview = d.reviews.findIndex(r => !isRecord(r)
    || !Number.isInteger(r.movieId) || !Number.isInteger(r.stars) || r.stars < 1 || r.stars > 5
    || typeof (r.name ?? "") !== "string" || typeof (r.text ?? "") !== "string" || typeof (r.at ?? "") !== "string");
  if (badReview >= 0) return `Review ${badReview + 1} in the backup is damaged. Each review needs a film number and 1 to 5 stars.`;
  if (!d.messages.every(isRecord)) return "Some messages in the backup are damaged.";
  return "";
}

$("restoreFile").addEventListener("change", async e => {
  const file = e.target.files[0];
  e.target.value = "";   // so the same file can be picked again
  // Problems show in red; "cancelled" is just information
  const say = (text, isError = true) => {
    $("restoreMsg").textContent = text;
    $("restoreMsg").classList.toggle("is-info", !isError);
  };
  say("");
  if (!file) return;
  let data;
  try { data = JSON.parse(await file.text()); } catch { return say("That file isn't a valid backup (it can't be read as JSON)."); }
  const problem = backupProblem(data);
  if (problem) return say(problem);
  const made = new Date(data.exportedAt);
  const when = Number.isNaN(made.getTime()) ? "" : ` made on ${fmtTime(made)}`;
  // A backup made before the all-India catalogue has no catalog number and none of films 1001+
  const older = !(Number(data.catalog) >= CATALOG_VERSION);
  const added = older ? " Films added to the site's catalogue since this backup was made are added back." : "";
  if (!confirm(`Restore ${plural(data.movies.length, "film")}, ${plural(data.reviews.length, "audience review")} and ${plural(data.messages.length, "message")} from the backup${when}?\n\nThis replaces the films, reviews and messages in this browser.${added}`)) return say("Restore cancelled. Nothing changed.", false);
  // All three keys or none: if a write fails, put back what was there, newest write first
  const keys = [MOVIES_KEY, REVIEWS_KEY, MESSAGES_KEY];
  let before;
  try { before = keys.map(k => localStorage.getItem(k)); } catch { return say(SAVE_FAILED); }
  if (!saveStore(MOVIES_KEY, data.movies) || !saveStore(REVIEWS_KEY, data.reviews) || !saveStore(MESSAGES_KEY, data.messages)) {
    for (let i = keys.length - 1; i >= 0; i--) {
      try { before[i] === null ? localStorage.removeItem(keys[i]) : localStorage.setItem(keys[i], before[i]); } catch {}
    }
    return say("Couldn't restore: the backup is too big for this browser's storage, or storage is blocked. Nothing was changed.");
  }
  // data.js adds the newer catalogue's films on the reload unless the backup already had them
  // (films the admin deleted in a newer backup stay deleted)
  try { older ? localStorage.removeItem("manaCatalog") : localStorage.setItem("manaCatalog", String(Number(data.catalog))); } catch {}
  co.draft = rt.draft = null;   // nothing left to guard; the page reloads with the restored data
  location.reload();
});

const RESETS = {
  films: { key: MOVIES_KEY, ask: "Restore the original films and collections? Films you added and every edit you made are removed.", done: "Original films and collections restored" },
  reviews: { key: REVIEWS_KEY, ask: "Delete all audience reviews stored in this browser?", done: "All audience reviews deleted" },
  messages: { key: MESSAGES_KEY, ask: "Delete all messages?", done: "All messages deleted" },
};
document.querySelectorAll("[data-reset]").forEach(btn => btn.addEventListener("click", () => {
  const r = RESETS[btn.dataset.reset];
  if (!confirm(`${r.ask} This can't be undone.`)) return;
  try { localStorage.removeItem(r.key); } catch { return toast(SAVE_FAILED); }
  if (r.key === MOVIES_KEY) co.id = co.draft = rt.id = rt.draft = null;
  updateBadge();
  toast(r.done);
}));

// ---------- Start ----------
if (signedIn()) showApp();
else $("adminPass").focus();
