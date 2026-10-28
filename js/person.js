// Person page (person.html?id=<TMDB person ID>): a star's portfolio. Who they are, their films on this site
// with the box office, their whole career and biography from TMDB, and calls to action that follow their
// films: the next release on this site while one is coming, else the latest. The home page cover circles
// open it. The data comes from /api/people/tmdb/:id (server/people.js); figures from js/boxoffice.js.

const $ = id => document.getElementById(id);
const personId = /^\d{1,9}$/.test(new URLSearchParams(location.search).get("id") || "") ? Number(new URLSearchParams(location.search).get("id")) : null;
const star = (typeof COVER_STARS !== "undefined" && Array.isArray(COVER_STARS) ? COVER_STARS : []).find(s => s.tmdb === personId) || null;

const icon = name => `<i data-lucide="${name}"></i>`;
const NEW_TAB = `<span class="sr-only"> (opens in a new tab)</span>`;
const TMDB_CREDIT = `This website uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by <a class="text-link" href="https://www.themoviedb.org" target="_blank" rel="noopener">TMDB</a>.`;
const LANG_NAMES = { te: "Telugu", hi: "Hindi", ta: "Tamil", ml: "Malayalam", kn: "Kannada", mr: "Marathi", bn: "Bengali", pa: "Punjabi", gu: "Gujarati", en: "English" };
// The work beside acting, in the order the page lists it, and what TMDB calls it
const WORK = [
  ["Directing", /^director$/i, "Director", "Directed"],
  ["Writing", /^(screenplay|writer|story|dialogue)$/i, "Writer", "Wrote"],
  ["Production", /^(producer|executive producer)$/i, "Producer", "Produced"],
  ["Singing", /^(playback singer|singer)$/i, "Playback singer", "Sang in"],
  ["Music", /^(music|original music composer)$/i, "Composer", "Music for"],
  ["Lyrics", /^lyricist$/i, "Lyricist", "Lyrics for"],
  ["Choreography", /^choreographer$/i, "Choreographer", "Choreographed"],
  ["Stunts", /^stunts$/i, "Stunts", "Stunts in"],
];
const FILMOGRAPHY_STEP = 30;

const today = isoDay(startOfToday());
const sectionHead = (id, title, note = "") => `<div class="film-section-head"><h2 id="${id}">${title}</h2>${note ? `<p class="fine-print">${note}</p>` : ""}</div>`;
const plural = (n, one, many = one + "s") => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;
const yearOfFilm = m => parseDay(m.release)?.getFullYear() ?? (Number(m.year) || null);
const isSelf = f => f.roles.length && f.roles.every(r => /^(him|her|them)self\b|^self\b/i.test(r));
const isCameo = f => f.roles.some(r => /cameo|special appearance|guest appearance/i.test(r));
const workOf = f => WORK.filter(([, re]) => f.jobs.some(j => re.test(j)));
const released = f => Boolean(f.date && f.date <= today);

// A film on this site: its own poster, or its title on its colours (as on the film page)
function sitePoster(m) {
  if (posterImage(m) || Object.hasOwn(HEROES, artFor(m))) return posterHTML(m, { compact: true, size: "w342" });
  return `<div class="poster poster-text" style="${posterStyle(m)}" aria-hidden="true"><span class="poster-title">${esc(m.title)}</span></div>`;
}
// The figure a film is known by: worldwide gross, else India net, else the opening day
function headline(m) {
  const ww = worldwideGross(m), net = indiaNet(m), open = openingDay(m);
  if (ww !== null) return [ww, "worldwide"];
  if (net !== null) return [net, `India net${boxOffice(m).running ? " so far" : ""}`];
  if (open !== null) return [open, "opening day"];
  return null;
}
function countdown(m) {
  const n = daysUntil(m);
  if (n === null) return m.releaseNote ? `Expected ${m.releaseNote}` : "Date to be announced";
  return n <= 0 ? "Releases today" : n === 1 ? "Releases tomorrow" : `Releases in ${n} days`;
}

// "34 years" from a birthday, to today or the day they died
function age(birthday, deathday) {
  const b = parseDay(birthday);
  if (!b) return null;
  const end = parseDay(deathday) || startOfToday();
  let years = end.getFullYear() - b.getFullYear();
  if (end.getMonth() < b.getMonth() || (end.getMonth() === b.getMonth() && end.getDate() < b.getDate())) years--;
  return years;
}

