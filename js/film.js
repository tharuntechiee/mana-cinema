// Film page: header, key box-office numbers, day-by-day chart and table, ratings,
// audience reviews, sources and more films. Every figure comes from js/boxoffice.js;
// this file only lays it out.

const $ = id => document.getElementById(id);
const film = getMovie(new URLSearchParams(location.search).get("id"));

// ---------- Small helpers ----------
// Every date goes through dayLabel() in boxoffice.js: "Thu 25 Sep" in day lists, "25 Sep 2025" elsewhere
// (the en-IN locale would give the ninth month a four-letter name and add commas)
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];   // a weekday name on its own
const shortDate = d => (d ? dayLabel(d, { weekday: true, year: false }) : "–");
const longDate = d => (d ? dayLabel(d) : "");
const isoLabel = iso => dayLabel(iso);
const icon = name => `<i data-lucide="${name}"></i>`;
const plural = (n, one, many = one + "s") => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;
const crWhole = v => croreRange(v, v);                       // "₹308 Cr", for round headline figures
const compactCount = n => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);   // 12345678 -> "12.3M"
const trendClass = x => (x > 0 ? "up" : x < 0 ? "down" : "");
const NOT_REPORTED = `<span class="not-reported">Not reported</span>`;
const DASH = `<span class="muted">–</span>`;
const NEW_TAB = `<span class="sr-only"> (opens in a new tab)</span>`;
// Credits IMDb's and TMDB's terms ask for wherever their data is shown
const IMDB_CREDIT = `Information courtesy of IMDb (<a class="text-link" href="https://www.imdb.com" target="_blank" rel="noopener">imdb.com</a>). Used with permission.`;
const TMDB_CREDIT = `This website uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by <a class="text-link" href="https://www.themoviedb.org" target="_blank" rel="noopener">TMDB</a>.`;

// Only plain web links become clickable; anything else stays text
function safeUrl(u) {
  const s = String(u || "").trim();
  return /^https?:\/\//i.test(s) ? s : "";
}
function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

// "2 days ago" for recent dates, then the plain date
function ago(iso) {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "Just now";
  if (s < 3600) return `${plural(Math.floor(s / 60), "minute")} ago`;
  if (s < 86400) return `${plural(Math.floor(s / 3600), "hour")} ago`;
  const days = Math.floor(s / 86400);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return longDate(t);
}

// "Releases in 2 days · Fri 16 Oct 2026", or the release note when there is no exact date
function countdownText(m) {
  const d = parseDay(m.release);
  if (!d) return m.releaseNote ? `Expected ${m.releaseNote}` : "Release date to be announced";
  return `${countdown(m)} · ${dayLabel(d, { weekday: true })}`;
}
// "Releases in 2 days" / "Releases tomorrow" / "Releases today"
function countdown(m) {
  const n = daysUntil(m);
  return n <= 0 ? "Releases today" : n === 1 ? "Releases tomorrow" : `Releases in ${n} days`;
}
// The header pill next to "Releasing 16 Oct 2026": "In 12 days" / "Tomorrow" / "Today"
function countdownPill(m) {
  const n = daysUntil(m);
  return n <= 0 ? "Today" : n === 1 ? "Tomorrow" : `In ${n} days`;
}

// Short verdict source for the header: "Sacnilk. Koimoi disagrees: ..." -> "per Sacnilk";
// a generic "Trade consensus: ..." -> "per trade consensus" (lower case, so it doesn't read like an outlet)
function verdictNote(v) {
  const who = v.source ? v.source.split(/[.:;]\s/)[0] : "";
  const parts = [v.indicative ? "Indicative, from India net vs budget" : who ? `per ${/^trade\b/i.test(who) ? who.toLowerCase() : who}` : "Trade verdict"];
  if (v.running) parts.push("still in theatres");
  return parts.join(" · ");
}

function sectionHead(id, title, note = "") {
  return `<div class="film-section-head"><h2 id="${id}">${title}</h2>${note ? `<p class="fine-print">${note}</p>` : ""}</div>`;
}
function emptyState(iconName, text) {
  return `<div class="empty-state"><div class="empty-icon">${icon(iconName)}</div><p>${text}</p></div>`;
}

// ---------- Film kinds ----------
// Most films in the all-India lists have totals only (no day-wise rows, synopsis or critics).
// Those pages lead with the key numbers and skip the empty charts.
const hasFigures = m => [openingDay(m), indiaNet(m), worldwideGross(m), indiaGross(m), overseasGross(m)].some(v => v !== null);
// A lifetime total of exactly 0 means there is no figure to show (say, no India release):
// it reads "Not reported", never ₹0, the same as on the Lists page
const shown = v => (v === null || v === 0 ? null : v);
const isTotalsOnly = m => isReleased(m) && !dayRows(m).length && hasFigures(m);

// Lists page links for a language: lists.html?lang=Hindi&list=top|opening
const listHref = (lang, list) => `lists.html?lang=${encodeURIComponent(lang)}&amp;list=${list}`;
// How long that list is (LANGUAGE_INFO). Same fallback as js/lists.js: a language without an entry
// (one the admin added) gets the short lists, so a rank chip never points past the end of its list
function listLimit(lang, key) {
  const info = typeof LANGUAGE_INFO !== "undefined" && Object.hasOwn(LANGUAGE_INFO, lang) ? LANGUAGE_INFO[lang] || {} : {};
  const n = Number(info[key]);
  return Number.isInteger(n) && n > 0 ? n : key === "top" ? 10 : 8;
}

// Films without artwork or a photo (most list films) get their title on the gradient, so the poster isn't blank
// (cards already print the year and genre under the poster, so they pass { sub: false })
function filmPoster(m, { sub: withSub = true } = {}) {
  if (posterImage(m) || Object.hasOwn(HEROES, m.art || "")) return posterHTML(m, { compact: true });
  const sub = withSub ? [m.lang, m.year].filter(Boolean).join(" · ") : "";
  return `
    <div class="poster poster-text" style="${posterStyle(m)}" aria-hidden="true">
      <span class="poster-title">${esc(m.title)}</span>
      ${sub ? `<span class="poster-lang">${esc(sub)}</span>` : ""}
    </div>`;
}

// ---------- Header ----------
// Movie hero: facts and calls to action on the left, the poster card on the right, and the
// poster again as a dark, blurred backdrop that fades into the black on the left.
// Same wording as the Coming Soon cards on the home page
const reminderLabel = on => `${icon(on ? "bell-ring" : "bell")}<span>${on ? "Reminder set" : "Remind me"}</span>`;

// "U/A | Telugu +4 | 3h 20m": certificate, original language (+ dubbed versions), running time
function metaLine(m) {
  const first = m.lang || (m.languages || [])[0] || "";
  const langs = [first, ...(m.languages || []).filter(l => l && l !== first)].filter(Boolean);
  const more = langs.length - 1;
  const lang = langs.length
    ? `<span title="${esc(langs.join(", "))}">${esc(first)}${more ? `<span aria-hidden="true"> +${more}</span><span class="sr-only"> and ${plural(more, "more language")}: ${esc(langs.slice(1).join(", "))}</span>` : ""}</span>`
    : "";
  // Totals-only and undated released films carry their year here ("Hindi | 2016"), never "Date to be announced"
  const year = m.year && isReleased(m) && (isTotalsOnly(m) || !parseDay(m.release)) ? `<span>${esc(m.year)}</span>` : "";
  const items = [
    m.cert && `<span title="CBFC certificate"><span class="sr-only">Certificate </span>${esc(m.cert)}</span>`,
    lang,
    m.duration && `<span>${esc(m.duration)}</span>`,
    year,
  ].filter(Boolean);
  return items.length ? `<p class="film-meta">${items.join(`<span class="sep" aria-hidden="true">|</span>`)}</p>` : "";
}

// "#3 Hindi film of all time · worldwide gross" and "#5 biggest Hindi opening day", ranked among films
// of the same language (the same rankings as the Lists page), shown only inside that list's length
function rankChips(m) {
  const lang = m.lang;
  if (!lang || !isReleased(m)) return "";
  const pool = MOVIES.filter(o => o.lang === lang);
  const place = key => {
    const list = ranking(pool, key);
    const me = list.find(x => x.m.id === m.id);
    if (!me) return null;
    return { rank: me.rank, tied: list.filter(x => x.rank === me.rank).length > 1 };
  };
  const num = p => `${p.tied ? "Joint " : ""}<strong>#${p.rank}</strong>`;
  const chips = [];
  const top = place("worldwide");
  if (top && top.rank <= listLimit(lang, "top")) {
    chips.push(`<a class="rank-chip" href="${listHref(lang, "top")}">${icon("trophy")}<span>${num(top)} ${esc(lang)} film of all time<span class="rank-basis"> · worldwide gross</span></span></a>`);
  }
  const open = place("opening");
  if (open && open.rank <= listLimit(lang, "opening")) {
    chips.push(`<a class="rank-chip" href="${listHref(lang, "opening")}">${icon("zap")}<span>${num(open)} biggest ${esc(lang)} opening day</span></a>`);
  }
  return chips.length ? `<ul class="film-ranks" aria-label="Rankings">${chips.map(c => `<li>${c}</li>`).join("")}</ul>` : "";
}

// "Action / Drama" -> two genre pills
function genrePills(m) {
  const genres = String(m.genre || "").split("/").map(g => g.trim()).filter(Boolean);
  return genres.length ? `<ul class="film-genres" aria-label="Genre">${genres.map(g => `<li class="tag">${esc(g)}</li>`).join("")}</ul>` : "";
}

