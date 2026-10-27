// TMDB (https://www.themoviedb.org): the full cast and crew of every film, with photos, and IMDb IDs for
// films the IMDb title match missed. Needs a free API key in .env (TMDB_API_KEY): the v3 "API key" or the
// longer "API Read Access Token" both work. Credit shown on the site:
// "This website uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB."
// (their terms of use also ask for the TMDB logo, less prominent than ours: add it next to this notice)
import { db, tx, filmsChanged, replaceCredits } from "../db.js";
import { config } from "../env.js";
import https from "node:https";
import dns from "node:dns";

const API = "https://api.themoviedb.org/3";
const LANGUAGE_CODES = { Hindi: "hi", Telugu: "te", Tamil: "ta", Malayalam: "ml", Kannada: "kn", Marathi: "mr", Bengali: "bn", Punjabi: "pa", Gujarati: "gu" };
const pause = ms => new Promise(r => setTimeout(r, ms));

// Some networks (a few Indian ISPs in particular) reset connections to api.themoviedb.org on some of its
// addresses and not others, so the same request can fail once and pass on the next try. A failed connection
// is retried a few times; if it keeps failing, the error says what to try instead of Node's bare "fetch failed".
const NETWORK_TRIES = 8;

// Some ISPs' DNS (Jio, sometimes Airtel) answers themoviedb.org with a blocking address. TMDB's own advice
// is to use another resolver, so TMDB requests look the name up through public DNS (TMDB_DNS in .env,
// default 1.1.1.1 and 8.8.8.8) and fall back to the computer's normal DNS if that fails.
// Only TMDB requests are affected; the rest of the computer keeps its own settings.
const TMDB_DNS = String(process.env.TMDB_DNS ?? "1.1.1.1,8.8.8.8").split(",").map(x => x.trim()).filter(Boolean);
const resolver = new dns.Resolver({ timeout: 4000, tries: 2 });
if (TMDB_DNS.length) resolver.setServers(TMDB_DNS);
function publicLookup(hostname, options, callback) {
  if (typeof options === "function") { callback = options; options = {}; }
  if (!TMDB_DNS.length) return dns.lookup(hostname, options, callback);
  resolver.resolve4(hostname, (err, addresses) => {
    if (err || !addresses?.length) return dns.lookup(hostname, options, callback);
    if (options?.all) return callback(null, addresses.map(address => ({ address, family: 4 })));
    callback(null, addresses[0], 4);
  });
}
const agent = new https.Agent({ keepAlive: true, maxSockets: 6, lookup: publicLookup });

// GET returning { status, headers, json() } like fetch, through the agent above
function get(url, headers, timeout) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers, agent, timeout }, res => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, headers: { get: h => res.headers[h.toLowerCase()] ?? null }, json: async () => JSON.parse(text) });
      });
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(Object.assign(new Error("timed out"), { cause: { code: "ETIMEDOUT" } })));
    req.on("error", err => reject(Object.assign(new Error("request failed"), { cause: err })));
  });
}
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
      res = await get(url, headers, 20000);
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

// ---------- images: every poster, backdrop and logo, and one poster per film ----------
// One unfiltered /movie/{id}/images call per film (a language filter would drop images). Every image is
// stored; the best poster is approved and used across the site. Choice: text in the film's own language,
// then English, then no text; within that, TMDB's votes, then size. An admin's choice is never changed.
const preferLang = film => [LANGUAGE_CODES[film.lang], "en", null];
function pickPoster(film, posters) {
  const order = preferLang(film);
  const langRank = p => { const i = order.indexOf(p.iso_639_1 ?? null); return i < 0 ? order.length : i; };
  return [...posters].filter(p => p.width >= 500)
    .sort((a, b) => langRank(a) - langRank(b) || (b.vote_average || 0) - (a.vote_average || 0) || (b.vote_count || 0) - (a.vote_count || 0) || b.width - a.width)[0] || posters[0] || null;
}