// ---------- Header ----------
function renderHeader(p, site) {
  const photo = star?.img || (p.photo ? `img/h632${p.photo}` : "");
  if (photo) $("personBackdrop").style.background = `url('${photo}') center / cover no-repeat`;
  // Their language: the cover's, else the commonest among their films here, else among their Indian films on TMDB
  const commonest = list => list.sort((a, b) => list.filter(x => x === b).length - list.filter(x => x === a).length)[0] || "";
  const lang = star?.lang || commonest(site.map(m => m.lang).filter(Boolean))
    || commonest(p.films.filter(f => f.acted || f.jobs.length).map(f => LANG_NAMES[f.lang]).filter(l => l && l !== "English"));
  const roles = [p.knownFor === "Directing" ? "Director" : "Actor", ...WORK.filter(([key]) => p.films.some(f => workOf(f).some(([k]) => k === key))).map(([, , label]) => label)];
  const years = age(p.birthday, p.deathday);
  const born = p.birthday ? `Born ${dayLabel(p.birthday)}${p.birthplace ? ` in ${esc(p.birthplace)}` : ""}` : p.birthplace ? `From ${esc(p.birthplace)}` : "";
  const lifeLine = [born, p.deathday ? `Died ${dayLabel(p.deathday)}` : "", years !== null ? `${years} years${p.deathday ? "" : " old"}` : ""].filter(Boolean);
  const intro = String(p.biography || "").split(/(?<=\.)\s+/).slice(0, 2).join(" ");

  // Calls to action from their films here: the next release while one is coming, else the latest one out
  // (its box office). They change on their own as films are added or released.
  const upcoming = site.filter(m => !isReleased(m)).sort((a, b) => (a.release || "9999").localeCompare(b.release || "9999"));
  const out = site.filter(isReleased).sort((a, b) => (b.release || String(b.year || "")).localeCompare(a.release || String(a.year || "")));
  const ctas = [];
  if (upcoming[0]) ctas.push(`<a class="btn btn-primary" href="film.html?id=${Number(upcoming[0].id)}">${icon("calendar-clock")}<span>Next: ${esc(upcoming[0].title)}</span></a>`);
  if (out[0]) ctas.push(`<a class="btn ${ctas.length ? "btn-ghost" : "btn-primary"}" href="film.html?id=${Number(out[0].id)}">${icon("bar-chart-3")}<span>${upcoming[0] ? "Latest" : "Latest box office"}: ${esc(out[0].title)}</span></a>`);
  if (!ctas.length) ctas.push(`<a class="btn btn-primary" href="#filmography">${icon("film")}<span>All ${plural(p.films.filter(f => f.acted).length, "film")}</span></a>`);
  if (lang) ctas.push(`<a class="btn btn-ghost" href="lists.html?lang=${encodeURIComponent(lang)}">${esc(lang)} box office lists</a>`);
  const nextDay = upcoming[0] && parseDay(upcoming[0].release);
  const upcomingNote = upcoming[0] ? `<p class="film-when"><span class="countdown">${esc(countdown(upcoming[0]))}</span>${nextDay ? `<span>${esc(dayLabel(nextDay, { weekday: true }))}</span>` : ""}</p>` : "";

  const links = [
    p.imdbId && `<a href="https://www.imdb.com/name/${esc(p.imdbId)}/" target="_blank" rel="noopener">IMDb${NEW_TAB}</a>`,
    `<a href="https://www.themoviedb.org/person/${Number(p.tmdbId)}" target="_blank" rel="noopener">TMDB${NEW_TAB}</a>`,
    p.instagram && `<a href="https://www.instagram.com/${esc(p.instagram)}/" target="_blank" rel="noopener">Instagram${NEW_TAB}</a>`,
    p.twitter && `<a href="https://x.com/${esc(p.twitter)}" target="_blank" rel="noopener">X${NEW_TAB}</a>`,
  ].filter(Boolean);

  const credit = star?.img && star.author
    ? `<figcaption class="person-photo-credit">Photo: ${esc(star.author)}, <a href="${esc(star.licenceUrl)}" target="_blank" rel="noopener license">${esc(star.licence)}${NEW_TAB}</a>, via <a href="${esc(star.source)}" target="_blank" rel="noopener">Wikimedia Commons${NEW_TAB}</a></figcaption>`
    : "";
  $("personHead").innerHTML = `
    <div class="film-head-info">
      <h1>${esc(p.name)}</h1>
      <p class="pipe-line film-meta">${[lang && esc(lang), lifeLine.join(" · ")].filter(Boolean).map(x => `<span>${x}</span>`).join("")}</p>
      ${intro ? `<p class="film-desc">${esc(intro)}</p>` : ""}
      <ul class="film-genres" aria-label="Work">${roles.map(r => `<li class="tag">${esc(r)}</li>`).join("")}</ul>
      ${upcomingNote}
      <div class="film-ctas">${ctas.join("")}</div>
      ${links.length ? `<p class="person-links">${links.join("")}</p>` : ""}
    </div>
    <figure class="person-photo">
      ${photo ? `<img src="${esc(photo)}" alt="${esc(p.name)}" width="400" height="400" decoding="async" fetchpriority="high">` : `<span class="person-initials" aria-hidden="true">${esc(p.name.slice(0, 1))}</span>`}
      ${credit}
    </figure>`;
}