function renderHeader(jumps, { hasNumbers = false } = {}) {
  const m = film;
  const released = isReleased(m);
  $("filmBackdrop").setAttribute("style", posterStyle(m));

  // Released: the collections are the main action. Upcoming: there is nothing to track yet,
  // so "Remind me" leads and the collections link (which says when tracking starts) follows.
  // Films without day-wise figures lead with their key numbers instead.
  const collectionsLink = cls => `<a class="btn ${cls}" href="#collections">Day-by-day collections</a>`;
  let when, verdictRow = "", ctas;
  if (released) {
    const v = verdict(m);
    // An undated old film shows its year in the meta line instead
    when = parseDay(m.release) ? `Released ${releaseLabel(m)}` : m.year ? "" : "Released";
    if (v) verdictRow = `<div class="film-verdict">${verdictHTML(m)}<small>${esc(verdictNote(v))}</small></div>`;
    const lead = hasDayWise(m) || !hasNumbers ? collectionsLink("btn-primary") : `<a class="btn btn-primary" href="#numbers">Key numbers</a>`;
    ctas = `${lead}<a class="btn btn-ghost" href="#ratings">Ratings</a>`;
  } else {
    const on = hasReminder(m.id);
    when = parseDay(m.release)
      ? `<span>Releasing ${releaseLabel(m)}</span><span class="countdown"><span class="sr-only">, </span>${countdownPill(m)}</span>`
      : esc(countdownText(m));
    ctas = `<button type="button" class="btn btn-primary remind-btn" id="remindBtn" aria-pressed="${on}"
              title="Saved in this browser. We'll show a note on this site when it releases.">${reminderLabel(on)}</button>${collectionsLink("btn-ghost")}`;
  }
  // The trailer on YouTube (found by the server's sync or set in the admin portal), with its views
  const trailer = m.trailer && /^[\w-]{11}$/.test(m.trailer.videoId || "") ? m.trailer : null;
  if (trailer) ctas += `<a class="btn btn-ghost" href="https://www.youtube.com/watch?v=${trailer.videoId}" target="_blank" rel="noopener">${icon("play")} Trailer${NEW_TAB}</a>`;
  const trailerStats = trailer && Number.isFinite(trailer.views)
    ? `<p class="film-trailer">Trailer: ${compactCount(trailer.views)} views${Number.isFinite(trailer.likes) ? ` · ${compactCount(trailer.likes)} likes` : ""} on YouTube${trailer.asOf ? ` · as of ${esc(isoLabel(trailer.asOf) || trailer.asOf)}` : ""}</p>`
    : "";

  $("filmHead").innerHTML = `
    <div class="film-head-info">
      <h1>${esc(m.title)}</h1>
      ${metaLine(m)}
      ${m.desc ? `<p class="film-desc">${esc(m.desc)}</p>` : ""}
      ${genrePills(m)}
      ${when ? `<p class="film-when">${when}</p>` : ""}
      ${verdictRow}
      ${rankChips(m)}
      <div class="film-ctas">${ctas}</div>
      ${trailerStats}
    </div>
    <div class="film-head-poster">${filmPoster(m)}</div>`;

  const tabs = $("filmTabs");
  tabs.innerHTML = jumps.length ? `<ul>${jumps.map(([id, label]) => `<li><a href="#${id}">${label}</a></li>`).join("")}</ul>` : "";
  tabs.hidden = !jumps.length;

  $("remindBtn")?.addEventListener("click", e => {
    const on = toggleReminder(m.id);
    if (on === null) return toast("Couldn't save the reminder. Your browser storage may be full or blocked.");
    const btn = e.currentTarget;
    btn.setAttribute("aria-pressed", on);
    btn.innerHTML = reminderLabel(on);
    icons();
    toast(on ? `Reminder set for ${m.title}. We'll flag it here once it's out.` : `Reminder removed for ${m.title}.`);
  });
}

// ---------- Cast & crew ----------
// Round avatars with initials (no photos). First the director and up to six names typed in the admin portal;
// on the server, the cast and crew saved in the database (IMDb's principal cast and crew, or TMDB's full
// list) then replace them, with a "Full cast & crew" list by department. TMDB photos are stored, not shown.
const CAST_MAX = 6;
const TOP_BILLED = 12;
const DEPARTMENTS = ["Directing", "Writing", "Production", "Sound", "Camera", "Editing", "Art", "Costume & Make-Up", "Visual Effects", "Lighting", "Crew"];
const DEPARTMENT_LABELS = { Sound: "Music & sound", "Costume & Make-Up": "Costume & make-up", "Visual Effects": "Visual effects" };
// Within a department, the head of it first: Director, Screenplay, Music, Director of Photography, Editor, Producer
const LEAD_JOB = /^(director|screenplay|writer|story|music|original music composer|director of photography|cinematography|editor|producer)$/i;

function personHTML(p) {
  return `
    <li class="cast-person">
      <span class="cast-avatar" aria-hidden="true">${esc(initials(p.name))}</span>
      <span class="cast-name">${esc(p.name)}</span>
      ${p.role ? `<span class="cast-role">${esc(p.role)}</span>` : ""}
    </li>`;
}

function personLink(p) {
  const url = /^nm\d+$/.test(p.imdbId || "") ? `https://www.imdb.com/name/${p.imdbId}/`
    : Number.isInteger(p.tmdbId) ? `https://www.themoviedb.org/person/${p.tmdbId}` : "";
  return url ? `<a href="${url}" target="_blank" rel="noopener">${esc(p.name)}${NEW_TAB}</a>` : esc(p.name);
}

async function loadCredits(sec) {
  let data = null;
  try { data = await api(`movies/${Number(film.id)}/credits`); } catch {}
  const cast = data?.cast || [], crew = data?.crew || [];
  if (!cast.length && !crew.length) {   // the typed names stay; with none, the section goes
    if (!sec.querySelector(".cast-row")) sec.hidden = true;
    return;
  }
  const directors = crew.filter(c => /^director$/i.test(c.job));
  const top = [...directors.map(d => ({ name: d.name, role: "Director" })), ...cast.slice(0, TOP_BILLED).map(c => ({ name: c.name, role: c.character }))];
  const known = new Set(DEPARTMENTS);
  const groups = DEPARTMENTS
    .map(dep => [dep, crew.filter(c => (known.has(c.department) ? c.department : "Crew") === dep)
      .sort((a, b) => Number(!LEAD_JOB.test(a.job)) - Number(!LEAD_JOB.test(b.job)))])
    .filter(([, list]) => list.length);
  const row = (p, role) => `<li><span class="people-name">${personLink(p)}</span>${role ? `<span class="people-role">${esc(role)}</span>` : ""}</li>`;
  sec.innerHTML = `
    <div class="container">
      ${sectionHead("castTitle", "Cast &amp; crew")}
      <ul class="cast-row">${top.map(personHTML).join("")}</ul>
      <details class="credits-full">
        <summary><span>Full cast &amp; crew</span><small>${plural(cast.length, "actor")} · ${plural(crew.length, "crew credit")}</small></summary>
        <div class="credits-cols">
          ${cast.length ? `<div class="credit-group"><h3>Cast</h3><ul class="people-list">${cast.map(c => row(c, c.character)).join("")}</ul></div>` : ""}
          ${groups.map(([dep, list]) => `
            <div class="credit-group"><h3>${esc(DEPARTMENT_LABELS[dep] || dep)}</h3>
              <ul class="people-list">${list.map(c => row(c, c.job)).join("")}</ul></div>`).join("")}
        </div>
      </details>
      <p class="fine-print credits-source">${data.source === "tmdb" ? `Full cast and crew from TMDB. ${TMDB_CREDIT}` : `Principal cast and crew from IMDb. ${IMDB_CREDIT}`}</p>
    </div>`;
}

// "N. T. Rama Rao Jr." -> "NR", "Nagarjuna" -> "N"
function initials(name) {
  const words = String(name).split(/\s+/).filter(w => /\p{L}/u.test(w) && !/^(jr|sr)\.?$/i.test(w));
  const letter = w => (w && w.match(/\p{L}/u)?.[0]) || "";
  return (letter(words[0]) + (words.length > 1 ? letter(words[words.length - 1]) : "")).toUpperCase();
}

function renderCast() {
  const sec = $("cast");
  const people = [
    film.director && { name: String(film.director).trim(), role: "Director" },
    ...String(film.cast || "").split(",").map(s => s.trim()).filter(Boolean).slice(0, CAST_MAX).map(name => ({ name, role: "" })),
  ].filter(p => p && p.name);
  const stored = ONLINE && Boolean(film.credits?.cast || film.credits?.crew);
  if (!people.length && !stored) { sec.hidden = true; return false; }
  sec.innerHTML = `
    <div class="container">
      ${sectionHead("castTitle", "Cast &amp; crew")}
      ${people.length ? `<ul class="cast-row">${people.map(personHTML).join("")}</ul>` : `<p class="muted">Loading cast and crew…</p>`}
    </div>`;
  sec.hidden = false;
  if (stored) loadCredits(sec);
  return true;
}

// ---------- Key numbers ----------
function statTile(label, value, sub = "", extraClass = "") {
  return `
    <div class="stat-tile${extraClass}">
      <p class="stat-label">${label}</p>
      <p class="stat-value">${value === null || value === undefined ? NOT_REPORTED : value}</p>
      ${sub ? `<p class="stat-sub">${sub}</p>` : ""}
    </div>`;
}

