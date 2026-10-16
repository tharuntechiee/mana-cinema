// IMDb's official datasets (https://developer.imdb.com/non-commercial-datasets/): free for personal and
// non-commercial use, refreshed daily, no key needed. Credit shown on the site:
// "Information courtesy of IMDb (https://www.imdb.com). Used with permission."
//
//   match    title.basics.tsv.gz      (~230 MB)  finds each film's IMDb ID by title, year and runtime
//   ratings  title.ratings.tsv.gz     (~9 MB)    IMDb rating and votes for every matched film
//   credits  title.principals.tsv.gz  (~790 MB)  principal cast and crew (actors, director, writers, music...)
//            name.basics.tsv.gz       (~310 MB)  their names
//
// Matching is careful, because a wrong match puts another film's rating on the page:
//   1. same title (or the part before a colon) and year, scored by runtime and popularity
//   2. otherwise a close title ("Pushpa: The Rule - Part 2" for "Pushpa 2: The Rule") in the same year
//   3. the catalogue's own IMDb snapshot, where there is one, must agree
//   4. once the cast and crew are read, the catalogue's director or stars must be among them, or the match
//      is undone and remembered as wrong. Two equally likely titles ("Leo", 2023) are settled the same way.
// IDs the admin typed in the film form are never changed.
import { db, tx, todayIST, filmsChanged, replaceCredits, getMeta, setMeta } from "../db.js";
import { loadCatalogue } from "../seed.js";
import { openGzip, scanLines } from "./download.js";

const BASE = "https://datasets.imdbws.com/";
const MISSING = "\\N";
const cell = x => (x === undefined || x === MISSING ? null : x);
const parseJSON = (text, fallback) => { try { return JSON.parse(text); } catch { return fallback; } };
const plain = s => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

// "Pushpa 2: The Rule" and "Pushpa 2 - The Rule" -> "pushpa2therule"
export function normTitle(s) {
  return plain(s).replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
}
// "2h 34m" -> 154, "154 min" -> 154
export function runtimeMinutes(text) {
  const s = String(text || "");
  const h = /(\d+)\s*h/i.exec(s), m = /(\d+)\s*m/i.exec(s);
  if (h || m) return Number(h?.[1] || 0) * 60 + Number(m?.[1] || 0) || null;
  return /^\d+$/.test(s.trim()) ? Number(s) : null;
}
// The full title is a strong match; the part before a colon, or without "Part 1", only a weak one
function titleKeys(title) {
  const full = normTitle(title);
  const weak = new Set([
    normTitle(String(title).split(/[:–—]| - /)[0]),
    normTitle(String(title).replace(/\b(part|chapter)\s+(1|one|i)\b/i, "")),
  ]);
  weak.delete(full);
  weak.delete("");
  return [{ key: full, strong: true }, ...[...weak].filter(k => k.length >= 4).map(key => ({ key, strong: false }))];
}

// ---------- Close titles ----------
const TITLE_STOP = new Set(["the", "a", "an", "of", "and", "part", "chapter", "movie", "film"]);
const NUMBER_WORDS = { i: "1", ii: "2", iii: "3", iv: "4", one: "1", two: "2", three: "3", four: "4" };
const titleTokens = s => plain(s).replace(/&/g, " and ").split(/[^a-z0-9]+/)
  .map(t => NUMBER_WORDS[t] || t).filter(t => t && !TITLE_STOP.has(t));
function nearlySame(a, b) {   // one letter apart, for long words: "Vasthunam" / "Vasthunnam"
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}
// Shared words over all words (0 to 1), allowing a one-letter difference in long words
function titleSimilarity(a, b) {
  const left = [...b];
  let shared = 0;
  for (const t of a) {
    const k = left.findIndex(u => nearlySame(t, u));
    if (k >= 0) { shared++; left.splice(k, 1); }
  }
  return shared / (a.length + b.length - shared || 1);
}

// ---------- Names: does IMDb's cast and crew include the catalogue's director or stars? ----------
const nameTokens = s => plain(s).replace(/[^a-z\s]/g, " ").split(/\s+/).filter(w => w.length >= 2 && !["jr", "sr", "dr"].includes(w));
function samePerson(a, b) {
  const x = nameTokens(a), y = nameTokens(b);
  if (!x.length || !y.length) return false;
  const [small, big] = x.length <= y.length ? [x, y] : [y, x];
  return small.every(t => big.includes(t)) && small.some(t => t.length >= 4);
}
// "Pawan Kalyan, Emraan Hashmi & Priyanka" -> three names
const catalogueNames = details => [details.director, details.cast]
  .flatMap(s => String(s || "").split(/,|&|\/|\band\b/i)).map(s => s.trim()).filter(Boolean);