// ---------- At a glance ----------
function statTile(label, value, sub = "") {
  return `<div class="stat-tile"><div class="stat-label">${label}</div><div class="stat-value">${value}</div>${sub ? `<div class="stat-sub">${sub}</div>` : ""}</div>`;
}
function renderGlance(p) {
  const acted = p.films.filter(f => f.acted && !isSelf(f));
  const done = acted.filter(released).sort((a, b) => a.date.localeCompare(b.date));
  const tiles = [];
  if (done.length) {
    tiles.push(statTile("Films as an actor", done.length.toLocaleString("en-IN"), `${done.filter(f => !isCameo(f)).length} in lead or supporting roles`));
    tiles.push(statTile("Debut", esc(String(done[0].year)), esc(done[0].title)));
    const last = done[done.length - 1];
    tiles.push(statTile("Years in films", `${Math.max(1, last.year - done[0].year + 1)}`, `${done[0].year}–${last.year}`));
  }
  const coming = acted.filter(f => !released(f)).length;
  if (coming) tiles.push(statTile("Coming up", coming, coming === 1 ? "film in the works" : "films in the works"));
  for (const [key, , , verb] of WORK) {
    const n = p.films.filter(f => workOf(f).some(([k]) => k === key)).length;
    if (n) tiles.push(statTile(verb, plural(n, "film"), ""));
  }
  if (!tiles.length) return false;
  const sec = $("glance");
  sec.innerHTML = `<div class="container">${sectionHead("glanceTitle", "At a glance", "Career figures from TMDB")}<div class="stat-grid">${tiles.join("")}</div></div>`;
  sec.hidden = false;
  return true;
}

// ---------- Box office: their films on this site ----------
function renderBoxOffice(p, site) {
  if (!site.length) return false;
  const credit = new Map(p.siteFilms.map(s => [s.movieId, s]));
  const byDate = [...site].sort((a, b) => (b.release || String(b.year || "")).localeCompare(a.release || String(a.year || "")));
  const out = site.filter(isReleased);
  const ww = out.map(m => [m, worldwideGross(m)]).filter(([, v]) => v !== null);
  const opening = out.map(m => [m, openingDay(m)]).filter(([, v]) => v !== null);
  const best = list => list.reduce((a, b) => (b[1] > a[1] ? b : a));
  const tiles = [statTile("Films on MANA CINEMA", site.length, out.length < site.length ? `${site.length - out.length} still to release` : "")];
  if (ww.length) {
    // A total of one film would only repeat its biggest hit
    if (ww.length > 1) tiles.push(statTile("Worldwide gross", `<span class="money">${crore(ww.reduce((s, [, v]) => s + v, 0))}</span>`, `across ${plural(ww.length, "film")}`));
    const [hit, v] = best(ww);
    tiles.push(statTile("Biggest hit", `<span class="money">${crore(v)}</span>`, `<a class="text-link" href="film.html?id=${Number(hit.id)}">${esc(hit.title)}</a> worldwide`));
  }
  if (opening.length) {
    const [m, v] = best(opening);
    tiles.push(statTile("Best opening day", `<span class="money">${crore(v)}</span>`, `<a class="text-link" href="film.html?id=${Number(m.id)}">${esc(m.title)}</a> India net`));
  }
  const cards = byDate.map(m => {
    const c = credit.get(m.id);
    const role = c?.roles.length ? `as ${c.roles.join(" / ")}` : c?.jobs.length ? c.jobs.join(", ") : "";
    const fig = isReleased(m) ? headline(m) : null;
    return `
      <a class="more-card" href="film.html?id=${Number(m.id)}">
        ${sitePoster(m)}
        <div class="more-info">
          <h3>${esc(m.title)}</h3>
          <p class="meta">${[m.lang, yearOfFilm(m)].filter(Boolean).map(esc).join(" · ")}</p>
          ${role ? `<p class="meta person-role">${esc(role)}</p>` : ""}
          <p class="more-figures">${isReleased(m) ? verdictHTML(m) : `<span class="countdown">${esc(countdown(m))}</span>`}${fig ? `<span><span class="money">${crore(fig[0])}</span> ${fig[1]}</span>` : ""}</p>
        </div>
      </a>`;
  }).join("");
  const sec = $("box-office");
  sec.innerHTML = `
    <div class="container">
      ${sectionHead("boxOfficeTitle", "Box office on MANA CINEMA", "India net and worldwide gross in ₹ crore, as tracked here")}
      <div class="stat-grid person-bo-stats">${tiles.join("")}</div>
      <div class="more-grid person-films">${cards}</div>
    </div>`;
  sec.hidden = false;
  return true;
}