function renderNumbers() {
  const sec = $("numbers");
  if (!isReleased(film)) { sec.hidden = true; return false; }
  const m = film;
  const bo = boxOffice(m);
  const release = parseDay(m.release);
  const pv = previewsNet(m);
  const plus = pv ? " · incl. previews" : "";

  const od = openingDay(m);
  const ow = openingWeekend(m);
  const fw = firstWeek(m);
  const f7 = first7Days(m);
  const life = shown(indiaNet(m));
  const lifeReported = boNum(bo.totals?.indiaNet) !== null;
  const b = budget(m);
  const bm = budgetMultiple(m);
  const v = verdict(m);
  const claim = producerClaim(m);
  const ww = shown(worldwideGross(m));
  const ig = shown(indiaGross(m)), og = shown(overseasGross(m));
  // Nothing reported yet (say, released today): Day by day already says so, so skip nine empty tiles
  if ([od, ow, fw, life, ig, og, ww, b, v].every(x => x === null)) { sec.hidden = true; return false; }
  const money = x => (x === null ? null : `<span class="money">${crore(x)}</span>`);
  // Week 1 is 8-11 days for non-Friday releases; the leaderboard ranks the fixed "First 7 days", so show it too
  const first7 = f7 !== null && (!fw || fw.days !== 7) ? `<span class="stat-sub-line">First 7 days <span class="money">${crore(f7)}</span>${plus}</span>` : "";
  // "Trade estimates of the worldwide gross range from ₹X Cr to ₹Y Cr." -> "Estimates range from ₹X Cr to ₹Y Cr",
  // both ends written by crore() so they match the figure above ("₹2,070.3 Cr" -> "₹2,070.30 Cr")
  const rangeNote = (bo.notes || []).map(n => String(n || "")).find(n => /^Trade estimates of the worldwide gross range from /i.test(n));
  const ends = rangeNote ? (/from ₹\s?([\d,.]+) Cr to ₹\s?([\d,.]+) Cr/i.exec(rangeNote) || []).slice(1).map(s => Number(s.replace(/,/g, ""))) : [];
  const range = ends.length === 2 && ends.every(Number.isFinite) ? `Estimates range from ${crore(ends[0])} to ${crore(ends[1])}`
    : rangeNote ? esc(rangeNote.replace(/^Trade estimates of the worldwide gross range/i, "Estimates range").replace(/\.\s*$/, "")) : "";
  // "India gross + overseas" only when both parts are on the page and add up to the figure, to the 2 decimals
  // crore() shows (say, not for an overseas-only release, or a reported total that differs from the split)
  const wwSub = ww === null ? "" : range || (ig !== null && og !== null && boRound2(ig + og) === boRound2(ww) ? "India gross + overseas" : "Reported total");
  // The worldwide tile is outlined as the headline figure only when there is one
  const wwKey = ww === null ? "" : " stat-tile-key";
  const verdictTile = statTile("Verdict", v && verdictHTML(m),
    v ? (v.indicative ? esc(INDICATIVE_BASIS) : v.source ? `Source: ${esc(v.source)}` : "Trade verdict") + (v.running ? " Still in theatres, so it may change." : "") : "",
    " stat-tile-verdict");

  let list;
  if (dayRows(m).length) {
    list = [
      statTile("Opening day", money(od), od === null ? "" : pv ? `Day 1 ${crore(openingDay(m, { previews: false }))} + previews ${crore(pv)}` : "Day 1"),
      statTile("Opening weekend", ow && money(ow.value), ow ? `${ow.extended ? `${ow.days}-day extended` : plural(ow.days, "day")}${plus}` : ""),
      statTile("Week 1", fw && money(fw.value), (fw ? `${plural(fw.days, "day")}${release ? `, ${DOW[release.getDay()]} to Thu` : ""}${plus}` : "") + first7),
      statTile("Lifetime India net", money(life), life === null ? "" : bo.running ? "still running*" : lifeReported ? "Reported total" : "Sum of listed days"),
      statTile("India gross", money(ig), ig === null ? "" : "Includes GST"),
      statTile("Overseas gross", money(og), og === null ? "" : "Outside India"),
      statTile("Worldwide gross", money(ww), wwSub, wwKey),
      statTile("Budget", b && `<span class="money">${croreRange(b.low, b.high)}</span>`, bm === null ? "" : `India net = ${bm.toFixed(1)}× budget`),
      verdictTile,
    ];
  } else {
    // Totals only: the opening day as the trade reported it, then the lifetime totals.
    // Opening day, India net, worldwide and verdict always show; the rest only when reported.
    // A separately reported previews figure is split out the same way as on day-wise films
    const o = bo.opening || {};
    const pre = boNum(o.previews);
    const day1 = openingDay(m, { previews: false });
    const odSub = od === null ? ""
      : pre !== null && day1 !== null && day1 !== od ? `Day 1 ${crore(day1)} + previews ${crore(pre)}`
      : o.includesPreviews === true ? "Day 1 as reported, incl. paid previews"
      : "Day 1 India net";
    list = [
      statTile("Opening day", money(od), odSub),
      statTile("Lifetime India net", money(life), life === null ? "" : bo.running ? "still running*" : "Reported total"),
      ig !== null && statTile("India gross", money(ig), "Includes GST"),
      og !== null && statTile("Overseas gross", money(og), "Outside India"),
      statTile("Worldwide gross", money(ww), wwSub, wwKey),
      b && statTile("Budget", `<span class="money">${croreRange(b.low, b.high)}</span>`, bm === null ? "" : `India net = ${bm.toFixed(1)}× budget`),
      verdictTile,
    ].filter(Boolean);
  }
  const tiles = list.join("");

  const fine = [
    // Compare with the trackers' worldwide figure: only "not verified" when there is none
    claim !== null && `Makers' claim: ${crWhole(claim)} worldwide${ww === null ? " — not verified by trackers" : claim > ww ? `, above the trackers' ${crore(ww)}` : ", in line with trackers"}.`,
    bo.running && "* Still in theatres, so these figures will change.",
    `${bo.asOf ? `Figures as of ${isoLabel(bo.asOf)} · ` : ""}Trade estimates, India net unless marked gross.`,
  ].filter(Boolean).map(t => `<p>${t}</p>`).join("");

  sec.innerHTML = `
    <div class="container">
      ${sectionHead("numbersTitle", "Key numbers", "₹ crore · 1 crore = 100 lakh")}
      <div class="stat-grid${list.length === 4 ? " stat-grid-4" : ""}">${tiles}</div>
      <div class="fine-print numbers-fine">${fine}</div>
    </div>`;
  sec.hidden = false;
  return true;
}

// ---------- Day by day ----------
function renderCollections({ hasNumbers = false, hasSources = false } = {}) {
  const sec = $("collections");
  const rows = dayRows(film);
  let body;
  if (!isReleased(film)) body = emptyState("calendar-clock", "Box office tracking starts on release day.");
  else if (isTotalsOnly(film)) body = noDaysPanel(hasNumbers, hasSources);
  else if (!rows.length) body = emptyState("bar-chart-3", "Collections not reported yet. Check back after the first weekend.");
  else body = `${chartPanel(rows)}${tablePanel(rows)}${insightPanels()}`;

  sec.innerHTML = `
    <div class="container">
      ${sectionHead("collectionsTitle", "Day by day", rows.length ? "India net, ₹ crore · trade weeks run Friday to Thursday" : "")}
      ${body}
    </div>`;
  if (rows.length && isReleased(film)) setupChart(rows);
  setupTable();
}

// Totals-only films: a short note instead of an empty chart and table, with the language's lists
function noDaysPanel(hasNumbers, hasSources) {
  const lang = film.lang;
  // Some list films only have an opening-day figure, so "figures" rather than "totals" when there's no lifetime total
  const what = shown(indiaNet(film)) !== null || shown(worldwideGross(film)) !== null ? "totals" : "figures";
  const where = hasNumbers ? ` The ${what} above come from trade reports${hasSources ? " (sources below)" : ""}.` : "";
  const links = lang ? `
      <div class="no-days-links">
        <a class="btn btn-ghost btn-sm" href="${listHref(lang, "top")}">${icon("trophy")}Top ${esc(lang)} grossers</a>
        <a class="btn btn-ghost btn-sm" href="${listHref(lang, "opening")}">${icon("zap")}Biggest ${esc(lang)} opening days</a>
      </div>` : "";
  return `
    <div class="panel no-days">
      <span class="no-days-icon" aria-hidden="true">${icon("bar-chart-3")}</span>
      <div class="no-days-body">
        <p>Day-by-day figures aren't published for this film.${where}</p>
        ${links}
      </div>
    </div>`;
}

// ---------- Day-by-day chart ----------
// Inline SVG whose viewBox matches its pixel width, so text never scales. Colours are read from
// the theme's CSS variables and re-read whenever the theme changes.
const chart = { mode: "daily", rows: [], slots: [], geo: null, colors: null, width: 0, hot: -1 };

function chartPanel(rows) {
  const hasPreviews = rows.some(r => r.day === 0);
  return `
    <div class="panel chart-panel">
      <div class="panel-title chart-head">
        <h3>${icon("bar-chart-3")}<span id="chartTitle">Daily India net</span></h3>
        <div class="seg" role="group" aria-label="Chart view">
          <button type="button" class="seg-btn" data-mode="daily" aria-pressed="true">Daily</button>
          <button type="button" class="seg-btn" data-mode="cum" aria-pressed="false">Running total</button>
        </div>
      </div>
      <ul class="chart-legend" id="chartLegend" aria-label="Legend">
        <li><i class="key key-weekday"></i>Weekday</li>
        <li><i class="key key-weekend"></i>Weekend (Fri–Sun, shaded)</li>
        ${hasPreviews ? `<li><i class="key key-previews"></i>Paid previews (P)</li>` : ""}
      </ul>
      <div class="chart-wrap" id="chartWrap" tabindex="0" role="group"
           aria-label="Day-by-day chart. Use the left and right arrow keys to read each day. The table below lists every figure.">
        <div class="chart-svg-host" id="chartHost"></div>
        <div class="chart-tip" id="chartTip" aria-hidden="true" hidden></div>
      </div>
      <p class="sr-only" id="chartLive" aria-live="polite"></p>
      <p class="fine-print chart-note" id="chartNote"></p>
    </div>`;
}

// One slot per listed day, plus a "gap" slot wherever days are missing (never drawn as zero)
function chartSlots(rows) {
  const slots = [];
  let expect = 1;
  rows.forEach(r => {
    if (r.day > 0) {
      if (r.day > expect) slots.push({ gap: true, from: expect, to: r.day - 1 });
      expect = r.day + 1;
    }
    slots.push(r);
  });
  return slots;
}

function themeColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Clean crore ticks: 0, 20, 40 ... or 0, 250, 500 ...
function yScale(max) {
  if (!(max > 0)) return { top: 1, ticks: [0, 1] };
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(s => s * mag).find(s => s >= raw - 1e-9);
  const count = Math.ceil(max / step - 1e-9);
  return { top: count * step, ticks: Array.from({ length: count + 1 }, (_, i) => Number((i * step).toFixed(6))) };
}
function tickLabel(v) {
  if (v === 0) return "0";
  if (v < 1) return `₹${Math.round(v * 100)} L`;
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })} Cr`;
}

// Column with a 4px rounded data end and a square foot on the baseline
function barPath(x, yTop, w, base) {
  const r = Math.min(4, w / 2, base - yTop);
  const f = n => n.toFixed(2);
  return `M${f(x)},${f(base)}V${f(yTop + r)}Q${f(x)},${f(yTop)} ${f(x + r)},${f(yTop)}H${f(x + w - r)}Q${f(x + w)},${f(yTop)} ${f(x + w)},${f(yTop + r)}V${f(base)}Z`;
}

function setupChart(rows) {
  chart.rows = rows;
  chart.slots = chartSlots(rows);
  chart.hot = -1;
  const wrap = $("chartWrap");

  document.querySelectorAll(".seg-btn").forEach(btn => btn.addEventListener("click", () => {
    chart.mode = btn.dataset.mode;
    document.querySelectorAll(".seg-btn").forEach(b => b.setAttribute("aria-pressed", b === btn));
    drawChart();
  }));

  // Pointer: the nearest day under the pointer, anywhere in its column
  const pick = e => {
    const g = chart.geo, svg = wrap.querySelector("svg");
    if (!g || !svg) return;
    const box = svg.getBoundingClientRect();
    const x = (e.clientX - box.left) * (g.W / box.width);
    const i = Math.floor((x - g.ml) / g.slotW);
    if (i >= 0 && i < chart.slots.length) showPoint(i); else hidePoint();
  };
  wrap.addEventListener("pointermove", pick);
  wrap.addEventListener("pointerdown", pick);
  wrap.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") hidePoint(); });

  // Keyboard: arrows step through the days (gaps are skipped)
  wrap.addEventListener("keydown", e => {
    const n = chart.slots.length;
    const real = i => i >= 0 && i < n && !chart.slots[i].gap;
    if (e.key === "Escape") { hidePoint(); return; }
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    let i = chart.hot;
    if (e.key === "Home") i = -1;
    if (e.key === "End") i = n;
    const dir = e.key === "ArrowLeft" || e.key === "End" ? -1 : 1;
    if (chart.hot < 0 && e.key === "ArrowRight") i = -1;
    if (chart.hot < 0 && e.key === "ArrowLeft") i = n;
    do i += dir; while (i >= 0 && i < n && !real(i));
    if (real(i)) { showPoint(i); announce(i); }
  });
  wrap.addEventListener("focus", () => {
    if (chart.hot >= 0 || !wrap.matches(":focus-visible")) return;
    const first = chart.slots.findIndex(s => !s.gap);
    showPoint(first);
    announce(first);
  });
  wrap.addEventListener("blur", hidePoint);
  // Touch has no pointerleave, so a tap anywhere else closes the tooltip
  document.addEventListener("pointerdown", e => { if (chart.hot >= 0 && !wrap.contains(e.target)) hidePoint(); });

  if ("ResizeObserver" in window) {
    new ResizeObserver(() => { if (Math.round(wrap.clientWidth) !== chart.width) drawChart(); }).observe(wrap);
  }
  drawChart();
}

function drawChart() {
  const wrap = $("chartWrap");
  if (!wrap || !chart.slots.length) return;
  hidePoint();
  const W = Math.max(260, Math.round(wrap.clientWidth));
  const H = W < 560 ? 230 : 290;
  chart.width = W;
  const c = chart.colors = {
    accent: themeColor("--accent"), gold: themeColor("--gold"), muted: themeColor("--muted"),
    ink: themeColor("--text-soft"), grid: themeColor("--border"), axis: themeColor("--border-strong"),
    band: themeColor("--ghost"), surface: themeColor("--surface"),
  };
  const cum = chart.mode === "cum";
  const slots = chart.slots;
  const val = s => (s.gap ? null : cum ? s.cum : s.net);
  const values = slots.map(val).filter(v => v !== null);
  const { top, ticks } = yScale(Math.max(0, ...values));
  const ml = Math.ceil(Math.max(...ticks.map(t => tickLabel(t).length)) * 6.8) + 12;
  const g = { W, H, ml, mr: 14, mt: 24, mb: 30 };
  g.pw = W - g.ml - g.mr;
  g.ph = H - g.mt - g.mb;
  g.base = g.mt + g.ph;
  g.slotW = g.pw / slots.length;
  g.y = v => g.base - (v / top) * g.ph;
  g.x = i => g.ml + (i + 0.5) * g.slotW;
  chart.geo = g;
  const f = n => n.toFixed(1);
  const crisp = y => Math.round(y) + 0.5;
  let s = "";

  // Weekend columns are lightly shaded, so weekends read even in themes where accent and gold look alike
  if (!cum) {
    slots.forEach((sl, i) => {
      if (sl.weekend) s += `<rect x="${f(g.ml + i * g.slotW)}" y="${g.mt}" width="${f(g.slotW)}" height="${f(g.ph)}" fill="${c.band}" fill-opacity=".45"/>`;
    });
  }

  // Gridlines and y labels
  ticks.forEach(t => {
    const y = crisp(g.y(t));
    s += `<line x1="${g.ml}" x2="${f(W - g.mr)}" y1="${y}" y2="${y}" stroke="${t === 0 ? c.axis : c.grid}" stroke-width="1"/>`;
    s += `<text x="${g.ml - 8}" y="${y}" dy="0.32em" text-anchor="end" fill="${c.muted}">${tickLabel(t)}</text>`;
  });

  let ariaLabel;
  const days = chart.rows.filter(r => r.day > 0).length;
  const hasPreviews = chart.rows.some(r => r.day === 0);
  if (!cum) {
    // Daily columns
    const bw = Math.min(24, Math.max(1, g.slotW - Math.max(2, g.slotW * 0.3)));
    slots.forEach((sl, i) => {
      if (sl.gap || !(sl.net > 0)) return;
      const yTop = Math.min(g.y(sl.net), g.base - 1);      // a tiny figure still shows as a sliver
      const fill = sl.day === 0 ? "url(#pvHatch)" : sl.weekend ? c.gold : c.accent;
      s += `<path class="bar" data-i="${i}" d="${barPath(g.x(i) - bw / 2, yTop, bw, g.base)}" fill="${fill}"/>`;
    });
    // Label only the peak
    const peak = slots.reduce((best, sl, i) => (!sl.gap && (best < 0 || sl.net > slots[best].net) ? i : best), -1);
    if (peak >= 0) {
      const px = g.x(peak);
      const anchor = px < g.ml + 44 ? "start" : px > W - g.mr - 44 ? "end" : "middle";
      const lx = anchor === "start" ? px - bw / 2 : anchor === "end" ? px + bw / 2 : px;
      s += `<text class="chart-callout" x="${f(lx)}" y="${f(Math.min(g.y(slots[peak].net), g.base - 1) - 8)}" text-anchor="${anchor}" fill="${c.ink}">${crore(slots[peak].net)}</text>`;
      ariaLabel = `Daily India net for ${plural(days, "day")}${hasPreviews ? " plus previews" : ""}; peak ${crore(slots[peak].net)} on ${slots[peak].label}.`;
    }
  } else {
    // Running total: area + line, stopping where a missing day makes the total unknown
    const pts = [];
    for (let i = 0; i < slots.length; i++) {
      const v = val(slots[i]);
      if (v === null) break;
      pts.push([g.x(i), g.y(v), i]);
    }
    if (pts.length) {
      const line = pts.map(([x, y], k) => `${k ? "L" : "M"}${f(x)},${f(y)}`).join("");
      if (pts.length > 1) {
        s += `<path d="${line}L${f(pts[pts.length - 1][0])},${g.base}L${f(pts[0][0])},${g.base}Z" fill="${c.accent}" fill-opacity=".1"/>`;
        s += `<path d="${line}" fill="none" stroke="${c.accent}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      }
      const [ex, ey, ei] = pts[pts.length - 1];
      s += `<circle cx="${f(ex)}" cy="${f(ey)}" r="4" fill="${c.accent}" stroke="${c.surface}" stroke-width="2"/>`;
      const anchor = ex > W - g.mr - 60 ? "end" : ex < g.ml + 60 ? "start" : "middle";
      s += `<text class="chart-callout" x="${f(ex + (anchor === "end" ? 4 : 0))}" y="${f(ey - 10)}" text-anchor="${anchor}" fill="${c.ink}">${crore(slots[ei].cum)}</text>`;
      const paused = pts.length < slots.length;
      ariaLabel = `Running total of India net: ${crore(slots[ei].cum)} after ${slots[ei].label}${paused ? ", then paused because a day is missing" : ""}.`;
    } else {
      ariaLabel = "Running total unavailable: a day is missing at the start of the run.";
    }
  }

  // X labels: every N days, sized to fit; a break mark where days are missing
  const step = [1, 2, 5, 7, 10, 14, 21, 28].find(n => n * g.slotW >= 24) || 28;
  let lastX = -Infinity;
  slots.forEach((sl, i) => {
    const x = g.x(i);
    if (sl.gap) {
      s += `<path d="M${f(x - 5)},${g.base + 4}L${f(x - 1)},${g.base - 4}M${f(x + 1)},${g.base + 4}L${f(x + 5)},${g.base - 4}" stroke="${c.muted}" stroke-width="1.5" fill="none"/>`;
      return;
    }
    const want = sl.day === 0 || sl.day === 1 || sl.day % step === 0;
    if (!want || x - lastX < 20) return;
    s += `<text x="${f(x)}" y="${g.base + 19}" text-anchor="middle" fill="${c.muted}">${sl.day === 0 ? "P" : sl.day}</text>`;
    lastX = x;
  });
  s += `<text x="${g.ml - 8}" y="${g.base + 19}" text-anchor="end" fill="${c.muted}">Day</text>`;

  $("chartHost").innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(ariaLabel || "Day-by-day collections")}">
      <defs>
        <pattern id="pvHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="${c.muted}" fill-opacity=".3"/><rect width="2.5" height="6" fill="${c.muted}"/>
        </pattern>
      </defs>
      ${s}
      <g class="chart-hover"></g>
    </svg>`;

  // Title, legend and note follow the view
  $("chartTitle").textContent = cum ? "Running total, India net" : "Daily India net";
  $("chartLegend").hidden = cum;
  const pausedRow = chart.rows.find(r => r.cum === null);
  // Mention previews only for films that had them (a Day 0 row); otherwise the running total keeps the hover hint
  const hint = "Hover, tap or use the arrow keys for each day's figure.";
  const pvNote = hasPreviews ? " Totals include paid previews." : "";
  $("chartNote").textContent = cum
    ? (pausedRow ? `Running total paused at ${pausedRow.label}: a day before it is missing.${pvNote}` : pvNote.trim() || hint)
    : hint;
}

function tipLines(sl) {
  if (sl.gap) return [[sl.from === sl.to ? `Day ${sl.from}` : `Days ${sl.from}–${sl.to}`], ["Not reported", "tip-value"]];
  const head = [`${sl.label} · ${shortDate(sl.date)}`];
  if (chart.mode === "cum") {
    return sl.cum === null
      ? [head, ["Total paused", "tip-value"], ["A day before this is missing"], [`${crore(sl.net)} that day`]]
      : [head, [`${crore(sl.cum)} total`, "tip-value"], [`${crore(sl.net)} that day`]];
  }
  const lines = [head, [crore(sl.net), "tip-value"]];
  if (sl.change !== null) lines.push([`${pct(sl.change)} vs Day ${sl.day - 1}`, trendClass(sl.change)]);
  else if (sl.day === 0) lines.push(["Paid previews, reported apart from Day 1"]);
  return lines;
}

function showPoint(i) {
  const g = chart.geo, sl = chart.slots[i];
  const wrap = $("chartWrap"), svg = wrap?.querySelector("svg"), tip = $("chartTip");
  if (!g || !sl || !svg) return;
  chart.hot = i;
  const c = chart.colors;
  svg.classList.add("has-hover");
  svg.querySelectorAll(".bar.is-hot").forEach(b => b.classList.remove("is-hot"));
  svg.querySelector(`.bar[data-i="${i}"]`)?.classList.add("is-hot");

  // Running total gets a crosshair and a ringed dot on the line
  const x = g.x(i);
  let yMark = g.base;
  const hover = svg.querySelector(".chart-hover");
  if (chart.mode === "cum") {
    const v = sl.gap ? null : sl.cum;
    const xx = Math.round(x) + 0.5;
    hover.innerHTML = `<line x1="${xx}" x2="${xx}" y1="${g.mt}" y2="${g.base}" stroke="${c.ink}" stroke-opacity=".5" stroke-width="1"/>`
      + (v === null ? "" : `<circle cx="${x.toFixed(1)}" cy="${g.y(v).toFixed(1)}" r="5" fill="${c.accent}" stroke="${c.surface}" stroke-width="2"/>`);
    if (v !== null) yMark = g.y(v);
  } else {
    hover.innerHTML = "";
    if (!sl.gap && sl.net > 0) yMark = Math.min(g.y(sl.net), g.base - 1);
  }

  // Tooltip: built with textContent; placed above the mark, or beside it near the top
  tip.replaceChildren(...tipLines(sl).map(([text, cls]) => {
    const el = document.createElement(cls === "tip-value" ? "strong" : "span");
    el.textContent = text;
    if (cls) el.className = cls;
    return el;
  }));
  tip.hidden = false;
  const wrapBox = wrap.getBoundingClientRect(), box = svg.getBoundingClientRect();
  const scale = box.width / g.W;
  const xPx = box.left - wrapBox.left + x * scale;
  const yPx = box.top - wrapBox.top + yMark * scale;
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  let left = xPx - tw / 2;
  let top = yPx - th - 10;
  if (top < 0) {
    top = 0;
    left = xPx + 16 + tw <= wrapBox.width ? xPx + 16 : xPx - 16 - tw;
  }
  tip.style.left = `${Math.max(0, Math.min(left, wrapBox.width - tw))}px`;
  tip.style.top = `${top}px`;
}

// The tooltip is visual only; keyboard steps are read out through a polite live region
function announce(i) {
  const live = $("chartLive"), sl = chart.slots[i];
  if (live && sl) live.textContent = tipLines(sl).map(([text]) => text).join(". ");
}

function hidePoint() {
  chart.hot = -1;
  const svg = $("chartWrap")?.querySelector("svg");
  if (svg) {
    svg.classList.remove("has-hover");
    svg.querySelectorAll(".bar.is-hot").forEach(b => b.classList.remove("is-hot"));
    const hover = svg.querySelector(".chart-hover");
    if (hover) hover.innerHTML = "";
  }
  const tip = $("chartTip");
  if (tip) tip.hidden = true;
}

// Re-colour the chart when the visitor switches theme
new MutationObserver(() => { if (chart.slots.length) drawChart(); })
  .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

// ---------- Day-by-day table ----------
const SHOWN_WEEKS = 2;

function tablePanel(rows) {
  const weeks = weekTotals(film);
  const lastOfWeek = new Map();
  rows.forEach(r => { if (r.day > 0) lastOfWeek.set(r.week, r.day); });
  const days = rows.filter(r => r.day > 0).length;
  const hasMore = rows.some(r => r.week > SHOWN_WEEKS);
  const pv = previewsNet(film);
  const pctCell = x => `<td class="num ${trendClass(x)}">${pct(x) || DASH}</td>`;

  let body = "";
  rows.forEach(r => {
    const extra = r.week > SHOWN_WEEKS;
    const cls = [r.weekend && "is-weekend", r.day === 0 && "is-previews", extra && "is-extra"].filter(Boolean).join(" ");
    body += `
      <tr${cls ? ` class="${cls}"` : ""}${extra ? " hidden" : ""}>
        <th scope="row">${r.label}${r.weekend ? `<span class="sr-only"> (weekend)</span>` : ""}</th>
        <td>${shortDate(r.date)}</td>
        <td class="num money">${crore(r.net)}</td>
        ${pctCell(r.change)}
        ${pctCell(r.weekChange)}
        <td class="num money">${r.cum === null ? DASH : crore(r.cum)}</td>
      </tr>`;
    if (r.day > 0 && lastOfWeek.get(r.week) === r.day) {
      const w = weeks.find(x => x.week === r.week);
      if (w) {
        body += `
          <tr class="week-total${extra ? " is-extra" : ""}"${extra ? " hidden" : ""}>
            <th scope="row">Week ${w.week} total</th>
            <td>${w.complete ? plural(w.days, "day") : `${w.daysPresent} of ${plural(w.days, "day")}`}</td>
            <td class="num money">${crore(w.total)}</td>
            <td colspan="3" class="week-note">${w.complete ? (w.week === 1 && pv ? "incl. previews" : "") : "(partial)"}</td>
          </tr>`;
      }
    }
  });

  const untracked = untrackedNet(film);
  const notes = [
    pv && "P = paid previews the night before release, reported apart from Day 1. They count towards the opening day, weekend and week 1.",
    rows.some(r => r.cum === null) && "Running total paused: a day is missing.",
    untracked !== null && `Later days added ${crore(untracked)} and aren't listed day by day.`,
    "“vs last week” compares the same weekday seven days earlier.",
  ].filter(Boolean).map(t => `<p>${t}</p>`).join("");

  return `
    <div class="panel table-panel">
      <div class="panel-title">
        <h3 id="dayTableTitle">${icon("table")}Day-by-day table</h3>
        <small>${plural(days, "day")} listed${rows.some(r => r.weekend) ? `<span class="wk-legend"><i class="wk-key" aria-hidden="true"></i>Weekend (Fri–Sun)</span>` : ""}</small>
      </div>
      <div class="table-wrap" role="region" aria-labelledby="dayTableTitle" tabindex="0">
        <table class="bo-table">
          <caption class="sr-only">Day-by-day India net for ${esc(film.title)}, in ₹ crore</caption>
          <thead>
            <tr><th scope="col">Day</th><th scope="col">Date</th><th scope="col" class="num">India net</th>
                <th scope="col" class="num">vs previous day</th><th scope="col" class="num">vs last week</th><th scope="col" class="num">Running total</th></tr>
          </thead>
          <tbody id="dayRowsBody">${body}</tbody>
        </table>
      </div>
      ${hasMore ? `<button type="button" class="btn btn-ghost btn-sm table-more" id="showAllDays" aria-expanded="false" aria-controls="dayRowsBody" data-days="${days}">${icon("chevron-down")}<span>Show all ${days} days</span></button>` : ""}
      <div class="fine-print table-notes">${notes}</div>
    </div>`;
}