const namesAgree = (imdbNames, names) => imdbNames.some(n => names.some(c => samePerson(n, c)));

// Wrong matches found by the name check, so the next match run skips them
const rejected = () => parseJSON(getMeta("imdb_rejected") || "{}", {});
const pending = () => parseJSON(getMeta("imdb_pending") || "{}", {});

// Ratings for a set of IMDb IDs from today's ratings file
async function readRatings(ids, log) {
  const out = new Map();
  if (!ids.size) return out;
  const stream = await openGzip(`${BASE}title.ratings.tsv.gz`, { cacheHours: 20, log });
  await scanLines(stream, line => {
    const tconst = line.slice(0, line.indexOf("\t"));
    if (!ids.has(tconst)) return;
    const [, rating, votes] = line.split("\t");
    out.set(tconst, { rating: Number(rating), votes: Number(votes) });
  }, { log, label: "ratings" });
  return out;
}

const saveRating = (movieId, r, asOf) => db.prepare(`
  INSERT INTO imdb_ratings (movie_id, rating, votes, as_of, source) VALUES (?, ?, ?, ?, 'imdb')
  ON CONFLICT (movie_id) DO UPDATE SET rating = excluded.rating, votes = excluded.votes, as_of = excluded.as_of, source = 'imdb'
`).run(movieId, r.rating, r.votes, asOf);

