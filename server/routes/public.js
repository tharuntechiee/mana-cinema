// Public API: what the website's pages read, plus audience ratings and the feedback form.
//
//   GET  /api/bootstrap.js            films + audience reviews as a script the pages load first
//   GET  /api/health                  is the server up, and how many films
//   GET  /api/movies                  every film (?lang=Telugu for one language)
//   GET  /api/movies/:id              one film
//   GET  /api/movies/:id/credits      full cast and crew from the database
//   GET  /api/movies/:id/reviews      visible audience reviews
//   POST /api/movies/:id/reviews      rate a film: { name, stars, text } (one per visitor, a new one replaces it)
//   GET  /api/people/:id              one person and every film they're credited on
//   POST /api/messages                the feedback form: { name, email, topic, movieId, message }
//
// Comments (YouTube-style; a visitor's own are marked "mine")
//   GET    /api/movies/:id/comments   ?sort=top|new&offset=0&limit=20 -> { total, threads, hasMore, comments }
//   POST   /api/movies/:id/comments   { name, text, parentId? }  (parentId: reply to that comment's thread)
//   GET    /api/comments/:id/replies  a thread's replies, oldest first
//   PATCH  /api/comments/:id          { text }  edit your own
//   DELETE /api/comments/:id          delete your own (and its replies)
//   PUT    /api/comments/:id/vote     { vote: 1 | -1 | 0 }  like, dislike, or take it back
import express from "express";
import { rateLimit } from "express-rate-limit";
import { db, readFilms, readFilm, readCredits, reviewOut, nowISO, todayIST, currentFilmsVersion } from "../db.js";
import { reviewerFrom, ensureVisitor } from "../auth.js";
import { reviewProblem, messageProblem, NAME_MAX } from "../validate.js";
import { listComments, listReplies, addComment, editComment, removeComment, voteComment, commentProblem } from "../comments.js";

export const publicApi = express.Router();

// Every film as JSON, rebuilt only after a change (in this process, or by `npm run sync` in another one)
let cache = { key: "", json: "[]" };
export function filmsJSON() {
  const key = `${currentFilmsVersion()}:${db.prepare("PRAGMA data_version").get().data_version}`;
  if (cache.key !== key) cache = { key, json: JSON.stringify(readFilms()) };
  return cache.json;
}

const ATTRIBUTION = {
  imdb: "Information courtesy of IMDb (https://www.imdb.com). Used with permission.",
  tmdb: "This product uses the TMDB API but is not endorsed or certified by TMDB.",
};

// A film is out once its release date (in India) arrives; without a date, "released" is a fallback
const isReleased = m => (/^\d{4}-\d{2}-\d{2}$/.test(m.release || "") ? m.release <= todayIST() : m.status === "released");
const filmId = req => (/^\d{1,9}$/.test(req.params.id) ? Number(req.params.id) : null);
const visibleReviews = (reviewer, movieId = null) => db.prepare(`
  SELECT * FROM audience_reviews
  WHERE (hidden = 0 OR reviewer = ?) ${movieId === null ? "" : "AND movie_id = ?"}
  ORDER BY created_at DESC
`).all(...[reviewer ?? "", ...(movieId === null ? [] : [movieId])]).map(r => reviewOut(r, { reviewer }));

const limit = (minutes, max, error) => rateLimit({
  windowMs: minutes * 60e3, limit: max, standardHeaders: "draft-8", legacyHeaders: false, message: { error },
});

publicApi.get("/bootstrap.js", (req, res) => {
  const reviews = JSON.stringify(visibleReviews(reviewerFrom(req)));
  res.type("application/javascript").set("Cache-Control", "no-store");
  res.send(`window.MANA_SERVER = {"generatedAt":${JSON.stringify(nowISO())},"attribution":${JSON.stringify(ATTRIBUTION)},"movies":${filmsJSON()},"reviews":${reviews}};\n`);
});

publicApi.get("/health", (req, res) => {
  res.json({ ok: true, films: db.prepare("SELECT COUNT(*) AS n FROM movies").get().n, time: nowISO() });
});

publicApi.get("/movies", (req, res) => {
  const lang = String(req.query.lang || "").trim();
  if (!lang) return res.type("json").send(`{"movies":${filmsJSON()}}`);
  res.json({ movies: readFilms().filter(m => String(m.lang || "").toLowerCase() === lang.toLowerCase()) });
});

publicApi.get("/movies/:id", (req, res) => {
  const movie = filmId(req) && readFilm(filmId(req));
  if (!movie) return res.status(404).json({ error: "That film doesn't exist." });
  res.json({ movie });
});

publicApi.get("/movies/:id/credits", (req, res) => {
  const id = filmId(req);
  if (!id || !db.prepare("SELECT 1 FROM movies WHERE id = ?").get(id)) return res.status(404).json({ error: "That film doesn't exist." });
  const credits = readCredits(id);
  res.set("Cache-Control", "public, max-age=300");
  res.json({ movieId: id, ...credits, attribution: credits.source ? ATTRIBUTION[credits.source] : "" });
});

publicApi.get("/movies/:id/reviews", (req, res) => {
  const id = filmId(req);
  if (!id) return res.status(404).json({ error: "That film doesn't exist." });
  res.json({ reviews: visibleReviews(reviewerFrom(req), id) });
});