function setupTable() {
  const btn = $("showAllDays");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const open = btn.getAttribute("aria-expanded") !== "true";
    document.querySelectorAll("#dayRowsBody .is-extra").forEach(tr => { tr.hidden = !open; });
    btn.setAttribute("aria-expanded", open);
    btn.innerHTML = `${icon(open ? "chevron-up" : "chevron-down")}<span>${open ? `Show first ${SHOWN_WEEKS} weeks` : `Show all ${btn.dataset.days} days`}</span>`;
    icons();
    // Collapsing a long table moves the button far up; bring it back into view
    if (!open) btn.scrollIntoView({ block: "nearest" });
  });
}

// ---------- How it held up · Milestones · Day 1 by language ----------
// Colours are tokens set in css/film.css, so each theme can keep the languages apart.
// The five main languages keep their own colour; any other (Marathi, Bengali...) takes the next free one.
const LANG_COLORS = { Telugu: "var(--lang-1)", Hindi: "var(--lang-2)", Tamil: "var(--lang-3)", Malayalam: "var(--lang-4)", Kannada: "var(--lang-5)" };
function langColors(split) {
  const out = {}, used = new Set();
  split.forEach(x => {
    const c = Object.hasOwn(LANG_COLORS, x.lang) ? LANG_COLORS[x.lang] : null;
    if (c && !used.has(c)) { out[x.lang] = c; used.add(c); }
  });
  const spare = Object.values(LANG_COLORS).filter(c => !used.has(c));
  split.forEach(x => { if (!out[x.lang]) out[x.lang] = spare.shift() || "var(--lang-5)"; });
  return out;
}

function insightPanels() {
  const panels = [heldUpPanel(), milestonesPanel(), languagePanel()].filter(Boolean);
  return panels.length ? `<div class="insight-grid">${panels.join("")}</div>` : "";
}

function heldUpPanel() {
  const t = trends(film);
  if (!t) return "";
  const items = [
    t.mondayDrop !== null && ["Monday test", pct(t.mondayDrop), trendClass(t.mondayDrop), "First Monday vs first Friday, the trade's word-of-mouth test. Smaller drops are better."],
    t.weekendDrop !== null && ["Weekend to weekend", pct(t.weekendDrop), trendClass(t.weekendDrop), "Second Fri–Sun vs the first. Smaller drops mean the film held up."],
    t.multiplier !== null && ["Legs", `${t.multiplier.toFixed(2)}×`, "", "Lifetime India net ÷ opening weekend. Big openers usually score lower."],
    t.frontLoad !== null && ["Front-loading", `${Math.round(t.frontLoad * 100)}%`, "", "Share of week 1 earned on the opening day. Higher means fans rushed in early."],
  ].filter(Boolean);
  if (!items.length) return "";
  return `
    <div class="panel insight">
      <div class="panel-title"><h3>${icon("activity")}How it held up</h3></div>
      <dl class="held-list">
        ${items.map(([label, value, cls, note]) => `
          <div class="held-item">
            <dt>${label}</dt>
            <dd class="held-value score ${cls}">${value}</dd>
            <dd class="held-note">${note}</dd>
          </div>`).join("")}
      </dl>
    </div>`;
}

function milestonesPanel() {
  const list = milestones(film);
  if (!list.length) return "";
  return `
    <div class="panel insight">
      <div class="panel-title"><h3>${icon("flag")}Milestones</h3><small>${previewsNet(film) ? "Running India net, incl. previews" : "Running India net"}</small></div>
      <ul class="milestone-list">
        ${list.map(x => `<li class="milestone"><strong class="money">₹${x.amount.toLocaleString("en-IN")} Cr</strong> · ${x.label}${x.date ? ` (${shortDate(x.date)})` : ""}</li>`).join("")}
      </ul>
    </div>`;
}

function languagePanel() {
  const split = languageSplit(film);
  if (!split.length) return "";
  const colors = langColors(split);
  const color = lang => colors[lang];
  const share = x => (x.share > 0 && x.share < 0.001 ? "<0.1%" : `${(x.share * 100).toFixed(1)}%`);
  if (split.length === 1) {
    return `
      <div class="panel insight">
        <div class="panel-title"><h3>${icon("languages")}Day 1 by language</h3></div>
        <p class="lang-single">All of Day 1 (<span class="money">${crore(split[0].net)}</span>) came from the ${esc(split[0].lang)} version.</p>
      </div>`;
  }
  const label = split.map(x => `${x.lang} ${share(x)}`).join(", ");
  return `
    <div class="panel insight">
      <div class="panel-title"><h3>${icon("languages")}Day 1 by language</h3><small>Without previews</small></div>
      <div class="lang-bar" role="img" aria-label="${esc(`Day 1 by language: ${label}`)}">
        ${split.filter(x => x.share >= 0.005).map(x => `<span style="flex-grow:${x.share.toFixed(4)};background:${color(x.lang)}"></span>`).join("")}
      </div>
      <ul class="lang-legend">
        ${split.map(x => `
          <li><i class="swatch" style="background:${color(x.lang)}"></i><span class="lang-name">${esc(x.lang)}</span>
              <span class="money">${crore(x.net)}</span><span class="lang-share score">${share(x)}</span></li>`).join("")}
      </ul>
    </div>`;
}

// ---------- Ratings ----------
// Says which scores overallScore() actually averaged, so the line is true for every film
function overallNote(critics, imdb, aud) {
  const parts = [critics && "critics", imdb && "IMDb", aud.count && "audience"].filter(Boolean);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
  const base = parts.length > 1 ? `The average of ${list}, each out of 10.` : `Based on the ${list} score only.`;
  return aud.count && aud.early && (critics || imdb)
    ? `${base} With fewer than ${AUDIENCE_MIN_VOTES} audience ratings, that part leans towards the critics and IMDb score.`
    : base;
}

