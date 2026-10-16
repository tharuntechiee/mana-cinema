// TMDB (https://www.themoviedb.org): the full cast and crew of every film, with photos, and IMDb IDs for
// films the IMDb title match missed. Needs a free API key in .env (TMDB_API_KEY): the v3 "API key" or the
// longer "API Read Access Token" both work. Credit shown on the site:
// "This website uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB."
// (their terms of use also ask for the TMDB logo, less prominent than ours: add it next to this notice)
import { db, filmsChanged, replaceCredits } from "../db.js";
import { config } from "../env.js";

const API = "https://api.themoviedb.org/3";
const LANGUAGE_CODES = { Hindi: "hi", Telugu: "te", Tamil: "ta", Malayalam: "ml", Kannada: "kn", Marathi: "mr", Bengali: "bn", Punjabi: "pa", Gujarati: "gu" };
const pause = ms => new Promise(r => setTimeout(r, ms));

// Some networks (a few Indian ISPs in particular) reset connections to api.themoviedb.org on some of its
// addresses and not others, so the same request can fail once and pass on the next try. A failed connection
// is retried a few times; if it keeps failing, the error says what to try instead of Node's bare "fetch failed".
const NETWORK_TRIES = 8;
const reason = err => err?.cause?.code || err?.cause?.message || err?.name || "network error";

async function tmdb(pathname, params = {}) {
  const url = new URL(API + pathname);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  const headers = { accept: "application/json" };
  if (config.tmdbKey.startsWith("eyJ")) headers.Authorization = `Bearer ${config.tmdbKey}`;
  else url.searchParams.set("api_key", config.tmdbKey);
  let busy = 0;
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
    } catch (err) {
      if (attempt + 1 >= NETWORK_TRIES) {
        throw Object.assign(new Error(`Couldn't reach TMDB (${reason(err)}). Your network may be blocking api.themoviedb.org: try a different DNS server (1.1.1.1 or 8.8.8.8) or a VPN, then run the sync again. It carries on where it stopped.`), { network: true });
      }
      await pause(Math.min(4000, 400 * (attempt + 1)));
      continue;
    }
    if ((res.status === 429 || res.status >= 500) && busy++ < 4) { await pause((Number(res.headers.get("retry-after")) || 2) * 1000); continue; }
    if (res.status === 401) throw new Error("TMDB refused the key. Check TMDB_API_KEY in .env.");
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`TMDB answered ${res.status} for ${pathname}`);
    return res.json();
  }
}

const yearOf = date => Number(String(date || "").slice(0, 4)) || null;

// The TMDB film for one of ours: by IMDb ID, else by title, year and original language
async function findTmdbId(film) {
  if (film.imdb_id) {
    const found = await tmdb(`/find/${film.imdb_id}`, { external_source: "imdb_id" });
    if (found?.movie_results?.[0]?.id) return found.movie_results[0].id;
  }
  const lang = LANGUAGE_CODES[film.lang];
  const results = (await tmdb("/search/movie", { query: film.title, year: film.year || undefined, include_adult: "false" }))?.results || [];
  const near = results.filter(r => !film.year || !yearOf(r.release_date) || Math.abs(yearOf(r.release_date) - film.year) <= 1);
  return (near.find(r => r.original_language === lang) || (!lang && near.length === 1 ? near[0] : null))?.id || null;
}

export async function syncTmdb({ log, movieIds, refresh = false }) {
  if (!config.tmdbKey) return "Skipped: add TMDB_API_KEY to .env to load full cast and crew from TMDB.";
  const films = db.prepare(`
    SELECT m.id, m.title, m.lang, m.year, m.imdb_id, m.tmdb_id,
           (SELECT MAX(source) FROM credits c WHERE c.movie_id = m.id) AS source
    FROM movies m ORDER BY m.release_date DESC NULLS LAST, m.id
  `).all().filter(f => (movieIds ? movieIds.includes(f.id) : refresh || f.source !== "tmdb"));
  if (!films.length) return "Every film already has TMDB's cast and crew.";
  log(`Asking TMDB about ${films.length} films...`);
  const imdbTaken = new Set(db.prepare("SELECT imdb_id FROM movies WHERE imdb_id IS NOT NULL").all().map(r => r.imdb_id));
  let loaded = 0, ids = 0, streak = 0;
  const missed = [], unreachable = [];
  for (const [i, film] of films.entries()) {
    let tmdbId, m;
    try {
      tmdbId = film.tmdb_id || await findTmdbId(film);
      m = tmdbId ? await tmdb(`/movie/${tmdbId}`, { append_to_response: "credits,external_ids" }) : null;
      streak = 0;
    } catch (err) {
      // One film that keeps failing is skipped and tried again next run; a bad key or a dead network stops the sync
      if (!err.network || ++streak >= 4) { filmsChanged(); throw err; }
      unreachable.push(film.title);
      log(`  Skipped ${film.title}: ${err.message.split(". ")[0]}.`);
      continue;
    }
    if (!tmdbId || !m) { missed.push(film.title); continue; }
    const imdbId = m.external_ids?.imdb_id || m.imdb_id || null;
    if (!film.imdb_id && imdbId && !imdbTaken.has(imdbId)) {
      db.prepare("UPDATE movies SET imdb_id = ?, imdb_source = 'tmdb' WHERE id = ? AND imdb_id IS NULL").run(imdbId, film.id);
      imdbTaken.add(imdbId);
      ids++;
    }
    if (!film.tmdb_id) db.prepare("UPDATE movies SET tmdb_id = ? WHERE id = ?").run(tmdbId, film.id);
    const seen = new Set();
    const people = [
      ...(m.credits?.cast || []).sort((a, b) => a.order - b.order).map(c => ({
        kind: "cast", name: c.name, tmdbId: c.id, photo: c.profile_path || null, character: c.character || "",
      })),
      ...(m.credits?.crew || []).filter(c => {
        const key = `${c.id}:${c.job}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).map(c => ({ kind: "crew", name: c.name, tmdbId: c.id, photo: c.profile_path || null, department: c.department || "Crew", job: c.job || "" })),
    ].filter(p => p.name);
    if (people.length) { replaceCredits(film.id, "tmdb", people); loaded++; }
    if ((i + 1) % 20 === 0) log(`  ${i + 1} of ${films.length} films done`);
    await pause(60);   // well under TMDB's rate limit
  }
  filmsChanged();
  if (missed.length) log(`Not found on TMDB (${missed.length}): ${missed.slice(0, 40).join("; ")}${missed.length > 40 ? "; ..." : ""}`);
  const later = unreachable.length ? ` ${unreachable.length} couldn't be reached: run the sync again to finish them.` : "";
  return `Loaded TMDB's full cast and crew for ${loaded} films${ids ? ` and found ${ids} more IMDb IDs` : ""}. ${missed.length} not found on TMDB.${later}`;
}
