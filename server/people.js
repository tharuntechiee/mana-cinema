// A person's page (person.html): who they are and every film they made, from TMDB. Anyone on TMDB can have
// one: the search box finds them (searchPeople, below) and every cast and crew name on a film page links to
// one. Without a TMDB key only people already here (credited on a film, or with a saved profile) have pages.
//
// A profile is fetched the first time someone opens the page, kept in the database (so the Turso copies
// carry it) and fetched again after a week. Without a TMDB key, or while TMDB can't be reached, the last
// copy is used, else the copy bundled for the home page cover stars (server/people-seed.json, written by
// `npm run people`).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, nowISO } from "./db.js";
import { config } from "./env.js";
import { tmdb } from "./sync/tmdb.js";

const SEED_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "people-seed.json");
const FRESH_MS = 7 * 24 * 3600e3;
const RETRY_MS = 10 * 60e3;   // after a failed fetch, wait this long before asking TMDB again
const IMAGE = /^\/[A-Za-z0-9]{8,64}\.(jpg|png)$/;
// The kinds of crew work a person's page lists beside their acting
const CREW_JOBS = /^(director|screenplay|writer|story|dialogue|producer|executive producer|playback singer|singer|lyricist|music|original music composer|choreographer|stunts)$/i;

let seed = null;
const seeded = id => {
  if (!seed) try { seed = JSON.parse(fs.readFileSync(SEED_FILE, "utf8")); } catch { seed = {}; }
  return seed[id] || null;
};

const img = p => (IMAGE.test(p || "") ? p : null);
const year = date => Number(String(date || "").slice(0, 4)) || null;

// TMDB's person with movie_credits and external_ids, cut down to what the page shows
export function trimProfile(p) {
  const films = new Map();
  for (const c of p.movie_credits?.cast || []) {
    const f = films.get(c.id) || { tmdbId: c.id, title: c.title, date: c.release_date || null, poster: img(c.poster_path), lang: c.original_language || null, roles: [], jobs: [] };
    if (c.character && !f.roles.includes(c.character)) f.roles.push(c.character);
    f.acted = true;
    films.set(c.id, f);
  }
  for (const c of p.movie_credits?.crew || []) {
    if (!CREW_JOBS.test(c.job || "")) continue;
    const f = films.get(c.id) || { tmdbId: c.id, title: c.title, date: c.release_date || null, poster: img(c.poster_path), lang: c.original_language || null, roles: [], jobs: [] };
    if (!f.jobs.includes(c.job)) f.jobs.push(c.job);
    films.set(c.id, f);
  }
  const ext = p.external_ids || {};
  const handle = h => (/^[\w.]{1,40}$/.test(h || "") ? h : null);
  return {
    tmdbId: p.id,
    name: p.name,
    knownFor: p.known_for_department || null,
    biography: String(p.biography || "").trim(),
    birthday: /^\d{4}-\d{2}-\d{2}$/.test(p.birthday || "") ? p.birthday : null,
    deathday: /^\d{4}-\d{2}-\d{2}$/.test(p.deathday || "") ? p.deathday : null,
    birthplace: p.place_of_birth || null,
    photo: img(p.profile_path),
    imdbId: /^nm\d{5,10}$/.test(ext.imdb_id || p.imdb_id || "") ? (ext.imdb_id || p.imdb_id) : null,
    instagram: handle(ext.instagram_id),
    twitter: handle(ext.twitter_id),
    films: [...films.values()].map(f => ({ ...f, acted: Boolean(f.acted), year: year(f.date) })),
  };
}

export async function fetchProfile(tmdbId) {
  const p = await tmdb(`/person/${tmdbId}`, { append_to_response: "movie_credits,external_ids", language: "en-US" });
  return p ? trimProfile(p) : null;
}

const failedAt = new Map();
const inflight = new Map();

// The copy on hand: the one saved in the database, else the bundled one
export function storedProfile(tmdbId) {
  const row = db.prepare("SELECT profile, fetched_at FROM person_profiles WHERE tmdb_id = ?").get(tmdbId);
  return row ? { profile: JSON.parse(row.profile), fetchedAt: row.fetched_at } : { profile: seeded(tmdbId), fetchedAt: null };
}

// The profile, fetching a new one when it's missing or a week old (and a key is set). With a copy on hand
// the page gets that at once and the new one is fetched in the background, for the next visitor.
async function profileFor(tmdbId) {
  const { profile, fetchedAt } = storedProfile(tmdbId);
  const stale = !fetchedAt || Date.now() - Date.parse(fetchedAt) > FRESH_MS;
  if (!stale || !config.tmdbKey || Date.now() - (failedAt.get(tmdbId) || 0) < RETRY_MS) return profile;
  if (!inflight.has(tmdbId)) {
    inflight.set(tmdbId, fetchProfile(tmdbId).then(fresh => {
      if (fresh) {
        db.prepare("INSERT INTO person_profiles (tmdb_id, profile, fetched_at) VALUES (?, ?, ?) ON CONFLICT (tmdb_id) DO UPDATE SET profile = excluded.profile, fetched_at = excluded.fetched_at")
          .run(tmdbId, JSON.stringify(fresh), nowISO());
        allowImages(fresh);   // so /img serves the new photo and posters
      }
      return fresh;
    }).catch(err => {
      failedAt.set(tmdbId, Date.now());
      console.warn(`TMDB profile ${tmdbId}: ${err.message}`);
      return null;
    }).finally(() => inflight.delete(tmdbId)));
  }
  return profile || await inflight.get(tmdbId);
}