function renderRatings() {
  const sec = $("ratings");
  if (!isReleased(film)) {
    sec.innerHTML = `<div class="container">${sectionHead("ratingsTitle", "Ratings")}${emptyState("star", "Ratings open on release day.")}</div>`;
    return;
  }
  const critics = criticsScore(film);
  const imdb = imdbScore(film);
  const aud = audienceScore(film.id);
  const overall = overallScore(film);

  const criticsCard = critics
    ? `
      <p class="rating-big"><span class="score">${critics.score.toFixed(1)}</span><small>/10</small></p>
      <p class="rating-sub">from ${plural(critics.count, "review")}</p>
      <ul class="outlet-list">
        ${critics.reviews.map(r => {
          const url = safeUrl(r.url);
          const outlet = url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(r.outlet)}${icon("external-link")}${NEW_TAB}</a>` : `<span>${esc(r.outlet)}</span>`;
          return `<li>${outlet}<span class="outlet-score">${starsHTML((r.score / r.outOf) * 5, { size: "sm" })}<span class="score">${r.score}/${r.outOf}</span></span></li>`;
        }).join("")}
      </ul>`
    : `<p class="rating-none">No critic reviews added yet.</p>`;

  // From IMDb's own data (the server refreshes it daily), or a snapshot our team typed in
  const fromImdb = film.critics?.imdb?.source === "imdb";
  const imdbLink = /^tt\d{7,10}$/.test(film.imdbId || "")
    ? ` <a class="text-link" href="https://www.imdb.com/title/${film.imdbId}/" target="_blank" rel="noopener">View on IMDb${NEW_TAB}</a>` : "";
  const imdbCard = imdb
    ? `
      <p class="rating-big"><span class="score">${imdb.score.toFixed(1)}</span><small>/10</small></p>
      <p class="rating-sub">${imdb.votes ? `${esc(imdb.votes)} votes` : "Votes not recorded"}${imdb.asOf ? ` · as of ${esc(isoLabel(imdb.asOf) || imdb.asOf)}` : ""}</p>
      <p class="fine-print">${fromImdb ? `Updated daily from IMDb.${imdbLink}<br>${IMDB_CREDIT}` : `A snapshot. IMDb ratings keep moving.${imdbLink}`}</p>`
    : `<p class="rating-none">No IMDb rating yet.${imdbLink}</p>`;

  const total = aud.count || 1;
  const audienceCard = aud.count
    ? `
      <p class="rating-big"><span class="score">${aud.avg.toFixed(1)}</span><small>/5</small></p>
      <p class="rating-sub">${starsHTML(aud.avg)} ${plural(aud.count, "rating")}</p>
      ${aud.early ? `<p class="early-note">${icon("info")}Early: fewer than ${AUDIENCE_MIN_VOTES} ratings</p>` : ""}
      <ul class="histogram">
        ${[5, 4, 3, 2, 1].map(n => `
          <li>
            <span class="sr-only">${plural(n, "star")}: ${plural(aud.dist[n - 1], "rating")}</span>
            <span class="hist-label" aria-hidden="true">${n}★</span>
            <span class="hist-track" aria-hidden="true"><i style="width:${((aud.dist[n - 1] / total) * 100).toFixed(1)}%"></i></span>
            <span class="hist-count score" aria-hidden="true">${aud.dist[n - 1]}</span>
          </li>`).join("")}
      </ul>`
    : `<p class="rating-none">No ratings yet. <a href="#reviews" class="text-link">Be the first</a>.</p>`;

  // No critics or IMDb score at all (most list films): one calm card says so, next to the audience card
  const cards = critics || imdb
    ? `
        <article class="panel rating-card"><h3 class="rating-kicker">${icon("newspaper")}Critics</h3>${criticsCard}</article>
        <article class="panel rating-card"><h3 class="rating-kicker">${icon("star")}IMDb</h3>${imdbCard}</article>`
    : `
        <article class="panel rating-card"><h3 class="rating-kicker">${icon("newspaper")}Critics &amp; IMDb</h3>
          <p class="rating-none">No critic scores on file.</p></article>`;

  sec.innerHTML = `
    <div class="container">
      ${sectionHead("ratingsTitle", "Ratings", fromImdb
        ? "Critics are entered by our team. The IMDb rating comes from IMDb. Audience ratings come from visitors to this page."
        : "Critics and IMDb are entered by our team. Audience ratings come from visitors to this page.")}
      <div class="rating-grid${critics || imdb ? "" : " rating-grid-even"}">${cards}
        <article class="panel rating-card"><h3 class="rating-kicker">${icon("users")}Audience</h3>${audienceCard}</article>
      </div>
      ${overall === null ? "" : `
        <p class="overall-line">${icon("gauge")}<strong>Overall <span class="score">${overall.toFixed(1)}/10</span></strong>
          <span>${overallNote(critics, imdb, aud)}</span></p>`}
    </div>`;
  icons();
}

// ---------- Audience reviews ----------
const STAR_WORDS = ["", "Poor", "Below average", "Good", "Very good", "Excellent"];

function renderReviews() {
  const sec = $("reviews");
  if (!isReleased(film)) { sec.hidden = true; return; }
  sec.hidden = false;
  sec.innerHTML = `
    <div class="container">
      ${sectionHead("reviewsTitle", "Audience reviews")}
      <div class="reviews-layout">
        <form class="panel review-form" id="reviewForm" novalidate>
          <div class="panel-title"><h3>${icon("star")}<span id="formTitle">Rate this film</span></h3></div>
          <fieldset class="star-input">
            <legend>Your rating <span class="opt">(required)</span></legend>
            <div class="star-row" id="starRow">
              ${[1, 2, 3, 4, 5].map(n => `
                <input type="radio" name="stars" id="star${n}" value="${n}" required aria-describedby="rvError">
                <label for="star${n}" title="${STAR_WORDS[n]}"><span aria-hidden="true">★</span><span class="sr-only">${plural(n, "star")}, ${STAR_WORDS[n]}</span></label>`).join("")}
              <span class="star-word" id="starWord" aria-hidden="true">Pick 1 to 5 stars</span>
            </div>
          </fieldset>
          <p class="form-error" id="rvError" role="alert"></p>
          <div class="field">
            <label for="rvName">Name <span class="opt">(optional)</span></label>
            <input id="rvName" type="text" maxlength="${NAME_MAX}" autocomplete="nickname" placeholder="Anonymous">
          </div>
          <div class="field">
            <label for="rvText">Review <span class="opt">(optional)</span></label>
            <textarea id="rvText" rows="4" maxlength="${REVIEW_MAX}" aria-describedby="rvCount" placeholder="What worked, what didn't?"></textarea>
            <p class="char-count" id="rvCount">0/${REVIEW_MAX}</p>
          </div>
          <p class="fine-print" id="rvHiddenNote" hidden>A moderator has hidden your review, so it isn't shown or counted. Posting again keeps it hidden.</p>
          <button class="btn btn-primary" type="submit" id="rvSubmit">${icon("send")}<span>Post rating</span></button>
          <p class="fine-print">${ONLINE ? "Everyone sees it once it's posted." : "Saved in this browser only."} One rating per film; posting again replaces yours.</p>
        </form>
        <div class="review-list-wrap">
          <div class="panel-title"><h3 id="reviewListTitle">${icon("message-square")}What viewers say</h3><small id="reviewCount"></small></div>
          <div id="reviewList"></div>
        </div>
      </div>
    </div>`;

  const form = $("reviewForm");
  const row = $("starRow");
  const checked = () => Number(form.querySelector('input[name="stars"]:checked')?.value || 0);
  const paint = n => {
    row.querySelectorAll("label").forEach((l, i) => l.classList.toggle("on", i < n));
    $("starWord").textContent = n ? `${n}/5 · ${STAR_WORDS[n]}` : "Pick 1 to 5 stars";
  };
  row.addEventListener("pointerover", e => {
    const l = e.target.closest("label");
    if (l) paint(Number($(l.htmlFor).value));
  });
  row.addEventListener("pointerleave", () => paint(checked()));
  row.addEventListener("change", () => { paint(checked()); $("rvError").textContent = ""; });

  const text = $("rvText");
  const count = () => { $("rvCount").textContent = `${text.value.length}/${REVIEW_MAX}`; };
  text.addEventListener("input", count);

  // Prefill with this visitor's earlier rating
  const fill = () => {
    const mine = myReview(film.id);
    $("formTitle").textContent = mine ? "You rated this film" : "Rate this film";
    $("rvSubmit").querySelector("span").textContent = mine ? "Update your rating" : "Post rating";
    $("rvHiddenNote").hidden = !(mine && mine.hidden);
    if (mine) {
      const input = $(`star${mine.stars}`);
      if (input) input.checked = true;
      $("rvName").value = mine.name === "Anonymous" ? "" : mine.name;
      text.value = mine.text || "";
    }
    paint(checked());
    count();
  };
  fill();

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const submit = $("rvSubmit");
    if (submit.disabled) return;
    submit.disabled = true;   // one post at a time while the server answers
    let res;
    try {
      res = await submitReview(film, { name: $("rvName").value, stars: checked() || undefined, text: text.value });
    } finally {
      submit.disabled = false;
    }
    if (!res.ok) {
      $("rvError").textContent = res.error;
      if (!checked()) $("star1").focus();
      return;
    }
    $("rvError").textContent = "";
    toast(res.replaced ? "Your rating is updated." : "Thanks! Your rating is posted.");
    fill();
    renderRatings();
    renderReviewList();
  });

  renderReviewList();
}

function renderReviewList() {
  const list = filmReviews(film.id);
  $("reviewCount").textContent = list.length ? plural(list.length, "rating") : "";
  $("reviewList").innerHTML = list.length
    ? `<ul class="review-list">
        ${list.map(r => `
          <li class="review${isMyReview(r) ? " is-mine" : ""}">
            <div class="review-head">
              <strong class="review-name">${esc(r.name)}</strong>
              ${isMyReview(r) ? `<span class="you-badge">You</span>` : ""}
              ${starsHTML(r.stars, { size: "sm" })}
              <time datetime="${esc(r.at)}">${esc(ago(r.at))}</time>
            </div>
            ${r.text ? `<p class="review-text">${esc(r.text)}</p>` : ""}
          </li>`).join("")}
      </ul>`
    : emptyState("message-square", "No audience ratings yet. Be the first.");
  icons();
}

// ---------- Comments (server only) ----------
// YouTube-style: comment, reply (threads one level deep), like or dislike, sort by Top or Newest, edit or
// delete your own. MANA CINEMA's own replies are marked Official, and it can pin and heart comments.
// Visitors need no account: the server knows them by a cookie. Without the server there are no comments.
const CM_MAX = 1500;
const CM_NAME_MAX = 40;
const CM_CLAMP = 420;   // longer comments start shortened, with "Read more"
const cm = { sort: "top", items: [], serverCount: 0, total: 0, hasMore: false, replies: new Map(), open: new Set() };
const cmName = {
  get() { try { return localStorage.getItem("manaCommentName") || ""; } catch { return ""; } },
  set(v) { try { localStorage.setItem("manaCommentName", v); } catch {} },
};
const cmFind = id => cm.items.find(c => c.id === id) || [...cm.replies.values()].flat().find(c => c.id === id) || null;
// "@Name hello": the name it replies to is highlighted
const cmText = text => esc(text).replace(/^@([^\s@]+)/, `<span class="cm-mention">@$1</span>`);

function cmRepliesBlock(c) {
  if (c.parentId) return "";
  const open = cm.open.has(c.id);
  return `
    <button type="button" class="cm-btn cm-replies-toggle" data-act="replies" aria-expanded="${open}"${c.replyCount ? "" : " hidden"}>${icon("chevron-down")}<span>${plural(c.replyCount, "reply", "replies")}</span></button>
    <ul class="cm-replies"${open ? "" : " hidden"}></ul>`;
}

function commentHTML(c) {
  const long = c.text.length > CM_CLAMP || c.text.split("\n").length > 6;
  const liked = c.myVote === 1, disliked = c.myVote === -1;
  return `
    <li class="cm${c.parentId ? " is-reply" : ""}${c.mine ? " is-mine" : ""}${c.hidden ? " is-hidden" : ""}" data-id="${c.id}">
      <span class="cm-avatar${c.byAdmin ? " is-official" : ""}" aria-hidden="true">${c.byAdmin ? icon("clapperboard") : esc(initials(c.name))}</span>
      <div class="cm-main">
        ${c.pinned ? `<p class="cm-pin">${icon("pin")}Pinned by MANA CINEMA</p>` : ""}
        <div class="cm-head">
          <strong class="cm-name">${esc(c.name)}</strong>
          ${c.byAdmin ? `<span class="cm-badge">Official</span>` : ""}
          ${c.mine && !c.byAdmin ? `<span class="you-badge">You</span>` : ""}
          <time datetime="${esc(c.at)}">${esc(ago(c.at))}</time>
          ${c.editedAt ? `<span class="cm-edited">(edited)</span>` : ""}
        </div>
        ${c.hidden ? `<p class="cm-note">${icon("eye-off")}A moderator hid this comment. Only you can see it.</p>` : ""}
        <p class="cm-text${long ? " clamp" : ""}">${cmText(c.text)}</p>
        ${long ? `<button type="button" class="cm-btn cm-more" data-act="more" aria-expanded="false">Read more</button>` : ""}
        <div class="cm-actions">
          <button type="button" class="cm-btn cm-vote${liked ? " is-on" : ""}" data-act="like" aria-pressed="${liked}" aria-label="Like">${icon("thumbs-up")}<span class="cm-count">${c.likes ? compactCount(c.likes) : ""}</span></button>
          <button type="button" class="cm-btn cm-vote${disliked ? " is-on" : ""}" data-act="dislike" aria-pressed="${disliked}" aria-label="Dislike">${icon("thumbs-down")}</button>
          <button type="button" class="cm-btn" data-act="reply">Reply</button>
          ${c.hearted ? `<span class="cm-heart" title="Hearted by MANA CINEMA">${icon("heart")}<span class="sr-only">Hearted by MANA CINEMA</span></span>` : ""}
          ${c.mine ? `<button type="button" class="cm-btn" data-act="edit">Edit</button><button type="button" class="cm-btn" data-act="delete">Delete</button>` : ""}
        </div>
        <div class="cm-slot"></div>
        ${cmRepliesBlock(c)}
      </div>
    </li>`;
}

// The comment as a ready element (its replies drawn too, when its thread is open)
function commentEl(c) {
  const t = document.createElement("template");
  t.innerHTML = commentHTML(c).trim();
  const li = t.content.firstElementChild;
  if (!c.parentId && cm.open.has(c.id)) drawReplies(li, c);
  return li;
}
function drawReplies(li, thread) {
  const ul = li.querySelector(":scope > .cm-main > .cm-replies");
  const toggle = li.querySelector(":scope > .cm-main > .cm-replies-toggle");
  if (!ul || !toggle) return;
  const open = cm.open.has(thread.id), replies = cm.replies.get(thread.id);
  toggle.hidden = !thread.replyCount;
  toggle.setAttribute("aria-expanded", open);
  toggle.querySelector("span").textContent = plural(thread.replyCount, "reply", "replies");
  toggle.classList.toggle("is-open", open);
  ul.hidden = !open;
  if (open && replies) ul.replaceChildren(...replies.map(commentEl));
  icons();
}
const cmLi = id => $("commentList").querySelector(`.cm[data-id="${id}"]`);
function cmRedraw(c) {
  const old = cmLi(c.id);
  if (old) old.replaceWith(commentEl(c));
  icons();
}

function composerHTML({ label, submit = "Comment", text = "", showName = true, cancel = true }) {
  return `
    <form class="cm-form" novalidate>
      <textarea class="cm-input" rows="1" maxlength="${CM_MAX}" placeholder="${esc(label)}" aria-label="${esc(label)}">${esc(text)}</textarea>
      <div class="cm-form-extra">
        ${showName ? `<input class="cm-name-input" maxlength="${CM_NAME_MAX}" placeholder="Your name (optional)" aria-label="Your name, optional" autocomplete="nickname" value="${esc(cmName.get())}">` : ""}
        <span class="cm-left" aria-hidden="true">0/${CM_MAX}</span>
        <span class="cm-form-buttons">
          ${cancel ? `<button type="button" class="btn btn-ghost btn-sm" data-act="cancel">Cancel</button>` : ""}
          <button type="submit" class="btn btn-primary btn-sm" disabled>${esc(submit)}</button>
        </span>
        <p class="form-error cm-error" role="alert"></p>
      </div>
    </form>`;
}

// Makes a composer work: grows with the text, counts characters, and sends through onSubmit({ text, name }),
// which resolves when saved (then onDone runs) or throws the message to show under the box.
function wireComposer(form, { onSubmit, onDone, onCancel }) {
  const input = form.querySelector(".cm-input"), send = form.querySelector('[type="submit"]'), nameBox = form.querySelector(".cm-name-input");
  const sync = () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 260)}px`;
    form.classList.toggle("is-open", form.contains(document.activeElement) || input.value.trim() !== "");
    form.querySelector(".cm-left").textContent = `${input.value.length}/${CM_MAX}`;
    send.disabled = !input.value.trim();
  };
  input.addEventListener("input", sync);
  form.addEventListener("focusin", sync);
  form.addEventListener("focusout", () => setTimeout(sync));
  form.querySelector('[data-act="cancel"]')?.addEventListener("click", () => {
    input.value = "";
    form.querySelector(".cm-error").textContent = "";
    sync();
    onCancel?.();
  });
  input.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !send.disabled) form.requestSubmit();
  });
  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (send.disabled) return;
    const error = form.querySelector(".cm-error");
    error.textContent = "";
    send.disabled = true;
    try {
      const name = nameBox ? nameBox.value.trim() : "";
      if (nameBox) cmName.set(name);
      await onSubmit({ text: input.value, name });
      input.value = "";
      sync();
      onDone?.();
    } catch (err) {
      error.textContent = err.message;
      sync();
    }
  });
  sync();
}