export async function syncImages({ log, movieIds }) {
  if (!config.tmdbKey) return "Skipped: add TMDB_API_KEY to .env to fetch images from TMDB.";
  const films = db.prepare("SELECT id, title, lang, tmdb_id FROM movies WHERE tmdb_id IS NOT NULL ORDER BY id").all()
    .filter(f => !movieIds || movieIds.includes(f.id));
  if (!films.length) return "No film has a TMDB ID yet. Run \"Full cast and crew from TMDB\" first.";
  log(`Fetching images for ${films.length} films from TMDB...`);
  const now = new Date().toISOString();
  const upsert = db.prepare(`
    INSERT INTO movie_images (movie_id, tmdb_id, kind, file_path, width, height, aspect_ratio, lang, country, vote_average, vote_count, rank, first_seen, last_seen)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (movie_id, kind, file_path) DO UPDATE SET tmdb_id = excluded.tmdb_id, width = excluded.width, height = excluded.height,
      aspect_ratio = excluded.aspect_ratio, lang = excluded.lang, country = excluded.country, vote_average = excluded.vote_average,
      vote_count = excluded.vote_count, rank = excluded.rank, last_seen = excluded.last_seen, gone_at = NULL
  `);
  let stored = 0, posters = 0, failed = 0;
  const empty = [];
  for (const [i, film] of films.entries()) {
    let res;
    try { res = await tmdb(`/movie/${film.tmdb_id}/images`); } catch (err) {
      if (!err.network) throw err;
      failed++;
      log(`  Skipped ${film.title}: ${err.message.split(". ")[0]}.`);
      continue;
    }
    if (!res) { failed++; continue; }   // a 404 means "no answer", not "every image gone"
    const kinds = { poster: res.posters || [], backdrop: res.backdrops || [], logo: res.logos || [] };
    tx(() => {
      for (const [kind, list] of Object.entries(kinds)) {
        list.forEach((img, rank) => {
          const file = String(img.file_path || "").replace(/^\//, "");
          if (!/^[A-Za-z0-9]{8,64}\.(jpg|png)$/.test(file)) return;
          upsert.run(film.id, film.tmdb_id, kind, file, img.width ?? null, img.height ?? null, img.aspect_ratio ?? null,
            img.iso_639_1 ?? null, img.iso_3166_1 ?? null, img.vote_average ?? null, img.vote_count ?? null, rank, now, now);
          stored++;
        });
      }
      // Only a full answer marks missing images gone; rows from an old TMDB ID go too
      db.prepare("UPDATE movie_images SET gone_at = ?, role = CASE WHEN chosen_by = 'admin' THEN role ELSE NULL END WHERE movie_id = ? AND gone_at IS NULL AND (last_seen < ? OR tmdb_id != ?)")
        .run(now, film.id, now, film.tmdb_id);
      const current = db.prepare("SELECT chosen_by FROM movie_images WHERE movie_id = ? AND role = 'poster' AND gone_at IS NULL").get(film.id);
      if (current?.chosen_by === "admin") return;
      const best = pickPoster(film, kinds.poster);
      db.prepare("UPDATE movie_images SET role = NULL WHERE movie_id = ? AND role = 'poster'").run(film.id);
      if (!best) { empty.push(film.title); return; }
      db.prepare("UPDATE movie_images SET role = 'poster', status = 'approved', chosen_by = 'auto' WHERE movie_id = ? AND kind = 'poster' AND file_path = ?")
        .run(film.id, best.file_path.replace(/^\//, ""));
      posters++;
    });
    if ((i + 1) % 20 === 0) log(`  ${i + 1} of ${films.length} films done`);
    await pause(60);
  }
  filmsChanged();
  if (empty.length) log(`No poster on TMDB (${empty.length}): ${empty.join("; ")}`);
  return `Stored ${stored} images and picked a poster for ${posters} of ${films.length} films.${failed ? ` ${failed} couldn't be reached: run it again to finish them.` : ""}`;
}
