// The SQLite database: schema, plus reading and writing films in the exact shape the website's pages use
// (the same objects as DEFAULT_MOVIES in js/data.js), so js/boxoffice.js works unchanged on server data.
//
// Tables
//   movies            one row per film: searchable columns + display details (JSON) + box-office summary (JSON)
//   box_office_days   day-wise India net, one row per film per day (day 0 = paid previews)
//   critic_reviews    critics' scores, in the order the admin entered them
//   imdb_ratings      IMDb rating and votes (from IMDb's datasets, the admin, or the original catalogue)
//   people, credits   cast and crew (IMDb's principal cast and crew, or TMDB's full credits)
//   trailers          the film's YouTube trailer with its views and likes
//   movie_images      every TMDB poster, backdrop and logo of a film; the chosen poster is served by /img
//   audience_reviews  visitors' star ratings and reviews
//   comments          YouTube-style comments and replies, with comment_votes (likes and dislikes)
//   messages          the website's feedback form
//   admin_sessions, sync_runs, meta
import "./env.js";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(import.meta.dirname, "..");
export const DATA_DIR = path.join(ROOT, "data");
export const DB_FILE = process.env.DATABASE_FILE ? path.resolve(ROOT, process.env.DATABASE_FILE) : path.join(DATA_DIR, "mana-cinema.db");
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

export const db = new DatabaseSync(DB_FILE);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");