// ---------- match: IMDb IDs ----------
export async function matchIds({ log, movieIds }) {
  const films = db.prepare("SELECT id, title, year, details FROM movies WHERE imdb_id IS NULL ORDER BY id").all()
    .filter(f => !movieIds || movieIds.includes(f.id))
    .map(f => {
      const details = parseJSON(f.details, {});
      return { id: f.id, title: f.title, year: f.year, runtime: runtimeMinutes(details.duration), names: catalogueNames(details), tokens: titleTokens(f.title) };
    });
  if (!films.length) return "Every film already has an IMDb ID.";
  const known = new Map(db.prepare("SELECT movie_id, rating, votes FROM imdb_ratings WHERE source != 'imdb'").all().map(r => [r.movie_id, r]));
  const wrong = rejected();

  const byKey = new Map(), byToken = new Map();
  const push = (map, key, value) => { if (!map.has(key)) map.set(key, []); map.get(key).push(value); };
  for (const f of films) {
    for (const { key, strong } of titleKeys(f.title)) push(byKey, key, { film: f, strong });
    for (const t of new Set(f.tokens)) if (t.length >= 4) push(byToken, t, f);
  }
  const exact = new Map(films.map(f => [f.id, new Map()]));   // film id -> tconst -> candidate
  const close = new Map(films.map(f => [f.id, new Map()]));

  log(`Matching ${films.length} films against IMDb's title list...`);
  const stream = await openGzip(`${BASE}title.basics.tsv.gz`, { log });
  await scanLines(stream, line => {
    // tconst titleType primaryTitle originalTitle isAdult startYear endYear runtimeMinutes genres
    const a = line.indexOf("\t"), b = line.indexOf("\t", a + 1);
    const type = line.slice(a + 1, b);
    if (type !== "movie" && type !== "tvMovie") return;
    const cols = line.split("\t");
    const year = Number(cell(cols[5]));
    if (!year) return;
    const base = { tconst: cols[0], title: cols[2], year, type, runtime: Number(cell(cols[7])) || null };
    for (const key of new Set([normTitle(cols[2]), normTitle(cols[3])])) {
      for (const { film, strong } of byKey.get(key) || []) {
        if (Math.abs(year - film.year) > 1 || wrong[film.id]?.includes(cols[0])) continue;
        const prev = exact.get(film.id).get(cols[0]);
        if (!prev || (strong && !prev.strong)) exact.get(film.id).set(cols[0], { ...base, strong });
      }
    }
    for (const title of new Set([cols[2], cols[3]])) {
      const tokens = titleTokens(title);
      const seen = new Set();
      for (const t of tokens) {
        for (const film of byToken.get(t) || []) {
          if (seen.has(film.id) || Math.abs(year - film.year) > 1 || wrong[film.id]?.includes(cols[0])) continue;
          seen.add(film.id);
          const sim = titleSimilarity(film.tokens, tokens);
          const prev = close.get(film.id).get(cols[0]);
          if (sim >= 0.6 && (!prev || sim > prev.sim)) close.get(film.id).set(cols[0], { ...base, sim });
        }
      }
    }
  }, { log, label: "titles" });

  const wanted = new Set([...exact.values(), ...close.values()].flatMap(m => [...m.keys()]));
  const ratings = await readRatings(wanted, log);
  const taken = new Set(db.prepare("SELECT imdb_id FROM movies WHERE imdb_id IS NOT NULL").all().map(r => r.imdb_id));
  const runtimePoints = (f, c) => (f.runtime && c.runtime ? (Math.abs(f.runtime - c.runtime) <= 8 ? 2 : Math.abs(f.runtime - c.runtime) <= 20 ? 1 : -1) : 0);
  const withVotes = c => ({ ...c, votes: ratings.get(c.tconst)?.votes || 0, rating: ratings.get(c.tconst)?.rating ?? null });
  // The catalogue's own IMDb snapshot (typed by our team) must agree, where there is one
  const disagrees = (f, c) => {
    const k = known.get(f.id);
    return Boolean(k && c.rating !== null && (Math.abs(c.rating - k.rating) > 0.8 || (k.votes > 1000 && (c.votes < k.votes * 0.5 || c.votes > k.votes * 3))));
  };

  const matched = [], unclear = [], notFound = [], waiting = pending();
  const setId = db.prepare("UPDATE movies SET imdb_id = ?, imdb_source = ? WHERE id = ? AND imdb_id IS NULL");
  const accept = (f, c, how) => { setId.run(c.tconst, how, f.id); taken.add(c.tconst); matched.push(f.title); delete waiting[f.id]; };
  // Two equally likely titles: settled by the names once cast and crew are read, if the catalogue has names
  const ambiguous = (f, list, note) => {
    if (f.names.length) waiting[f.id] = list.slice(0, 3).map(c => c.tconst);
    unclear.push(`${f.title} (${note}${f.names.length ? "; checking the cast and crew next" : ""})`);
  };

  tx(() => {
    for (const f of films) {
      const strong = [...exact.get(f.id).values()].map(withVotes)
        .map(c => ({ ...c, score: (c.strong ? 4 : 1) + (c.year === f.year ? 3 : 0) + (c.type === "movie" ? 1 : 0) + runtimePoints(f, c) }))
        .filter(c => !taken.has(c.tconst))
        .sort((x, y) => y.score - x.score || y.votes - x.votes);
      const near = [...close.get(f.id).values()].map(withVotes)
        .filter(c => !taken.has(c.tconst) && (c.year === f.year || c.sim === 1))
        .map(c => ({ ...c, score: c.sim * 4 + (c.year === f.year ? 3 : 0) + (c.type === "movie" ? 1 : 0) + runtimePoints(f, c) }))
        .sort((x, y) => y.score - x.score || y.votes - x.votes);
      const list = strong.length ? strong : near;
      const [best, second] = list;
      if (!best) { notFound.push(f.title); continue; }
      if (second && Math.abs(second.score - best.score) < 0.01 && second.votes * 3 > best.votes) {
        ambiguous(f, list, `${best.tconst} "${best.title}" or ${second.tconst} "${second.title}"`);
        continue;
      }
      if (disagrees(f, best)) {
        unclear.push(`${f.title} (${best.tconst}: IMDb ${best.rating} from ${best.votes} votes, our snapshot says ${known.get(f.id).rating})`);
        continue;
      }
      if (strong.length) {
        if (!best.strong && !(best.year === f.year && (best.votes >= 500 || best.score >= 6))) { unclear.push(`${f.title} (maybe "${best.title}", ${best.tconst})`); continue; }
        accept(f, best, "title");
      } else if (known.has(f.id) || f.names.length || (best.sim >= 0.75 && best.votes >= 1000)) {
        // A close title: the snapshot agreed, or the name check will confirm it, or it's a clear, popular match
        accept(f, best, "fuzzy");
        log(`  ${f.title} -> "${best.title}" (${best.year}, ${best.tconst})`);
      } else {
        unclear.push(`${f.title} (maybe "${best.title}", ${best.tconst})`);
      }
    }
    setMeta("imdb_pending", JSON.stringify(waiting));
  });
  filmsChanged();
  if (unclear.length) log(`Not sure about ${unclear.length}: ${unclear.slice(0, 40).join("; ")}${unclear.length > 40 ? "; ..." : ""}`);
  if (notFound.length) log(`Not found on IMDb's list (${notFound.length}): ${notFound.slice(0, 40).join("; ")}${notFound.length > 40 ? "; ..." : ""}`);
  return `Matched ${matched.length} of ${films.length} films to IMDb. ${unclear.length} unclear and ${notFound.length} not found: add their IMDb IDs in the film form.`;
}