const cmCountText = () => { $("cmTotal").textContent = cm.total ? plural(cm.total, "comment") : ""; };
const cmEmpty = () => { $("cmEmpty").hidden = $("commentList").children.length !== 0; };

async function loadComments({ more = false } = {}) {
  const list = $("commentList"), moreBtn = $("cmMore");
  if (!more) {
    cm.items = []; cm.serverCount = 0; cm.replies.clear(); cm.open.clear();
    list.replaceChildren();
    $("cmStatus").textContent = "Loading comments…";
  } else {
    moreBtn.disabled = true;
  }
  let data;
  try {
    data = await api(`movies/${Number(film.id)}/comments?sort=${cm.sort}&offset=${cm.serverCount}&limit=20`);
  } catch (err) {
    $("cmStatus").innerHTML = `${esc(err.message)} <button type="button" class="cm-btn" id="cmRetry">Try again</button>`;
    $("cmRetry").addEventListener("click", () => loadComments({ more }));
    moreBtn.disabled = false;
    return;
  }
  $("cmStatus").textContent = "";
  const seen = new Set(cm.items.map(c => c.id));
  const fresh = data.comments.filter(c => !seen.has(c.id));   // your own new comment may also be on the next page
  cm.serverCount += data.comments.length;
  cm.items.push(...fresh);
  cm.total = data.total;
  cm.hasMore = data.hasMore;
  list.append(...fresh.map(commentEl));
  moreBtn.hidden = !cm.hasMore;
  moreBtn.disabled = false;
  cmCountText();
  cmEmpty();
  icons();
}

async function showReplies(thread) {
  if (!cm.replies.has(thread.id)) {
    const label = cmLi(thread.id).querySelector(":scope > .cm-main > .cm-replies-toggle span");
    label.textContent = "Loading…";
    try { cm.replies.set(thread.id, (await api(`comments/${thread.id}/replies`)).replies); }
    catch (err) { toast(err.message); drawReplies(cmLi(thread.id), thread); return; }
  }
  cm.open.add(thread.id);
  drawReplies(cmLi(thread.id), thread);
}

