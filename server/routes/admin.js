// Admin API, used by admin.html. Everything except sign-in needs the admin session cookie.
//
//   POST   /api/admin/login               { password }
//   POST   /api/admin/logout
//   GET    /api/admin/session             { signedIn, passwordSet }
//   GET    /api/admin/data                every film, audience review (hidden ones too) and message
//   PUT    /api/admin/movies/:id          add or replace a film (details, collections, critics, IDs, trailer)
//   DELETE /api/admin/movies/:id          delete a film and everything about it
//   PATCH  /api/admin/reviews/:id         { hidden }
//   DELETE /api/admin/reviews/:id
//   PATCH  /api/admin/messages/:id        { read }
//   POST   /api/admin/messages/read-all
//   DELETE /api/admin/messages/:id
//   POST   /api/admin/restore             a backup file's contents (replaces films, reviews and messages)
//   POST   /api/admin/reset/:what         films | reviews | messages
//   GET    /api/admin/sync                IMDb / TMDB / YouTube status and the running job
//   POST   /api/admin/sync                { tasks: ["ratings", ...] or ["all"], movieIds? }
import express from "express";
import { rateLimit } from "express-rate-limit";
import { db, tx, readFilms, readFilm, writeFilm, deleteFilm, reviewOut, messageOut, setMeta, nowISO } from "../db.js";
import { passwordMatches, startSession, endSession, isAdmin, requireAdmin } from "../auth.js";
import { config } from "../env.js";
import { filmProblem, tidyFilm, backupProblem } from "../validate.js";
import { loadCatalogue, resetFilms } from "../seed.js";
import { syncStatus, startSync, TASK_IDS } from "../sync/jobs.js";

export const adminApi = express.Router();
const idParam = req => (/^\d{1,15}$/.test(req.params.id) ? Number(req.params.id) : null);

adminApi.post("/login", rateLimit({
  windowMs: 15 * 60e3, limit: 10, standardHeaders: "draft-8", legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Wait 15 minutes and try again." },
}), (req, res) => {
  if (!config.adminPassword) return res.status(503).json({ error: "Set ADMIN_PASSWORD in the .env file, then restart the server." });
  if (!passwordMatches(req.body?.password)) return res.status(401).json({ error: "That password isn't right. Try again." });
  startSession(req, res);
  res.json({ ok: true });
});

adminApi.post("/logout", (req, res) => {
  endSession(req, res);
  res.json({ ok: true });
});

adminApi.get("/session", (req, res) => {
  res.json({ signedIn: isAdmin(req), passwordSet: Boolean(config.adminPassword) });
});

adminApi.use(requireAdmin);

const allReviews = () => db.prepare("SELECT * FROM audience_reviews ORDER BY created_at DESC").all().map(r => reviewOut(r, { admin: true }));
const allMessages = () => db.prepare("SELECT * FROM messages ORDER BY created_at DESC").all().map(messageOut);

adminApi.get("/data", (req, res) => {
  res.json({ movies: readFilms(), reviews: allReviews(), messages: allMessages() });
});

// ---------- Films ----------
adminApi.put("/movies/:id", (req, res) => {
  const id = idParam(req);
  if (!id) return res.status(400).json({ error: "That film id isn't valid." });
  const film = tidyFilm({ ...(req.body || {}), id });
  const problem = filmProblem(film);
  if (problem) return res.status(400).json({ error: problem });
  const clash = db.prepare("SELECT title FROM movies WHERE lower(trim(title)) = lower(trim(?)) AND id != ?").get(film.title, id);
  if (clash) return res.status(409).json({ error: "Another film already has this title." });
  if (film.imdbId) {
    const other = db.prepare("SELECT title FROM movies WHERE imdb_id = ? AND id != ?").get(film.imdbId, id);
    if (other) return res.status(409).json({ error: `${other.title} already uses IMDb ID ${film.imdbId}.` });
  }
  writeFilm(film, { origin: "admin" });
  res.json({ movie: readFilm(id) });
});

adminApi.delete("/movies/:id", (req, res) => {
  const id = idParam(req);
  const out = id ? deleteFilm(id) : { deleted: false };
  if (!out.deleted) return res.status(404).json({ error: "That film was already deleted." });
  res.json({ ok: true, reviews: out.reviews });
});

// ---------- Audience reviews ----------
adminApi.patch("/reviews/:id", (req, res) => {
  const id = idParam(req);
  if (typeof req.body?.hidden !== "boolean") return res.status(400).json({ error: "Send { hidden: true } or { hidden: false }." });
  const changed = id ? db.prepare("UPDATE audience_reviews SET hidden = ? WHERE id = ?").run(Number(req.body.hidden), id).changes : 0;
  if (!changed) return res.status(404).json({ error: "That review was already deleted." });
  res.json({ review: reviewOut(db.prepare("SELECT * FROM audience_reviews WHERE id = ?").get(id), { admin: true }) });
});

adminApi.delete("/reviews/:id", (req, res) => {
  const id = idParam(req);
  const changed = id ? db.prepare("DELETE FROM audience_reviews WHERE id = ?").run(id).changes : 0;
  if (!changed) return res.status(404).json({ error: "That review was already deleted." });
  res.json({ ok: true });
});

// ---------- Messages ----------
adminApi.post("/messages/read-all", (req, res) => {
  db.prepare("UPDATE messages SET is_read = 1 WHERE is_read = 0").run();
  res.json({ ok: true });
});