// ---------- ratings ----------
export async function syncRatings({ log, movieIds }) {
  const films = db.prepare("SELECT id, imdb_id FROM movies WHERE imdb_id IS NOT NULL").all().filter(f => !movieIds || movieIds.includes(f.id));
  if (!films.length) return "No film has an IMDb ID yet. Run \"Match films to IMDb\" first, or add IDs in the film form.";
  const ratings = await readRatings(new Set(films.map(f => f.imdb_id)), log);
  const asOf = todayIST();
  let n = 0;
  tx(() => {
    for (const f of films) {
      const r = ratings.get(f.imdb_id);
      if (!r || !(r.rating > 0)) continue;
      saveRating(f.id, r, asOf);
      n++;
    }
  });
  filmsChanged();
  return `Updated ${n} IMDb ratings.${films.length > n ? ` ${films.length - n} matched films have no IMDb rating yet (too few votes or not out).` : ""}`;
}

// ---------- credits: principal cast and crew ----------
const CATEGORIES = {
  actor: { kind: "cast" }, actress: { kind: "cast" }, self: { kind: "cast" },
  director: { kind: "crew", department: "Directing", job: "Director" },
  writer: { kind: "crew", department: "Writing", job: "Writer" },
  producer: { kind: "crew", department: "Production", job: "Producer" },
  composer: { kind: "crew", department: "Sound", job: "Music" },
  cinematographer: { kind: "crew", department: "Camera", job: "Cinematography" },
  editor: { kind: "crew", department: "Editing", job: "Editor" },
  production_designer: { kind: "crew", department: "Art", job: "Production design" },
  casting_director: { kind: "crew", department: "Production", job: "Casting" },
};
const capitalise = s => s.charAt(0).toUpperCase() + s.slice(1);

// A match the name check proved wrong: the film loses the ID, its IMDb cast and its IMDb rating (the
// catalogue's snapshot comes back), and the ID is remembered so the next match skips it
function undoMatch(film, catalogue) {
  const wrong = rejected();
  wrong[film.id] = [...new Set([...(wrong[film.id] || []), film.imdb_id])];
  setMeta("imdb_rejected", JSON.stringify(wrong));
  db.prepare("UPDATE movies SET imdb_id = NULL, imdb_source = NULL WHERE id = ?").run(film.id);
  db.prepare("DELETE FROM credits WHERE movie_id = ?").run(film.id);
  if (db.prepare("SELECT source FROM imdb_ratings WHERE movie_id = ?").get(film.id)?.source === "imdb") {
    db.prepare("DELETE FROM imdb_ratings WHERE movie_id = ?").run(film.id);
    const snap = catalogue.get(film.id)?.critics?.imdb;
    if (snap?.score) {
      db.prepare("INSERT INTO imdb_ratings (movie_id, rating, votes, as_of, source) VALUES (?, ?, ?, ?, 'seed')")
        .run(film.id, Number(snap.score), Number(String(snap.votes || "").replace(/[^\d]/g, "")) || null, snap.asOf || null);
    }
  }
}