// ---------- Biography ----------
function renderBiography(p) {
  const paras = String(p.biography || "").split(/\n+/).map(s => s.trim()).filter(Boolean);
  if (!paras.length) return false;
  const html = paras.map(s => `<p>${esc(s)}</p>`).join("");
  const long = paras.join(" ").length > 700;
  const sec = $("biography");
  sec.innerHTML = `
    <div class="container">
      ${sectionHead("biographyTitle", "Biography", "From TMDB")}
      <div class="person-bio${long ? " is-clamped" : ""}" id="bioText">${html}</div>
      ${long ? `<button type="button" class="btn btn-ghost btn-sm person-more" id="bioMore" aria-expanded="false" aria-controls="bioText">Read more</button>` : ""}
    </div>`;
  sec.hidden = false;
  $("bioMore")?.addEventListener("click", e => {
    const open = $("bioText").classList.toggle("is-clamped") === false;
    e.currentTarget.setAttribute("aria-expanded", open);
    e.currentTarget.textContent = open ? "Show less" : "Read more";
  });
  return true;
}

// ---------- Filmography ----------
function renderFilmography(p) {
  const films = p.films.filter(f => f.title)
    .sort((a, b) => (b.date || "9999").localeCompare(a.date || "9999") || a.title.localeCompare(b.title));
  if (!films.length) return false;
  const filters = [["all", "All"], ["acting", "Acting"], ...WORK.filter(([key]) => films.some(f => workOf(f).some(([k]) => k === key))).map(([key, , label]) => [key, label])];
  const count = key => films.filter(f => matches(f, key)).length;
  let filter = "all", shown = FILMOGRAPHY_STEP;

  function matches(f, key) {
    if (key === "all") return true;
    if (key === "acting") return f.acted;
    return workOf(f).some(([k]) => k === key);
  }
  function row(f) {
    const title = f.movieId
      ? `<a class="text-link" href="film.html?id=${Number(f.movieId)}">${esc(f.title)}</a><span class="person-onsite">${icon("bar-chart-3")}Box office</span>`
      : `<a href="https://www.themoviedb.org/movie/${Number(f.tmdbId)}" target="_blank" rel="noopener">${esc(f.title)}${NEW_TAB}</a>`;
    const parts = [
      f.roles.length && `as ${f.roles.join(" / ")}`,
      f.jobs.length && f.jobs.join(", "),
    ].filter(Boolean);
    const when = f.year ? String(f.year) : "TBA";
    return `
      <li class="person-film${released(f) ? "" : " is-upcoming"}">
        <span class="person-film-year">${esc(when)}${released(f) ? "" : `<small>Upcoming</small>`}</span>
        <span class="person-film-poster" aria-hidden="true">${f.poster ? `<img src="img/w92${esc(f.poster)}" alt="" width="46" height="69" loading="lazy" decoding="async">` : ""}</span>
        <span class="person-film-info">
          <span class="person-film-title">${title}</span>
          <span class="person-film-role">${[LANG_NAMES[f.lang] || "", ...parts].filter(Boolean).map(esc).join(" · ")}</span>
        </span>
      </li>`;
  }
  const sec = $("filmography");
  sec.innerHTML = `
    <div class="container">
      ${sectionHead("filmographyTitle", "Filmography", "Every film on TMDB, newest first. Films with box office here are linked.")}
      <div class="chips person-filters" role="group" aria-label="Show">
        ${filters.map(([key, label]) => `<button type="button" class="chip" data-filter="${key}" aria-pressed="${key === filter}">${esc(label)} <span class="chip-count">${count(key)}</span></button>`).join("")}
      </div>
      <ol class="person-film-list" id="filmList"></ol>
      <div class="person-list-foot"><button type="button" class="btn btn-ghost" id="filmMore" hidden></button></div>
    </div>`;
  const draw = () => {
    const list = films.filter(f => matches(f, filter));
    $("filmList").innerHTML = list.slice(0, shown).map(row).join("");
    const more = $("filmMore");
    more.hidden = list.length <= shown;
    more.textContent = `Show all ${list.length} films`;
    icons();
  };
  sec.querySelectorAll("[data-filter]").forEach(btn => btn.addEventListener("click", () => {
    filter = btn.dataset.filter;
    shown = FILMOGRAPHY_STEP;
    sec.querySelectorAll("[data-filter]").forEach(b => b.setAttribute("aria-pressed", b === btn));
    draw();
  }));
  $("filmMore").addEventListener("click", () => { shown = Infinity; draw(); });
  draw();
  sec.hidden = false;
  return true;
}