db.exec(`
CREATE TABLE IF NOT EXISTS movies (
  id           INTEGER PRIMARY KEY,
  title        TEXT    NOT NULL,
  lang         TEXT,
  year         INTEGER,
  release_date TEXT,                         -- YYYY-MM-DD; NULL = no exact date
  imdb_id      TEXT    UNIQUE,               -- tt1234567
  imdb_source  TEXT,                         -- how the IMDb ID was found: admin, title, fuzzy, credits or tmdb
  tmdb_id      INTEGER,
  details      TEXT    NOT NULL DEFAULT '{}', -- genre, languages, cast text, colours, poster... (JSON)
  box_office   TEXT    NOT NULL DEFAULT '{}', -- totals, budget, verdict, sources, notes... (JSON, days apart)
  created_at   TEXT    NOT NULL,
  updated_at   TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS movies_lang_year ON movies (lang, year);

CREATE TABLE IF NOT EXISTS box_office_days (
  movie_id INTEGER NOT NULL REFERENCES movies (id) ON DELETE CASCADE,
  day      INTEGER NOT NULL,                 -- 0 = paid previews, 1 = Day 1 ...
  net      REAL    NOT NULL,                 -- India net, Rs crore
  note     TEXT,
  PRIMARY KEY (movie_id, day)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS critic_reviews (
  id       INTEGER PRIMARY KEY,
  movie_id INTEGER NOT NULL REFERENCES movies (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  outlet   TEXT    NOT NULL,
  score    REAL,
  out_of   REAL,
  url      TEXT
);
CREATE INDEX IF NOT EXISTS critic_reviews_movie ON critic_reviews (movie_id, position);

CREATE TABLE IF NOT EXISTS imdb_ratings (
  movie_id INTEGER PRIMARY KEY REFERENCES movies (id) ON DELETE CASCADE,
  rating   REAL    NOT NULL,                 -- out of 10
  votes    INTEGER,
  as_of    TEXT,
  source   TEXT    NOT NULL                  -- 'imdb' (IMDb datasets), 'admin' or 'seed'
);

CREATE TABLE IF NOT EXISTS people (
  id         INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL,
  imdb_id    TEXT    UNIQUE,                 -- nm0000001
  tmdb_id    INTEGER UNIQUE,
  photo      TEXT,                           -- TMDB profile image path
  birth_year INTEGER,
  death_year INTEGER
);

CREATE TABLE IF NOT EXISTS credits (
  id         INTEGER PRIMARY KEY,
  movie_id   INTEGER NOT NULL REFERENCES movies (id) ON DELETE CASCADE,
  person_id  INTEGER NOT NULL REFERENCES people (id),
  kind       TEXT    NOT NULL CHECK (kind IN ('cast', 'crew')),
  department TEXT,                           -- crew: Directing, Writing, Production, Sound, Camera...
  job        TEXT,                           -- crew: Director, Screenplay, Music...
  character  TEXT,                           -- cast: the role
  position   INTEGER NOT NULL,               -- billing order
  source     TEXT    NOT NULL                -- 'imdb' or 'tmdb'
);
CREATE INDEX IF NOT EXISTS credits_movie ON credits (movie_id, kind, position);
CREATE INDEX IF NOT EXISTS credits_person ON credits (person_id);

CREATE TABLE IF NOT EXISTS trailers (
  movie_id     INTEGER PRIMARY KEY REFERENCES movies (id) ON DELETE CASCADE,
  video_id     TEXT    NOT NULL,
  title        TEXT,
  channel      TEXT,
  published_at TEXT,
  views        INTEGER,
  likes        INTEGER,
  comments     INTEGER,
  as_of        TEXT,
  source       TEXT    NOT NULL              -- 'youtube' (found by search) or 'admin'
);

-- Every TMDB image of a film (posters, backdrops, logos). The sync stores them all as 'pending' and picks
-- one poster per film as 'approved' with role 'poster'; only approved images can be served by /img.
CREATE TABLE IF NOT EXISTS movie_images (
  id           INTEGER PRIMARY KEY,
  movie_id     INTEGER NOT NULL REFERENCES movies (id) ON DELETE CASCADE,
  tmdb_id      INTEGER NOT NULL,             -- the TMDB film it came from
  kind         TEXT    NOT NULL CHECK (kind IN ('poster', 'backdrop', 'logo')),
  file_path    TEXT    NOT NULL,             -- "abc123.jpg" (no leading slash)
  width        INTEGER,
  height       INTEGER,
  aspect_ratio REAL,
  lang         TEXT,                         -- text language on the image, NULL = no text
  country      TEXT,
  vote_average REAL,
  vote_count   INTEGER,
  rank         INTEGER NOT NULL,             -- TMDB's order within its kind
  status       TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'hidden')),
  role         TEXT CHECK (role IN ('poster', 'hero')),
  chosen_by    TEXT,                         -- 'auto' (the sync) or 'admin'; the sync never changes an admin's choice
  first_seen   TEXT    NOT NULL,
  last_seen    TEXT    NOT NULL,
  gone_at      TEXT,
  UNIQUE (movie_id, kind, file_path)
);
CREATE INDEX IF NOT EXISTS movie_images_film ON movie_images (movie_id, kind, status, rank);
CREATE INDEX IF NOT EXISTS movie_images_file ON movie_images (file_path);
CREATE UNIQUE INDEX IF NOT EXISTS movie_images_role ON movie_images (movie_id, role) WHERE role IS NOT NULL;

CREATE TABLE IF NOT EXISTS audience_reviews (
  id         INTEGER PRIMARY KEY,
  movie_id   INTEGER NOT NULL,               -- no foreign key: backups may hold reviews of deleted films
  reviewer   TEXT    NOT NULL,               -- hash of the visitor's cookie: one rating per film per visitor
  name       TEXT    NOT NULL,
  stars      INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  body       TEXT    NOT NULL DEFAULT '',
  hidden     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL,
  UNIQUE (movie_id, reviewer)
);
CREATE INDEX IF NOT EXISTS audience_reviews_movie ON audience_reviews (movie_id, created_at);

-- YouTube-style comments: threads one level deep (a reply to a reply joins the same thread)
CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY,
  movie_id   INTEGER NOT NULL,               -- no foreign key, like audience_reviews
  parent_id  INTEGER REFERENCES comments (id) ON DELETE CASCADE,   -- NULL = a top-level comment
  author     TEXT    NOT NULL,               -- hash of the visitor's cookie, or 'admin'
  name       TEXT    NOT NULL,
  body       TEXT    NOT NULL,
  is_admin   INTEGER NOT NULL DEFAULT 0,     -- posted by MANA CINEMA from the admin portal
  pinned     INTEGER NOT NULL DEFAULT 0,     -- one per film, top-level only
  hearted    INTEGER NOT NULL DEFAULT 0,     -- "hearted by MANA CINEMA"
  hidden     INTEGER NOT NULL DEFAULT 0,     -- hidden by a moderator: only its author still sees it
  created_at TEXT    NOT NULL,
  edited_at  TEXT
);
CREATE INDEX IF NOT EXISTS comments_thread ON comments (movie_id, parent_id, created_at);
CREATE INDEX IF NOT EXISTS comments_parent ON comments (parent_id);

CREATE TABLE IF NOT EXISTS comment_votes (
  comment_id INTEGER NOT NULL REFERENCES comments (id) ON DELETE CASCADE,
  voter      TEXT    NOT NULL,               -- hash of the visitor's cookie
  vote       INTEGER NOT NULL CHECK (vote IN (-1, 1)),
  PRIMARY KEY (comment_id, voter)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL,
  email      TEXT,
  topic      TEXT,
  movie_id   INTEGER,
  body       TEXT    NOT NULL,
  is_read    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS sync_runs (
  id          INTEGER PRIMARY KEY,
  task        TEXT NOT NULL,
  started_at  TEXT NOT NULL,
  finished_at TEXT,
  ok          INTEGER,
  summary     TEXT
);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
) WITHOUT ROWID;
`);

