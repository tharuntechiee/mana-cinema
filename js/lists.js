// Lists page: all-time top grossers and biggest opening days, one language at a time.
// Every figure comes from js/boxoffice.js; this file only arranges it on the page.
// The view lives in the URL (lists.html?lang=Hindi&list=top|opening), so it can be shared,
// and Back/Forward step through the languages and lists a visitor opened.

// ---------- Helpers ----------
const $ = id => document.getElementById(id);
const filmURL = m => `film.html?id=${Number(m.id)}`;
// Release year; list films without an exact date fall back to their year field
const yearOf = m => parseDay(m.release)?.getFullYear() ?? (Number(m.year) || null);
const listURL = (lang, list) => `?lang=${encodeURIComponent(lang)}&list=${list}`;

// Languages that have films, in LANGUAGES order (Hindi first).
// A damaged restore whose language isn't text gets no tab, rather than stopping the page.
const PAGE_LANGS = languagesIn(MOVIES).filter(l => typeof l === "string");

// The two lists: which ranking each uses and how long it is for a language (LANGUAGE_INFO)
const LIST_TYPES = {
  top: { label: "All-time top grossers", lead: "All-time", rest: "top grossers", ranking: "worldwide", size: info => info.top },
  opening: { label: "Biggest opening days", lead: "Biggest", rest: "opening days", ranking: "opening", size: info => info.opening },
};

// List lengths and the note on how a language's top grossers were picked (js/films-india.js).
// A language without an entry (one the admin added) gets the short lists.
function langInfo(lang) {
  const info = (typeof LANGUAGE_INFO !== "undefined" && LANGUAGE_INFO[lang]) || {};
  const size = (v, fallback) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : fallback);
  return { top: size(info.top, 10), opening: size(info.opening, 8), basis: String(info.basis || "").trim() };
}

// A figure, or "–" when it isn't reported (never ₹0: a zero India net means no India figure to show)
const NOT_REPORTED = `<span class="lt-na" title="Not reported"><span aria-hidden="true">–</span><span class="sr-only">Not reported</span></span>`;
const moneyHTML = v => (v !== null && v > 0 ? `<span class="money">${crore(v)}</span>` : NOT_REPORTED);

// A worldwide figure with no overseas part reported is the India gross on its own: marked † in the table
const indiaOnly = (m, value) => overseasGross(m) === null && indiaGross(m) !== null && boRound2(indiaGross(m)) === boRound2(value);
const INDIA_ONLY_MARK = `<span class="lt-mark" aria-hidden="true">†</span><span class="sr-only"> (India gross only, overseas not reported)</span>`;

// The ranked opening figure includes paid previews when leaving them out changes it
// (day-wise films with a Day 0 row; list films whose reported opening counts them)
function withPreviews(m) {
  const all = openingDay(m);
  return all !== null && all !== openingDay(m, { previews: false });
}

// ---------- State (from the URL) ----------
// Unknown or missing values fall back to the first language and the top grossers
// (own keys only, so ?list=constructor or __proto__ is unknown too)
function readURL() {
  const p = new URLSearchParams(location.search);
  const want = String(p.get("lang") || "").trim().toLowerCase();
  return {
    lang: PAGE_LANGS.find(l => l.toLowerCase() === want) || PAGE_LANGS[0] || "",
    list: Object.hasOwn(LIST_TYPES, p.get("list")) ? p.get("list") : "top",
  };
}
let view = readURL();

// ---------- Language tabs and list switch ----------
function buildControls() {
  $("langTabs").innerHTML = PAGE_LANGS.map(lang =>
    `<li><a class="lang-tab" data-lang="${esc(lang)}" href="${esc(listURL(lang, view.list))}">${esc(lang)}</a></li>`).join("");
  // On phones the first word drops out ("Top grossers"), so both halves fit side by side
  $("listSwitch").innerHTML = Object.entries(LIST_TYPES).map(([key, t]) =>
    `<a class="seg-link" data-list="${key}" href="${esc(listURL(view.lang, key))}"><span class="seg-lead">${t.lead} </span>${t.rest}</a>`).join("");
  arrowKeys($("langTabs"), ".lang-tab");
  arrowKeys($("listSwitch"), ".seg-link");
}