publicApi.post("/movies/:id/reviews", limit(15, 30, "Too many ratings from here. Try again in a few minutes."), (req, res) => {
  const id = filmId(req);
  const film = id && readFilm(id);
  if (!film) return res.status(404).json({ error: "That film doesn't exist." });
  if (!isReleased(film)) return res.status(400).json({ error: "Ratings open on release day." });
  const problem = reviewProblem(req.body);
  if (problem) return res.status(400).json({ error: problem });
  const reviewer = ensureVisitor(req, res);
  const name = String(req.body.name ?? "").trim().slice(0, NAME_MAX) || "Anonymous";
  const stars = Number(req.body.stars), text = String(req.body.text ?? "").trim(), at = nowISO();
  const old = db.prepare("SELECT id FROM audience_reviews WHERE movie_id = ? AND reviewer = ?").get(id, reviewer);
  // Editing doesn't undo a moderator's hide
  if (old) db.prepare("UPDATE audience_reviews SET name = ?, stars = ?, body = ?, created_at = ? WHERE id = ?").run(name, stars, text, at, old.id);
  else db.prepare("INSERT INTO audience_reviews (movie_id, reviewer, name, stars, body, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, reviewer, name, stars, text, at);
  const row = db.prepare("SELECT * FROM audience_reviews WHERE movie_id = ? AND reviewer = ?").get(id, reviewer);
  res.status(old ? 200 : 201).json({ ok: true, replaced: Boolean(old), review: reviewOut(row, { reviewer }) });
});

publicApi.get("/people/:id", (req, res) => {
  const id = filmId(req);
  const person = id && db.prepare("SELECT id, name, imdb_id, tmdb_id, photo, birth_year, death_year FROM people WHERE id = ?").get(id);
  if (!person) return res.status(404).json({ error: "That person isn't in the database." });
  const films = db.prepare(`
    SELECT m.id AS movieId, m.title, m.year, m.lang, c.kind, c.department, c.job, c.character
    FROM credits c JOIN movies m ON m.id = c.movie_id
    WHERE c.person_id = ? ORDER BY m.year DESC, m.title
  `).all(id);
  res.json({
    person: {
      id: person.id, name: person.name, imdbId: person.imdb_id || undefined, tmdbId: person.tmdb_id || undefined,
      photo: person.photo ? `https://image.tmdb.org/t/p/w185${person.photo}` : undefined,
      birthYear: person.birth_year || undefined, deathYear: person.death_year || undefined,
    },
    films,
  });
});

publicApi.post("/messages", limit(15, 10, "Too many messages from here. Try again in a few minutes."), (req, res) => {
  const problem = messageProblem(req.body);
  if (problem) return res.status(400).json({ error: problem });
  const b = req.body;
  const movieId = Number(b.movieId) || null;
  db.prepare("INSERT INTO messages (name, email, topic, movie_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    String(b.name).trim(), String(b.email ?? "").trim() || null, String(b.topic ?? "").trim() || null,
    movieId, String(b.message).trim(), nowISO());
  res.status(201).json({ ok: true });
});

// ---------- Comments ----------
const filmExists = id => Boolean(id && db.prepare("SELECT 1 FROM movies WHERE id = ?").get(id));
const answer = (res, out, ok = 200) => (out.error ? res.status(out.status || 400).json({ error: out.error }) : res.status(ok).json(out));

publicApi.get("/movies/:id/comments", (req, res) => {
  const id = filmId(req);
  if (!filmExists(id)) return res.status(404).json({ error: "That film doesn't exist." });
  const sort = req.query.sort === "new" ? "new" : "top";
  res.json(listComments(id, { viewer: reviewerFrom(req), sort, offset: Number(req.query.offset) || 0, limit: Number(req.query.limit) || 20 }));
});

publicApi.post("/movies/:id/comments", limit(10, 20, "You're commenting very fast. Wait a few minutes and try again."), (req, res) => {
  const id = filmId(req);
  if (!filmExists(id)) return res.status(404).json({ error: "That film doesn't exist." });
  const problem = commentProblem(req.body);
  if (problem) return res.status(400).json({ error: problem });
  const parentId = req.body.parentId === undefined || req.body.parentId === null ? null : Number(req.body.parentId);
  if (parentId !== null && !Number.isSafeInteger(parentId)) return res.status(400).json({ error: "That comment isn't valid." });
  answer(res, addComment({ movieId: id, parentId, viewer: ensureVisitor(req, res), name: req.body.name, text: req.body.text }), 201);
});

publicApi.get("/comments/:id/replies", (req, res) => {
  const id = /^\d{1,15}$/.test(req.params.id) ? Number(req.params.id) : null;
  if (!id) return res.status(404).json({ error: "That comment was deleted." });
  res.json({ replies: listReplies(id, { viewer: reviewerFrom(req) }) });
});

publicApi.patch("/comments/:id", limit(10, 40, "Too many edits. Wait a few minutes and try again."), (req, res) => {
  const id = /^\d{1,15}$/.test(req.params.id) ? Number(req.params.id) : null;
  const problem = commentProblem(req.body, { needName: false });
  if (problem) return res.status(400).json({ error: problem });
  answer(res, editComment(id, reviewerFrom(req), req.body.text));
});

publicApi.delete("/comments/:id", (req, res) => {
  const id = /^\d{1,15}$/.test(req.params.id) ? Number(req.params.id) : null;
  answer(res, removeComment(id, reviewerFrom(req)));
});

publicApi.put("/comments/:id/vote", limit(10, 300, "Too many likes from here. Wait a few minutes."), (req, res) => {
  const id = /^\d{1,15}$/.test(req.params.id) ? Number(req.params.id) : null;
  const vote = req.body?.vote;
  if (![1, -1, 0].includes(vote)) return res.status(400).json({ error: "Send { vote: 1 } to like, -1 to dislike, 0 to take it back." });
  answer(res, voteComment(id, ensureVisitor(req, res), vote));
});