// Opens a composer under a comment; wire(form, close) hooks it up
function openSlot(li, html, wire) {
  const slot = li.querySelector(":scope > .cm-main > .cm-slot");
  slot.innerHTML = html;
  const form = slot.querySelector("form");
  wire(form, () => { slot.innerHTML = ""; });
  icons();
  const input = form.querySelector(".cm-input");
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

async function cmAction(act, btn) {
  const li = btn.closest(".cm");
  const c = cmFind(Number(li.dataset.id));
  if (!c) return;
  if (act === "more") {
    const text = li.querySelector(":scope > .cm-main > .cm-text");
    const open = btn.getAttribute("aria-expanded") !== "true";
    text.classList.toggle("clamp", !open);
    btn.setAttribute("aria-expanded", open);
    btn.textContent = open ? "Show less" : "Read more";
  } else if (act === "like" || act === "dislike") {
    const want = act === "like" ? 1 : -1;
    try {
      const res = await api(`comments/${c.id}/vote`, { method: "PUT", body: { vote: c.myVote === want ? 0 : want } });
      c.likes = res.likes;
      c.myVote = res.myVote;
      const [up, down] = li.querySelectorAll(":scope > .cm-main > .cm-actions .cm-vote");
      up.classList.toggle("is-on", c.myVote === 1);
      up.setAttribute("aria-pressed", c.myVote === 1);
      up.querySelector(".cm-count").textContent = c.likes ? compactCount(c.likes) : "";
      down.classList.toggle("is-on", c.myVote === -1);
      down.setAttribute("aria-pressed", c.myVote === -1);
    } catch (err) { toast(err.message); }
  } else if (act === "replies") {
    if (cm.open.has(c.id)) { cm.open.delete(c.id); drawReplies(li, c); } else await showReplies(c);
  } else if (act === "reply") {
    const thread = c.parentId ? cmFind(c.parentId) : c;
    openSlot(li, composerHTML({ label: `Reply to ${c.name}…`, submit: "Reply", text: c.parentId ? `@${c.name.replace(/\s+/g, "")} ` : "" }), (form, close) => {
      wireComposer(form, {
        onCancel: close,
        onSubmit: async ({ text, name }) => {
          await api(`movies/${Number(film.id)}/comments`, { method: "POST", body: { name, text, parentId: c.id } });
          cm.replies.set(thread.id, (await api(`comments/${thread.id}/replies`)).replies);   // everyone's replies, in order
          thread.replyCount = cm.replies.get(thread.id).length;
          cm.total++;
          cm.open.add(thread.id);
          drawReplies(cmLi(thread.id), thread);
          cmCountText();
          toast("Reply posted");
        },
        onDone: close,
      });
    });
  } else if (act === "edit") {
    openSlot(li, composerHTML({ label: "Edit your comment", submit: "Save", text: c.text, showName: false }), (form, close) => {
      wireComposer(form, {
        onCancel: close,
        onSubmit: async ({ text }) => {
          const res = await api(`comments/${c.id}`, { method: "PATCH", body: { text } });
          Object.assign(c, res.comment);
          cmRedraw(c);
          toast("Comment updated");
        },
      });
    });
  } else if (act === "delete") {
    if (!confirm(c.parentId ? "Delete your reply? This can't be undone." : "Delete your comment? Its replies go too. This can't be undone.")) return;
    try { await api(`comments/${c.id}`, { method: "DELETE" }); } catch (err) { return toast(err.message); }
    if (c.parentId) {
      const thread = cmFind(c.parentId);
      cm.replies.set(thread.id, (cm.replies.get(thread.id) || []).filter(r => r.id !== c.id));
      thread.replyCount = Math.max(0, thread.replyCount - 1);
      cm.total = Math.max(0, cm.total - 1);
      drawReplies(cmLi(thread.id), thread);
    } else {
      cm.items = cm.items.filter(x => x.id !== c.id);
      cm.replies.delete(c.id);
      cm.total = Math.max(0, cm.total - 1 - c.replyCount);
      li.remove();
    }
    cmCountText();
    cmEmpty();
    toast("Comment deleted");
  }
}

function renderComments() {
  const sec = $("comments");
  if (!ONLINE) { sec.hidden = true; return false; }   // comments live in the server's database
  sec.innerHTML = `
    <div class="container">
      <div class="film-section-head">
        <h2 id="commentsTitle">Comments</h2>
        <p class="cm-total" id="cmTotal" aria-live="polite"></p>
      </div>
      <div class="cm-toolbar">
        <label class="cm-sort">${icon("arrow-up-down")}<span class="sr-only">Sort comments by</span>
          <select id="cmSort"><option value="top">Top comments</option><option value="new">Newest first</option></select>
        </label>
      </div>
      <div class="cm-compose">
        <span class="cm-avatar" aria-hidden="true">${icon("user")}</span>
        <div class="cm-main" id="cmComposeSlot"></div>
      </div>
      <p class="muted cm-status" id="cmStatus" role="status"></p>
      <ul class="cm-list" id="commentList"></ul>
      <div class="empty-state cm-empty" id="cmEmpty" hidden><div class="empty-icon">${icon("message-circle")}</div><p>No comments yet. Start the conversation.</p></div>
      <button type="button" class="btn btn-ghost cm-more-btn" id="cmMore" hidden>Show more comments</button>
      <p class="fine-print cm-rules">Be kind and keep it about the film. No account needed: comments are tied to this browser, so you can edit or delete yours here. MANA CINEMA can hide comments that break these rules.</p>
    </div>`;
  sec.hidden = false;
  $("cmComposeSlot").innerHTML = composerHTML({ label: "Add a comment…" });
  const compose = $("cmComposeSlot").querySelector("form");
  wireComposer(compose, {
    onSubmit: async ({ text, name }) => {
      const res = await api(`movies/${Number(film.id)}/comments`, { method: "POST", body: { name, text } });
      cm.items.unshift(res.comment);
      cm.total++;
      $("commentList").prepend(commentEl(res.comment));   // your own comment shows first until the page reloads
      cmCountText();
      cmEmpty();
      icons();
      toast("Comment posted");
    },
    onCancel: () => compose.querySelector(".cm-input").blur(),
  });
  $("cmSort").addEventListener("change", e => { cm.sort = e.target.value; loadComments(); });
  $("cmMore").addEventListener("click", () => loadComments({ more: true }));
  $("commentList").addEventListener("click", e => {
    const btn = e.target.closest("[data-act]");
    if (btn && !btn.closest("form")) cmAction(btn.dataset.act, btn);
  });
  icons();
  loadComments();
  return true;
}

// ---------- Sources & notes ----------
function renderSources() {
  const sec = $("sources");
  const bo = boxOffice(film);
  const notes = (bo.notes || []).filter(n => String(n || "").trim());
  const sources = (bo.sources || []).filter(s => s && (s.title || s.url));
  const released = isReleased(film);
  if (!released && !notes.length && !sources.length) { sec.hidden = true; return false; }
  const v = verdict(film);

  const sourceItem = s => {
    const url = safeUrl(s.url);
    const title = esc(s.title || s.url);
    return url
      ? `<li><a href="${esc(url)}" target="_blank" rel="noopener">${title}${icon("external-link")}${NEW_TAB}</a><small>${esc(hostOf(url))}</small></li>`
      : `<li><span>${title}</span></li>`;
  };
  const facts = [
    v && (v.indicative ? `Verdict: ${esc(v.label)} (indicative). ${esc(INDICATIVE_BASIS)}` : `Verdict: ${esc(v.label)}${v.source ? `, from ${esc(v.source)}` : ""}.`),
    released && `${bo.asOf ? `Figures as of ${isoLabel(bo.asOf)}. ` : ""}All figures are trade estimates, not audited numbers.`,
  ].filter(Boolean);

  sec.innerHTML = `
    <div class="container">
      ${sectionHead("sourcesTitle", "Sources &amp; notes")}
      <div class="panel sources-panel">
        <div class="sources-grid">
          ${notes.length ? `<div><h3 class="sources-kicker">${icon("info")}Notes</h3><ul class="note-list">${notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul></div>` : ""}
          ${sources.length ? `<div><h3 class="sources-kicker">${icon("link")}Sources</h3><ul class="source-list">${sources.map(sourceItem).join("")}</ul></div>` : ""}
        </div>
        <div class="sources-foot">
          ${facts.length ? `<div class="fine-print">${facts.map(t => `<p>${t}</p>`).join("")}</div>` : ""}
          <a class="btn btn-ghost btn-sm" href="index.html?report=${Number(film.id)}#contact">${icon("flag")}Spotted a wrong figure? Tell us</a>
        </div>
      </div>
    </div>`;
  sec.hidden = false;
  return true;
}

// ---------- More films ----------
// Same language first, then the nearest year, then the nearest release date
function renderMore() {
  const sec = $("more");
  const time = m => parseDay(m.release)?.getTime();
  const year = m => Number(m.year) || parseDay(m.release)?.getFullYear() || null;
  const ownYear = year(film) ?? startOfToday().getFullYear();
  // An undated film counts from the middle of its year, so its own year's films aren't ordered by closeness to today
  const own = time(film) ?? new Date(ownYear, 6, 1).getTime();
  const others = MOVIES
    .filter(o => o.id !== film.id && isReleased(o))
    .map(o => ({
      o,
      lang: film.lang && o.lang === film.lang ? 0 : 1,
      years: year(o) === null ? Infinity : Math.abs(year(o) - ownYear),
      dist: time(o) === undefined ? Infinity : Math.abs(time(o) - own),
    }))
    .sort((a, b) => a.lang - b.lang || a.years - b.years || a.dist - b.dist || a.o.title.localeCompare(b.o.title))
    .slice(0, 4)
    .map(x => x.o);
  if (!others.length) { sec.hidden = true; return; }
  sec.innerHTML = `
    <div class="container">
      ${sectionHead("moreTitle", "More films")}
      <div class="more-grid">
        ${others.map(o => {
          // India net when reported, else worldwide gross, else the opening day (some list films only have that)
          const fig = [[shown(indiaNet(o)), "India net"], [shown(worldwideGross(o)), "worldwide"], [openingDay(o), "opening day"]].find(([v]) => v !== null);
          const meta = [o.year, o.lang !== film.lang && o.lang, o.genre].filter(Boolean).map(esc).join(" · ");
          return `
            <a class="more-card" href="film.html?id=${Number(o.id)}">
              ${filmPoster(o, { sub: false })}
              <div class="more-info">
                <h3>${esc(o.title)}</h3>
                ${meta ? `<p class="meta">${meta}</p>` : ""}
                <p class="more-figures">${verdictHTML(o)}${fig ? `<span><span class="money">${crore(fig[0])}</span> ${fig[1]}</span>` : ""}</p>
              </div>
            </a>`;
        }).join("")}
      </div>
    </div>`;
  sec.hidden = false;
}

// ---------- Page ----------
function describe(m) {
  if (!isReleased(m)) return `${m.title}: ${countdownText(m)}. Cast, release date and box office tracking from release day.`;
  const parts = [
    openingDay(m) !== null && `opening day ${crore(openingDay(m))}`,
    shown(indiaNet(m)) !== null && `India net ${crore(indiaNet(m))}`,
    shown(worldwideGross(m)) !== null && `worldwide gross ${crore(worldwideGross(m))}`,
  ].filter(Boolean);
  const daily = hasDayWise(m);
  const critics = criticsScore(m) || imdbScore(m);
  // Only name what the page has: many list films have no verdict and no critic scores
  const has = [verdict(m) && "verdict", critics && "critics, IMDb", "audience ratings"].filter(Boolean);
  const extras = has.length > 1 ? `${has.slice(0, -1).join(", ")} and ${has[has.length - 1]}` : has[0];
  return `${m.title}${m.year ? ` (${m.year})` : ""}${m.lang ? `, ${m.lang}` : ""} box office collection${daily ? " day by day" : ""}${parts.length ? `: ${parts.join(", ")}` : ""}. ${extras.charAt(0).toUpperCase()}${extras.slice(1)}.`;
}

function renderPage() {
  document.title = `${film.title} Box Office Collection & Ratings | MANA CINEMA`;
  document.querySelector('meta[name="description"]')?.setAttribute("content", describe(film));

  const hasCast = renderCast();
  const hasNumbers = renderNumbers();
  const hasSources = renderSources();
  renderCollections({ hasNumbers, hasSources });
  renderRatings();
  renderReviews();
  const hasComments = renderComments();
  renderMore();
  // Totals-only films have no day-by-day content to jump to; their header button goes to the key numbers
  renderHeader([
    hasCast && ["cast", "Cast &amp; crew"],
    hasNumbers && ["numbers", "Key numbers"],
    !isTotalsOnly(film) && ["collections", "Day by day"],
    ["ratings", "Ratings"],
    isReleased(film) && ["reviews", "Reviews"],
    hasComments && ["comments", "Comments"],
    hasSources && ["sources", "Sources"],
  ].filter(Boolean), { hasNumbers });
  icons();

  // Content is drawn after load, so jump to a #section link ourselves
  let target = null;
  try { target = location.hash.length > 1 && document.getElementById(decodeURIComponent(location.hash.slice(1))); } catch {}
  if (target) target.scrollIntoView({ behavior: "instant", block: "start" });

  // Films this visitor asked to be reminded about that are now out
  const due = takeDueReminders(MOVIES);
  if (due.length) toast(due.length === 1 ? `${due[0].title} is out now.` : `${due.length} films you follow are out now.`);
}

if (!film) location.replace("index.html#films");
else renderPage();