// Columns added after the first release, for databases made before them
for (const [table, column, type] of [["movies", "imdb_source", "TEXT"]]) {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

// ---------- Helpers ----------
export const nowISO = () => new Date().toISOString();
// Today's date in India (the site's box-office days are Indian dates): "2026-10-16"
export const todayIST = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

// One transaction; nested calls join the outer one (savepoints), so helpers can be combined safely
let depth = 0;
export function tx(fn) {
  const name = `sp${depth}`;
  db.exec(depth ? `SAVEPOINT ${name}` : "BEGIN IMMEDIATE");
  depth++;
  try {
    const out = fn();
    depth--;
    db.exec(depth ? `RELEASE ${name}` : "COMMIT");
    return out;
  } catch (err) {
    depth--;
    db.exec(depth ? `ROLLBACK TO ${name}; RELEASE ${name}` : "ROLLBACK");
    throw err;
  }
}

export function getMeta(key) {
  return db.prepare("SELECT value FROM meta WHERE key = ?").get(key)?.value ?? null;
}
export function setMeta(key, value) {
  db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(key, String(value));
}

// SQLite can't bind undefined or booleans
const v = x => (x === undefined ? null : typeof x === "boolean" ? Number(x) : x);
const num = x => (x === null || x === undefined || x === "" || !Number.isFinite(Number(x)) ? null : Number(x));
const parseJSON = (text, fallback) => { try { return JSON.parse(text); } catch { return fallback; } };

// Votes were typed by hand in the original catalogue: "12,253" -> 12253, "29K" -> 29000, "8.1K" -> 8100,
// "1.2M" -> 1200000, "1.5 lakh" -> 150000
const VOTE_UNITS = { k: 1e3, m: 1e6, l: 1e5, lakh: 1e5, lakhs: 1e5, cr: 1e7, crore: 1e7 };
export function parseVotes(votes) {
  if (typeof votes === "number") return Number.isFinite(votes) ? Math.round(votes) : null;
  const s = String(votes ?? "").trim().toLowerCase().replace(/,/g, "");
  const m = /^(\d+(?:\.\d+)?)\s*(k|m|l|lakhs?|cr|crore)?\b/.exec(s);
  if (!m) return null;
  return Math.round(Number(m[1]) * (m[2] ? VOTE_UNITS[m[2]] : 1));
}
const formatVotes = n => (n === null || n === undefined ? "" : Number(n).toLocaleString("en-IN"));

// ---------- Reading films ----------
let filmsVersion = 0;   // bumped on every write, so cached copies (api/bootstrap.js) know to rebuild
export const filmsChanged = () => { filmsVersion++; };
export const currentFilmsVersion = () => filmsVersion;

function groupBy(rows, key = "movie_id") {
  const out = new Map();
  for (const r of rows) {
    if (!out.has(r[key])) out.set(r[key], []);
    out.get(r[key]).push(r);
  }
  return out;
}

// Every film (or the ones with these ids), each assembled from its tables. Six queries in all.
export function readFilms(ids = null) {
  const list = ids ? ids.map(Number).filter(Number.isInteger) : null;
  if (list && !list.length) return [];
  const marks = list ? list.map(() => "?").join(",") : "";
  const where = list ? `WHERE movie_id IN (${marks})` : "";
  const args = list || [];
  const movies = db.prepare(`SELECT * FROM movies ${list ? `WHERE id IN (${marks})` : ""} ORDER BY id`).all(...args);
  const days = groupBy(db.prepare(`SELECT movie_id, day, net, note FROM box_office_days ${where} ORDER BY movie_id, day`).all(...args));
  const critics = groupBy(db.prepare(`SELECT * FROM critic_reviews ${where} ORDER BY movie_id, position`).all(...args));
  const imdb = new Map(db.prepare(`SELECT * FROM imdb_ratings ${where}`).all(...args).map(r => [r.movie_id, r]));
  const trailers = new Map(db.prepare(`SELECT * FROM trailers ${where}`).all(...args).map(r => [r.movie_id, r]));
  const credits = groupBy(db.prepare(`SELECT movie_id, kind, COUNT(*) AS n, MAX(source) AS source FROM credits ${where} GROUP BY movie_id, kind`).all(...args));
  const posters = new Map(db.prepare(`SELECT movie_id, file_path FROM movie_images ${where ? where + " AND" : "WHERE"} role = 'poster' AND status = 'approved' AND gone_at IS NULL`).all(...args).map(r => [r.movie_id, r.file_path]));
  return movies.map(row => assemble(row, {
    days: days.get(row.id) || [], critics: critics.get(row.id) || [], imdb: imdb.get(row.id),
    trailer: trailers.get(row.id), credits: credits.get(row.id) || [], poster: posters.get(row.id),
  }));
}
export function readFilm(id) {
  return readFilms([id])[0] || null;
}

function assemble(row, parts) {
  const film = { id: row.id, ...parseJSON(row.details, {}), title: row.title };
  if (row.lang !== null) film.lang = row.lang;
  if (row.year !== null) film.year = row.year;
  if (row.release_date !== null) film.release = row.release_date;
  if (row.imdb_id) film.imdbId = row.imdb_id;
  if (row.imdb_id && row.imdb_source) film.imdbSource = row.imdb_source;
  if (row.tmdb_id) film.tmdbId = row.tmdb_id;

  const critics = {};
  if (parts.imdb) critics.imdb = { score: parts.imdb.rating, votes: formatVotes(parts.imdb.votes), asOf: parts.imdb.as_of || "", source: parts.imdb.source };
  if (parts.critics.length) {
    critics.reviews = parts.critics.map(r => {
      const out = { outlet: r.outlet, score: r.score, outOf: r.out_of };
      if (r.url) out.url = r.url;
      return out;
    });
  }
  film.critics = critics;

  const bo = parseJSON(row.box_office, {});
  if (parts.days.length) bo.days = parts.days.map(d => (d.note ? { day: d.day, net: d.net, note: d.note } : { day: d.day, net: d.net }));
  film.boxOffice = bo;

  const t = parts.trailer;
  if (t) {
    film.trailer = { videoId: t.video_id, source: t.source };
    for (const [key, col] of [["title", "title"], ["channel", "channel"], ["publishedAt", "published_at"], ["views", "views"], ["likes", "likes"], ["comments", "comments"], ["asOf", "as_of"]]) {
      if (t[col] !== null) film.trailer[key] = t[col];
    }
  }
  if (parts.poster) film.images = { poster: parts.poster };   // pages build img/<size>/<file> links from it
  if (parts.credits.length) {
    film.credits = { cast: 0, crew: 0 };
    for (const c of parts.credits) { film.credits[c.kind] = c.n; film.credits.source = c.source; }
  }
  return film;
}

// ---------- Writing films ----------
// Fields with their own columns or tables; everything else is kept in `details` as it came
const OWN_FIELDS = ["id", "title", "lang", "year", "release", "imdbId", "imdbSource", "tmdbId", "critics", "boxOffice", "trailer", "credits", "images"];

// Saves one film (insert or replace). origin:
//   "admin"   an edit in the admin portal: an unchanged IMDb rating or trailer keeps its source and stats
//   "seed"    the original catalogue: never removes what a sync found (IMDb ID, IMDb rating, trailer)
//   "restore" a backup: takes everything as it is in the file
export function writeFilm(input, { origin = "admin" } = {}) {
  const film = structuredClone(input);
  const details = {};
  for (const [k, val] of Object.entries(film)) if (!OWN_FIELDS.includes(k) && val !== undefined) details[k] = val;
  const { days = [], ...bo } = film.boxOffice && typeof film.boxOffice === "object" ? film.boxOffice : {};
  const now = nowISO();
  const current = db.prepare("SELECT imdb_id, imdb_source, tmdb_id FROM movies WHERE id = ?").get(film.id);
  const keep = origin === "seed";
  const imdbId = film.imdbId || (keep ? current?.imdb_id : null) || null;
  const tmdbId = num(film.tmdbId) || (keep ? current?.tmdb_id : null) || null;
  // An ID the admin typed (or changed) is theirs: a sync never replaces it
  const IMDB_SOURCES = ["admin", "title", "fuzzy", "credits", "tmdb"];
  const imdbSource = !imdbId ? null
    : origin === "restore" && IMDB_SOURCES.includes(film.imdbSource) ? film.imdbSource
    : imdbId === current?.imdb_id ? current.imdb_source || "admin" : "admin";

  tx(() => {
    db.prepare(`
      INSERT INTO movies (id, title, lang, year, release_date, imdb_id, imdb_source, tmdb_id, details, box_office, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET
        title = excluded.title, lang = excluded.lang, year = excluded.year, release_date = excluded.release_date,
        imdb_id = excluded.imdb_id, imdb_source = excluded.imdb_source, tmdb_id = excluded.tmdb_id, details = excluded.details,
        box_office = excluded.box_office, updated_at = excluded.updated_at
    `).run(film.id, String(film.title).trim(), v(film.lang || null), v(num(film.year)), v(film.release || null), imdbId, imdbSource, tmdbId,
      JSON.stringify(details), JSON.stringify(bo), now, now);

    db.prepare("DELETE FROM box_office_days WHERE movie_id = ?").run(film.id);
    const addDay = db.prepare("INSERT INTO box_office_days (movie_id, day, net, note) VALUES (?, ?, ?, ?)");
    for (const d of Array.isArray(days) ? days : []) addDay.run(film.id, d.day, d.net, v(String(d.note || "").trim() || null));

    const critics = film.critics && typeof film.critics === "object" ? film.critics : {};
    db.prepare("DELETE FROM critic_reviews WHERE movie_id = ?").run(film.id);
    const addCritic = db.prepare("INSERT INTO critic_reviews (movie_id, position, outlet, score, out_of, url) VALUES (?, ?, ?, ?, ?, ?)");
    (Array.isArray(critics.reviews) ? critics.reviews : []).forEach((r, i) => {
      addCritic.run(film.id, i, String(r.outlet ?? ""), v(num(r.score)), v(num(r.outOf)), v(String(r.url || "").trim() || null));
    });

    writeImdb(film.id, critics.imdb, origin);
    writeTrailer(film.id, film.trailer, origin);
  });
  filmsChanged();
}

function writeImdb(movieId, imdb, origin) {
  const cur = db.prepare("SELECT * FROM imdb_ratings WHERE movie_id = ?").get(movieId);
  const score = num(imdb?.score);
  const next = score !== null && score > 0 && score <= 10
    ? { rating: score, votes: parseVotes(imdb.votes), as_of: String(imdb.asOf || "") || null }
    : null;
  if (origin === "seed" && cur && cur.source !== "seed") return;   // IMDb data or the admin's figure wins over the catalogue
  if (!next) {
    if (cur) db.prepare("DELETE FROM imdb_ratings WHERE movie_id = ?").run(movieId);
    return;
  }
  const same = cur && cur.rating === next.rating && cur.votes === next.votes && (cur.as_of || null) === next.as_of;
  if (same && origin === "admin") return;   // untouched in the form: keep where it came from
  const source = origin === "seed" ? "seed"
    : origin === "restore" && ["imdb", "admin", "seed"].includes(imdb.source) ? imdb.source
    : "admin";
  db.prepare(`
    INSERT INTO imdb_ratings (movie_id, rating, votes, as_of, source) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (movie_id) DO UPDATE SET rating = excluded.rating, votes = excluded.votes, as_of = excluded.as_of, source = excluded.source
  `).run(movieId, next.rating, v(next.votes), v(next.as_of), source);
}

function writeTrailer(movieId, trailer, origin) {
  if (origin === "seed") return;
  const cur = db.prepare("SELECT video_id FROM trailers WHERE movie_id = ?").get(movieId);
  const id = trailer && /^[\w-]{11}$/.test(String(trailer.videoId || "")) ? String(trailer.videoId) : null;
  if (!id) {
    if (cur) db.prepare("DELETE FROM trailers WHERE movie_id = ?").run(movieId);
    return;
  }
  if (origin === "admin" && cur?.video_id === id) return;   // same video: keep its stats
  const t = origin === "restore" ? trailer : {};
  db.prepare(`
    INSERT INTO trailers (movie_id, video_id, title, channel, published_at, views, likes, comments, as_of, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (movie_id) DO UPDATE SET video_id = excluded.video_id, title = excluded.title, channel = excluded.channel,
      published_at = excluded.published_at, views = excluded.views, likes = excluded.likes, comments = excluded.comments,
      as_of = excluded.as_of, source = excluded.source
  `).run(movieId, id, v(t.title || null), v(t.channel || null), v(t.publishedAt || null), v(num(t.views)), v(num(t.likes)),
    v(num(t.comments)), v(t.asOf || null), origin === "restore" && t.source === "youtube" ? "youtube" : "admin");
}

// Deletes a film with its collections, critics, IMDb rating, credits, trailer and audience reviews
export function deleteFilm(id) {
  return tx(() => {
    db.prepare("DELETE FROM comments WHERE movie_id = ?").run(id);
    const reviews = db.prepare("DELETE FROM audience_reviews WHERE movie_id = ?").run(id).changes;
    const films = db.prepare("DELETE FROM movies WHERE id = ?").run(id).changes;
    db.exec("DELETE FROM people WHERE id NOT IN (SELECT person_id FROM credits)");
    filmsChanged();
    return { deleted: films > 0, reviews };
  });
}

// ---------- Credits ----------
// Cast in billing order and crew in the order stored, for one film
export function readCredits(movieId) {
  const rows = db.prepare(`
    SELECT c.kind, c.department, c.job, c.character, c.position, c.source,
           p.id AS person_id, p.name, p.imdb_id, p.tmdb_id, p.photo
    FROM credits c JOIN people p ON p.id = c.person_id
    WHERE c.movie_id = ?
    ORDER BY c.kind, c.position
  `).all(movieId);
  const person = r => {
    const out = { personId: r.person_id, name: r.name };
    if (r.imdb_id) out.imdbId = r.imdb_id;
    if (r.tmdb_id) out.tmdbId = r.tmdb_id;
    if (r.photo) out.photo = `img/w185${r.photo}`;   // served and cached by server/images.js
    return out;
  };
  // One line per person: a double role becomes "Prem / Vijay", story and screenplay "Story, Screenplay"
  const merge = (list, key, field, joiner) => {
    const out = new Map();
    for (const item of list) {
      const k = key(item), prev = out.get(k);
      if (!prev) out.set(k, item);
      else if (item[field] && !prev[field].split(joiner).includes(item[field])) prev[field] = prev[field] ? `${prev[field]}${joiner}${item[field]}` : item[field];
    }
    return [...out.values()];
  };
  return {
    source: rows[0]?.source || null,
    cast: merge(rows.filter(r => r.kind === "cast").map(r => ({ ...person(r), character: r.character || "" })), p => p.personId, "character", " / "),
    crew: merge(rows.filter(r => r.kind === "crew").map(r => ({ ...person(r), department: r.department || "Crew", job: r.job || "" })), p => `${p.personId}:${p.department}`, "job", ", "),
  };
}

// Replaces a film's credits from one source.
// people: [{ kind, name, imdbId?, tmdbId?, photo?, character?, department?, job?, birthYear?, deathYear? }] in billing order
export function replaceCredits(movieId, source, people) {
  tx(() => {
    db.prepare("DELETE FROM credits WHERE movie_id = ?").run(movieId);
    const byImdb = db.prepare("SELECT id FROM people WHERE imdb_id = ?");
    const byTmdb = db.prepare("SELECT id FROM people WHERE tmdb_id = ?");
    const addPerson = db.prepare("INSERT INTO people (name, imdb_id, tmdb_id, photo, birth_year, death_year) VALUES (?, ?, ?, ?, ?, ?)");
    const updPerson = db.prepare("UPDATE people SET name = ?, photo = COALESCE(?, photo), birth_year = COALESCE(?, birth_year), death_year = COALESCE(?, death_year) WHERE id = ?");
    const addCredit = db.prepare("INSERT INTO credits (movie_id, person_id, kind, department, job, character, position, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    people.forEach((p, i) => {
      const found = (p.imdbId && byImdb.get(p.imdbId)) || (p.tmdbId && byTmdb.get(p.tmdbId));
      let personId;
      if (found) {
        personId = found.id;
        updPerson.run(p.name, v(p.photo || null), v(p.birthYear ?? null), v(p.deathYear ?? null), personId);
      } else {
        personId = Number(addPerson.run(p.name, v(p.imdbId || null), v(p.tmdbId || null), v(p.photo || null), v(p.birthYear ?? null), v(p.deathYear ?? null)).lastInsertRowid);
      }
      addCredit.run(movieId, personId, p.kind, v(p.department || null), v(p.job || null), v(p.character || null), i, source);
    });
    // People no longer credited on any film
    db.exec("DELETE FROM people WHERE id NOT IN (SELECT person_id FROM credits)");
  });
  filmsChanged();
}

// ---------- Audience reviews ----------
// The shape js/boxoffice.js uses. Visitors see `mine` on their own review; the admin sees `by` (a hash)
export function reviewOut(r, { admin = false, reviewer = null } = {}) {
  const out = { id: r.id, movieId: r.movie_id, name: r.name, stars: r.stars, text: r.body, at: r.created_at };
  if (r.hidden || admin) out.hidden = Boolean(r.hidden);
  if (admin) out.by = r.reviewer;
  else if (reviewer && r.reviewer === reviewer) out.mine = true;
  return out;
}

// ---------- Messages ----------
export function messageOut(m) {
  const out = { id: m.id, name: m.name, email: m.email || "", topic: m.topic || "" };
  if (m.movie_id !== null) out.movieId = m.movie_id;
  return Object.assign(out, { message: m.body, at: m.created_at, read: Boolean(m.is_read) });
}