// Pictures people's pages and search results may show through /img (server/images.js): their photos and
// their films' posters. Built from the saved and bundled profiles once, then added to as profiles arrive.
let images = null;
function imageList() {
  if (!images) {
    images = new Map();
    for (const r of db.prepare("SELECT profile FROM person_profiles").all()) allowImages(JSON.parse(r.profile));
    if (!seed) seeded(0);
    Object.values(seed).forEach(allowImages);
  }
  return images;
}
function allowImages(p) {
  const list = imageList();
  if (p.photo) list.set(p.photo.slice(1), "profile");
  for (const f of p.films || []) if (f.poster && !list.has(f.poster.slice(1))) list.set(f.poster.slice(1), "poster");
}
// "abc123.jpg" -> "profile", "poster", or null when no person's page shows it
export const personImage = name => imageList().get(name) || null;

// Searching people on TMDB: their names, photos and best-known films, for the search box. Each query is
// remembered for an hour (at most SEARCH_KEEP of them), and TMDB gets SEARCH_WAIT_MS to answer.
const SEARCH_KEEP = 500, SEARCH_TTL_MS = 3600e3, SEARCH_WAIT_MS = 4000;
const INDIAN = new Set(["te", "hi", "ta", "ml", "kn", "mr", "bn", "pa", "gu"]);
const searches = new Map();
export async function searchPeople(query) {
  const q = String(query || "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 60);
  if (!config.tmdbKey || q.length < 2) return [];
  const hit = searches.get(q);
  if (hit && Date.now() - hit.at < SEARCH_TTL_MS) return hit.people;
  const timeout = new Promise(r => setTimeout(() => r(null), SEARCH_WAIT_MS));
  let found;
  try { found = await Promise.race([tmdb("/search/person", { query: q, include_adult: "false", language: "en-US" }), timeout]); }
  catch (err) { console.warn(`TMDB person search: ${err.message}`); return []; }
  if (!found) return [];
  // Indian film people first (by their best-known films), then the rest as TMDB ranks them
  const people = (found.results || []).filter(r => Number.isInteger(r.id) && r.name).map(r => {
    const known = (r.known_for || []).filter(k => k.title || k.name);
    return {
      tmdbId: r.id,
      name: r.name,
      knownFor: r.known_for_department || null,
      photo: img(r.profile_path),
      films: known.slice(0, 3).map(k => k.title || k.name),
      indian: known.some(k => INDIAN.has(k.original_language)),
    };
  }).sort((a, b) => Number(b.indian) - Number(a.indian)).slice(0, 6);
  for (const p of people) if (p.photo) imageList().set(p.photo.slice(1), "profile");
  if (searches.size >= SEARCH_KEEP) searches.delete(searches.keys().next().value);
  searches.set(q, { at: Date.now(), people });
  return people;
}

// The page's data: the profile, with each film that's on this site linked to it and its credit here
export async function readPerson(tmdbId) {
  const people = db.prepare("SELECT id, name, photo FROM people WHERE tmdb_id = ?").all(tmdbId);
  if (!people.length && !config.tmdbKey && !storedProfile(tmdbId).profile) return null;
  const ids = people.map(p => p.id);
  const here = db.prepare(`
    SELECT DISTINCT c.movie_id AS movieId, m.tmdb_id AS tmdbId, c.kind, c.job, c.character
    FROM credits c JOIN movies m ON m.id = c.movie_id
    WHERE c.person_id IN (${ids.map(() => "?").join(",")})
  `).all(...ids);
  const profile = await profileFor(tmdbId);
  if (!profile && !people.length) return null;   // not on TMDB either
  const onSite = new Map(here.filter(r => r.tmdbId).map(r => [r.tmdbId, r.movieId]));
  const films = (profile?.films || []).map(f => (onSite.has(f.tmdbId) ? { ...f, movieId: onSite.get(f.tmdbId) } : f));
  return {
    tmdbId,
    name: profile?.name || people[0].name,
    knownFor: profile?.knownFor || null,
    biography: profile?.biography || "",
    birthday: profile?.birthday || null,
    deathday: profile?.deathday || null,
    birthplace: profile?.birthplace || null,
    photo: profile?.photo || img(people.find(p => p.photo)?.photo) || null,
    imdbId: profile?.imdbId || null,
    instagram: profile?.instagram || null,
    twitter: profile?.twitter || null,
    films,
    // Films here, with their credit, even ones TMDB doesn't list under this person
    siteFilms: [...new Set(here.map(r => r.movieId))].map(movieId => {
      const rows = here.filter(r => r.movieId === movieId);
      return { movieId, roles: [...new Set(rows.map(r => r.character).filter(Boolean))], jobs: [...new Set(rows.map(r => r.job).filter(Boolean))], acted: rows.some(r => r.kind === "cast") };
    }),
    complete: Boolean(profile),
  };
}