adminApi.patch("/messages/:id", (req, res) => {
  const id = idParam(req);
  if (typeof req.body?.read !== "boolean") return res.status(400).json({ error: "Send { read: true } or { read: false }." });
  const changed = id ? db.prepare("UPDATE messages SET is_read = ? WHERE id = ?").run(Number(req.body.read), id).changes : 0;
  if (!changed) return res.status(404).json({ error: "That message was already deleted." });
  res.json({ message: messageOut(db.prepare("SELECT * FROM messages WHERE id = ?").get(id)) });
});

adminApi.delete("/messages/:id", (req, res) => {
  const id = idParam(req);
  const changed = id ? db.prepare("DELETE FROM messages WHERE id = ?").run(id).changes : 0;
  if (!changed) return res.status(404).json({ error: "That message was already deleted." });
  res.json({ ok: true });
});

// ---------- Restore and reset ----------
// All of the backup or nothing: one transaction. A backup made before the all-India catalogue
// (no catalog number) gets the catalogue's newer films added back, as the browser version did.
adminApi.post("/restore", (req, res) => {
  const data = req.body;
  const { movies: catalogue, catalog, version } = loadCatalogue();
  const problem = backupProblem(data, { version });
  if (problem) return res.status(400).json({ error: problem });
  const older = !(Number(data.catalog) >= catalog);
  const have = new Set(data.movies.map(m => m.id));
  const added = older ? catalogue.filter(m => m.id > 1000 && !have.has(m.id)) : [];
  const keep = [...have, ...added.map(m => m.id)];
  tx(() => {
    // Films missing from the backup go (with everything about them). Cast and crew stay for the rest,
    // unless the backup gives the film another IMDb ID. IDs are cleared first so two films can swap them.
    // A backup from the browser-only version has no IMDb/TMDB IDs or trailers, and its IMDb ratings were
    // typed by hand: for those films the database keeps what the syncs found.
    db.prepare(`DELETE FROM movies WHERE id NOT IN (${keep.map(() => "?").join(",")})`).run(...keep);
    const current = new Map(readFilms().map(f => [f.id, f]));
    db.exec("UPDATE movies SET imdb_id = NULL; DELETE FROM audience_reviews; DELETE FROM messages;");
    for (const m of data.movies) {
      const cur = current.get(m.id), film = { ...m };
      if (!("imdbId" in m)) { film.imdbId = cur?.imdbId; film.imdbSource = cur?.imdbSource; }
      if (!("tmdbId" in m)) film.tmdbId = cur?.tmdbId;
      if (!("trailer" in m) && cur?.trailer) film.trailer = cur.trailer;
      if (cur?.critics?.imdb?.source === "imdb" && !m.critics?.imdb?.source) film.critics = { ...(m.critics || {}), imdb: cur.critics.imdb };
      if ((cur?.imdbId || null) !== (film.imdbId || null)) db.prepare("DELETE FROM credits WHERE movie_id = ?").run(m.id);
      writeFilm(tidyFilm(film), { origin: "restore" });
    }
    for (const m of added) writeFilm({ ...m, imdbId: current.get(m.id)?.imdbId }, { origin: "seed" });
    db.exec("DELETE FROM people WHERE id NOT IN (SELECT person_id FROM credits)");
    const addReview = db.prepare("INSERT OR IGNORE INTO audience_reviews (id, movie_id, reviewer, name, stars, body, hidden, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    for (const r of data.reviews) {
      const id = Number.isSafeInteger(r.id) ? r.id : null;
      addReview.run(id, r.movieId, String(r.by || `restored:${r.id ?? Math.random()}`), String(r.name || "Anonymous").slice(0, 100),
        r.stars, String(r.text || ""), Number(Boolean(r.hidden)), String(r.at || nowISO()));
    }
    const addMessage = db.prepare("INSERT OR IGNORE INTO messages (id, name, email, topic, movie_id, body, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    for (const m of data.messages) {
      addMessage.run(Number.isSafeInteger(m.id) ? m.id : null, String(m.name || "Anonymous"), String(m.email || "") || null,
        String(m.topic || "") || null, Number(m.movieId) || null, String(m.message || ""), Number(Boolean(m.read)), String(m.at || nowISO()));
    }
    setMeta("catalog_version", older ? catalog : Number(data.catalog));
  });
  res.json({ ok: true, films: data.movies.length + added.length, added: added.length, reviews: data.reviews.length, messages: data.messages.length });
});

adminApi.post("/reset/:what", (req, res) => {
  const what = req.params.what;
  if (what === "films") return res.json({ ok: true, films: resetFilms() });
  if (what === "reviews") return res.json({ ok: true, deleted: db.prepare("DELETE FROM audience_reviews").run().changes });
  if (what === "messages") return res.json({ ok: true, deleted: db.prepare("DELETE FROM messages").run().changes });
  res.status(404).json({ error: "Reset films, reviews or messages." });
});

// ---------- IMDb, TMDB and YouTube ----------
adminApi.get("/sync", (req, res) => {
  res.json(syncStatus());
});

adminApi.post("/sync", (req, res) => {
  const tasks = Array.isArray(req.body?.tasks) ? req.body.tasks.map(String) : [];
  if (!tasks.length || !tasks.every(t => t === "all" || TASK_IDS.includes(t))) {
    return res.status(400).json({ error: `Pick tasks from: all, ${TASK_IDS.join(", ")}.` });
  }
  const movieIds = Array.isArray(req.body?.movieIds) ? req.body.movieIds.map(Number).filter(Number.isInteger) : null;
  try {
    startSync({ tasks, movieIds, refresh: Boolean(req.body?.refresh) });
  } catch (err) {
    return res.status(409).json({ error: err.message });
  }
  res.status(202).json(syncStatus());
});