// Marks the current language and list, and points every link at its view
function syncControls({ smooth = true } = {}) {
  document.querySelectorAll(".lang-tab").forEach(a => {
    a.href = listURL(a.dataset.lang, view.list);
    if (a.dataset.lang === view.lang) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  document.querySelectorAll(".seg-link").forEach(a => {
    a.href = listURL(view.lang, a.dataset.list);
    if (a.dataset.list === view.list) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  revealCurrent($("langTabs"), smooth);
}

// Left/Right arrows (and Home/End) move between the links of one row
function arrowKeys(row, selector) {
  row.addEventListener("keydown", e => {
    const items = [...row.querySelectorAll(selector)];
    const i = items.indexOf(document.activeElement);
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: items.length - 1 }[e.key];
    if (i < 0 || to === undefined || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    items[(to + items.length) % items.length].focus();
  });
}

// On phones the tab row scrolls sideways: bring the current tab into view
// (by scrolling the row only, so the page itself doesn't move)
function revealCurrent(row, smooth = true) {
  const tab = row.querySelector('[aria-current="page"]');
  if (!tab || row.scrollWidth <= row.clientWidth) return;
  const r = row.getBoundingClientRect(), t = tab.getBoundingClientRect();
  if (t.left >= r.left && t.right <= r.right) return;
  const animate = smooth && !matchMedia("(prefers-reduced-motion: reduce)").matches;
  row.scrollTo({ left: row.scrollLeft + t.left - r.left - (r.width - t.width) / 2, behavior: animate ? "smooth" : "auto" });
}

// ---------- Table rows ----------
// Rank, with ties marked for screen readers (the number already repeats on screen)
function rankHTML(rows, i) {
  const tied = rows.some((x, j) => j !== i && x.rank === rows[i].rank);
  return tied ? `<span title="Tied">${rows[i].rank}</span><span class="sr-only"> (tied)</span>` : String(rows[i].rank);
}

// Poster thumb, title (links to the film page), then year, verdict and a "Day by day" link
function filmCell(m, { showVerdict = true } = {}) {
  const year = yearOf(m);
  const sub = [
    year && `<span class="lt-year">${year}</span>`,
    showVerdict && verdictHTML(m),
    hasDayWise(m) && `<a class="lt-chip" href="${filmURL(m)}#collections">Day by day<span class="sr-only"> collections: ${esc(m.title)}</span></a>`,
  ].filter(Boolean).join("");
  return `
    <th scope="row" role="rowheader" class="lt-film">
      <div class="lt-film-in">
        ${posterHTML(m, { compact: true })}
        <div class="lt-film-text">
          <a class="lt-title" href="${filmURL(m)}">${esc(m.title)}</a>
          ${sub ? `<div class="lt-sub">${sub}</div>` : ""}
        </div>
      </div>
    </th>`;
}

function topRowsHTML(rows) {
  return rows.map(({ m, value, rank }, i) => `
    <tr role="row"${rank <= 3 ? ' class="is-podium"' : ""}>
      <td role="cell" class="lt-rank">${rankHTML(rows, i)}</td>
      ${filmCell(m)}
      <td role="cell" class="lt-num" data-label="Worldwide gross">${indiaOnly(m, value) ? `<span>${moneyHTML(value)}${INDIA_ONLY_MARK}</span>` : moneyHTML(value)}</td>
      <td role="cell" class="lt-num" data-label="India net">${moneyHTML(indiaNet(m))}</td>
    </tr>`).join("");
}

// Opening day as ranked (paid previews included), marked when previews are part of it,
// with the Day 1 figure on its own when the trade reported it separately
function openingRowsHTML(rows) {
  return rows.map(({ m, value, rank }, i) => {
    const dayOne = withPreviews(m) ? openingDay(m, { previews: false }) : null;
    const note = withPreviews(m)
      ? `<span class="lt-prev">Incl. paid previews</span>${dayOne !== null ? `<small>Day 1 alone <span class="money">${crore(dayOne)}</span></small>` : ""}`
      : "";
    return `
    <tr role="row"${rank <= 3 ? ' class="is-podium"' : ""}>
      <td role="cell" class="lt-rank">${rankHTML(rows, i)}</td>
      ${filmCell(m, { showVerdict: false })}
      <td role="cell" class="lt-num" data-label="Opening day">${moneyHTML(value)}</td>
      <td role="cell" class="lt-note">${note}</td>
    </tr>`;
  }).join("");
}

// ---------- List panel ----------
function emptyHTML(icon, text, link) {
  return `
    <div class="empty-state lists-empty">
      <div class="empty-icon"><i data-lucide="${icon}"></i></div>
      <p>${text}</p>
      ${link || ""}
    </div>`;
}

function panelHTML() {
  const { lang, list } = view;
  if (!lang) {
    return `<h2 id="listTitle" class="lists-title">Box office lists</h2>${emptyHTML("film", "No films to list yet.", "")}`;
  }
  const type = LIST_TYPES[list], other = list === "top" ? "opening" : "top";
  const size = type.size(langInfo(lang));
  const ranked = ranking(MOVIES.filter(m => m.lang === lang), type.ranking);
  // Ranks are shared on a tie (1, 1, 3), so a tie at the cut-off keeps every film on that rank
  const rows = ranked.filter(x => x.rank <= size);
  const name = esc(lang);
  const sub = list === "top"
    ? `Top ${size} by lifetime worldwide gross as reported, with India net alongside.`
    : `Top ${size} by opening day India net. Paid previews count towards the opening day, as the trade reports them.`;
  const head = `
    <div class="lists-panel-head">
      <h2 id="listTitle" class="lists-title">${type.label} in ${name}</h2>
      ${rows.length ? `<p class="lists-sub">${sub}</p>` : ""}
    </div>`;

  if (!rows.length) {
    const switchLink = `<p><a class="empty-link" data-list="${other}" href="${esc(listURL(lang, other))}">See the ${LIST_TYPES[other].label.toLowerCase()}</a></p>`;
    return head + (list === "top"
      ? emptyHTML("globe", `No worldwide figures for ${name} films yet.`, switchLink)
      : emptyHTML("calendar", `No opening-day figures for ${name} films yet. We add them as the trade reports them.`, switchLink));
  }

  const figureHeads = list === "top"
    ? `<th scope="col" role="columnheader" class="lt-num">Worldwide gross</th><th scope="col" role="columnheader" class="lt-num">India net</th>`
    : `<th scope="col" role="columnheader" class="lt-num">Opening day<span class="lt-head-note"> · India net</span></th><th scope="col" role="columnheader" class="lt-note">Note</th>`;
  const notes = [
    ranked.length < size && `Only ${ranked.length} ${name} ${ranked.length === 1 ? "film has" : "films have"} a reported ${list === "top" ? "worldwide gross" : "opening day"} so far, so the list stops there.`,
    list === "top" && rows.some(x => { const v = verdict(x.m); return v && (v.indicative || v.running); }) && "* Indicative verdict, or the film is still running.",
    list === "top" && rows.some(x => indiaOnly(x.m, x.value)) && "† No overseas figure reported, so the worldwide gross shown is the India gross. The film may rank higher.",
    `Trade estimates, not audited figures. Each film's page lists its sources. Spotted a wrong figure? <a href="index.html?report=#contact">Tell us</a>.`,
  ].filter(Boolean);

  return `${head}
    <div class="lists-table-wrap">
      <table class="lists-table lists-table-${list}" role="table">
        <caption class="sr-only">${type.label} in ${name}: ${rows.length} ${rows.length === 1 ? "film" : "films"}, ranked by ${list === "top" ? "worldwide gross" : "opening day India net"}</caption>
        <thead role="rowgroup">
          <tr role="row">
            <th scope="col" role="columnheader" class="lt-rank">Rank</th>
            <th scope="col" role="columnheader" class="lt-film">Film</th>
            ${figureHeads}
          </tr>
        </thead>
        <tbody role="rowgroup">${list === "top" ? topRowsHTML(rows) : openingRowsHTML(rows)}</tbody>
      </table>
    </div>
    <div class="lists-notes">${notes.map(n => `<p class="fine-print">${n}</p>`).join("")}</div>`;
}

// ---------- Render ----------
function render({ announce = false } = {}) {
  const { lang, list } = view;
  const type = LIST_TYPES[list];
  syncControls({ smooth: announce });

  // The basis note describes how the top grossers were picked, so it shows on that list only
  const basis = lang && list === "top" ? langInfo(lang).basis : "";
  $("listsBasis").hidden = !basis;
  $("listsBasis").innerHTML = basis ? `<i data-lucide="info"></i><span>${esc(basis)}</span>` : "";

  $("listPanel").innerHTML = panelHTML();
  document.title = lang ? `${type.label} in ${lang} | Box Office Lists | MANA CINEMA` : "Box Office Lists | MANA CINEMA";
  icons();

  if (announce && lang) {
    const count = $("listPanel").querySelectorAll("tbody tr").length;
    $("listsStatus").textContent = `${type.label} in ${lang}: ${count ? `${count} ${count === 1 ? "film" : "films"}` : "no figures yet"}.`;
  }
}

// Opens another view: a new history entry, so Back returns to the previous list
function go(next) {
  if (next.lang === view.lang && next.list === view.list) return;
  view = next;
  try { history.pushState(view, "", listURL(view.lang, view.list)); } catch {}
  render({ announce: true });
}

// Links keep working as plain links (new tab, copy link); a normal click swaps the list in place
document.addEventListener("click", e => {
  const a = e.target.closest("a[data-lang], a[data-list]");
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  go({ lang: a.dataset.lang || view.lang, list: a.dataset.list || view.list });
  // A link inside the list (the empty state's) is replaced: keep focus on the matching switch
  if (!a.isConnected) document.querySelector(`.seg-link[data-list="${view.list}"]`)?.focus();
});
// Back/Forward. A jump to an anchor on this page (the skip link) fires popstate too:
// the list is unchanged then, so it isn't redrawn or announced again.
addEventListener("popstate", () => {
  const next = readURL();
  if (next.lang === view.lang && next.list === view.list) return;
  view = next;
  render({ announce: true });
});

// "Trade estimates as of …": the latest update among the films
const latestAsOf = MOVIES.map(m => boxOffice(m).asOf).filter(d => parseDay(d)).sort().pop();
if (latestAsOf) $("listsAsOf").textContent = dayLabel(latestAsOf);

buildControls();
// The address always names the view on screen (an unknown ?lang becomes the first language)
if (view.lang) try { history.replaceState(view, "", listURL(view.lang, view.list)); } catch {}
render();
// The tabs change width once the web font arrives: bring the current one into view again
document.fonts?.ready.then(() => revealCurrent($("langTabs"), false));