export async function syncCredits({ log, movieIds, refresh = false }) {
  // TMDB's credits are fuller, so films that have them keep them
  const rows = db.prepare(`
    SELECT m.id, m.title, m.imdb_id, m.imdb_source, m.details, (SELECT MAX(source) FROM credits c WHERE c.movie_id = m.id) AS source
    FROM movies m
  `).all().map(f => ({ ...f, names: catalogueNames(parseJSON(f.details, {})) }));
  const films = rows.filter(f => f.imdb_id && (!movieIds || movieIds.includes(f.id)) && f.source !== "tmdb" && (refresh || movieIds || !f.source));
  const waiting = pending();
  const open = rows.filter(f => !f.imdb_id && waiting[f.id] && (!movieIds || movieIds.includes(f.id)));
  if (!films.length && !open.length) return "Cast and crew are already loaded for every film with an IMDb ID.";

  const want = new Set([...films.map(f => f.imdb_id), ...open.flatMap(f => waiting[f.id])]);
  const credits = new Map();
  log(`Reading cast and crew for ${films.length + open.length} films. This file is big: it takes a few minutes.`);
  await scanLines(await openGzip(`${BASE}title.principals.tsv.gz`, { log }), line => {
    // tconst ordering nconst category job characters
    const tconst = line.slice(0, line.indexOf("\t"));
    if (!want.has(tconst)) return;
    const [, ordering, nconst, category, job, characters] = line.split("\t");
    if (!CATEGORIES[category]) return;   // archive footage and the like
    if (!credits.has(tconst)) credits.set(tconst, []);
    credits.get(tconst).push({ ordering: Number(ordering), nconst, category, job: cell(job), characters: cell(characters) });
  }, { log, label: "credits" });

  const need = new Set([...credits.values()].flat().map(r => r.nconst));
  const names = new Map();
  log(`Looking up ${need.size} names...`);
  await scanLines(await openGzip(`${BASE}name.basics.tsv.gz`, { log }), line => {
    // nconst primaryName birthYear deathYear primaryProfession knownForTitles
    const nconst = line.slice(0, line.indexOf("\t"));
    if (!need.has(nconst)) return;
    const [, name, birth, death] = line.split("\t");
    names.set(nconst, { name, birthYear: Number(cell(birth)) || null, deathYear: Number(cell(death)) || null });
  }, { log, label: "names" });

  const peopleOf = tconst => (credits.get(tconst) || []).sort((a, b) => a.ordering - b.ordering).flatMap(r => {
    const who = names.get(r.nconst);
    if (!who) return [];
    const cat = CATEGORIES[r.category];
    const base = { kind: cat.kind, name: who.name, imdbId: r.nconst, birthYear: who.birthYear, deathYear: who.deathYear };
    if (cat.kind === "cast") return [{ ...base, character: parseJSON(r.characters || "[]", []).join(" / ") }];
    return [{ ...base, department: cat.department, job: r.job ? capitalise(r.job) : cat.job }];
  });

  const catalogue = new Map(loadCatalogue().movies.map(m => [m.id, m]));
  const taken = new Set(rows.map(f => f.imdb_id).filter(Boolean));
  let filled = 0;
  const settled = [], undone = [];
  tx(() => {
    // Two equally likely titles: the one whose cast and crew include the catalogue's names
    for (const f of open) {
      const fits = waiting[f.id].filter(t => !taken.has(t) && namesAgree(peopleOf(t).map(p => p.name), f.names));
      if (fits.length !== 1) continue;
      db.prepare("UPDATE movies SET imdb_id = ?, imdb_source = 'credits' WHERE id = ?").run(fits[0], f.id);
      taken.add(fits[0]);
      delete waiting[f.id];
      films.push({ ...f, imdb_id: fits[0], imdb_source: "credits" });
      settled.push(f.title);
    }
    setMeta("imdb_pending", JSON.stringify(waiting));
    for (const f of films) {
      const people = peopleOf(f.imdb_id);
      if (!people.length) continue;
      if (f.imdb_source !== "admin" && f.names.length && !namesAgree(people.map(p => p.name), f.names)) {
        undoMatch(f, catalogue);
        undone.push(`${f.title} (${f.imdb_id})`);
        continue;
      }
      replaceCredits(f.id, "imdb", people);
      filled++;
    }
  });

  // Ratings for films whose match was settled just now
  if (settled.length) {
    const ids = rows.filter(f => settled.includes(f.title)).map(f => f.id);
    const now = db.prepare(`SELECT id, imdb_id FROM movies WHERE id IN (${ids.map(() => "?").join(",")})`).all(...ids);
    const ratings = await readRatings(new Set(now.map(f => f.imdb_id)), log);
    tx(() => { for (const f of now) if (ratings.get(f.imdb_id)?.rating > 0) saveRating(f.id, ratings.get(f.imdb_id), todayIST()); });
  }
  filmsChanged();
  if (settled.length) log(`Settled by cast and crew: ${settled.join("; ")}`);
  if (undone.length) log(`Undid ${undone.length} matches whose cast and crew don't include the catalogue's names: ${undone.join("; ")}`);
  return `Loaded IMDb's cast and crew for ${filled} films.${settled.length ? ` Settled ${settled.length} unclear matches.` : ""}${undone.length ? ` Undid ${undone.length} wrong matches.` : ""}`;
}