function renderSources(p) {
  const sec = $("sources");
  sec.innerHTML = `
    <div class="container">
      ${sectionHead("sourcesTitle", "Sources")}
      <p class="fine-print">Biography, career and filmography: TMDB. Box office: tracked on MANA CINEMA (see each film's sources).
        ${star?.img ? "The photo is from Wikimedia Commons, credited under it." : ""}</p>
      <p class="fine-print">${TMDB_CREDIT}</p>
    </div>`;
  sec.hidden = false;
}

function renderMissing(text) {
  document.title = "Person not found | MANA CINEMA";
  document.querySelector(".film-back").hidden = true;
  $("personHead").innerHTML = `
    <div class="film-missing">
      <h1>Person not found</h1>
      <p>${text}</p>
      <div class="film-missing-actions">
        <a class="btn btn-primary" href="index.html">${icon("home")}<span>Back to home</span></a>
        <a class="btn btn-ghost" href="index.html#films">${icon("film")}<span>Browse all films</span></a>
      </div>
    </div>`;
  icons();
}

async function load() {
  if (!personId) return renderMissing("This link doesn't name anyone. Pick a star on the home page.");
  if (!ONLINE) return renderMissing("Star pages need the MANA CINEMA server. Start it with npm start and open this page from it.");
  let res;
  try {
    res = await fetch(`api/people/tmdb/${personId}`, { headers: { accept: "application/json" } });
  } catch {
    $("personHead").innerHTML = `<p class="form-error">Couldn't load this page. Check your connection and try again.</p>`;
    return;
  }
  if (res.status === 404) return renderMissing("We couldn't find this person on MANA CINEMA. The link may be mistyped.");
  if (!res.ok) { $("personHead").innerHTML = `<p class="form-error">Couldn't load this page right now. Try again in a minute.</p>`; return; }
  const { person: p } = await res.json();
  if (star) p.name = star.name;   // the name on the circle they clicked ("Jr NTR", not TMDB's "N.T. Rama Rao Jr.")
  document.title = `${p.name}: Films, Box Office & Biography | MANA CINEMA`;
  // Their films here: credited on the film, or matched through TMDB
  const ids = new Set([...p.siteFilms.map(s => s.movieId), ...p.films.filter(f => f.movieId).map(f => f.movieId)]);
  const site = [...ids].map(getMovie).filter(Boolean);
  renderHeader(p, site);
  const jumps = [
    renderGlance(p) && ["glance", "At a glance"],
    renderBoxOffice(p, site) && ["box-office", "Box office"],
    renderBiography(p) && ["biography", "Biography"],
    renderFilmography(p) && ["filmography", "Filmography"],
  ].filter(Boolean);
  renderSources(p);
  const tabs = $("personTabs");
  tabs.innerHTML = `<ul>${jumps.map(([id, label]) => `<li><a href="#${id}">${label}</a></li>`).join("")}</ul>`;
  tabs.hidden = !jumps.length;
  markPhotos();
  icons();
}

load();
