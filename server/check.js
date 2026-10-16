// npm run check: starts the app on a spare port with a throwaway database and tries every API route.
// Your real database (data/mana-cinema.db) and .env password are not touched.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mana-check-"));
process.env.DATABASE_FILE = path.join(dir, "check.db");
process.env.ADMIN_PASSWORD = "check-password-123";
process.env.AUTO_SYNC_RATINGS = "false";

const { ensureSeeded } = await import("./seed.js");
const { createApp } = await import("./app.js");
const { db } = await import("./db.js");
ensureSeeded({ log: () => {} });
const server = createApp().listen(0);
await new Promise(r => server.once("listening", r));
const base = `http://localhost:${server.address().port}`;

let failures = 0, cookie = "", visitor = "";
const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"}  ${what}`); if (!ok) failures++; };
async function call(method, url, body, { auth = false, asVisitor = false, origin } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) headers.Cookie = cookie;
  if (asVisitor && visitor) headers.Cookie = visitor;
  if (origin) headers.Origin = origin;
  const res = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const set = res.headers.getSetCookie?.() || [];
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text, set };
}

try {
  // Pages and assets
  check((await call("GET", "/")).text.includes("MANA"), "home page is served");
  check((await call("GET", "/js/boxoffice.js")).status === 200, "scripts are served");
  for (const secret of ["/.env", "/data/mana-cinema.db", "/server/db.js", "/package.json", "/.git/config"]) {
    check((await call("GET", secret)).status === 404, `${secret} is not served`);
  }

  // Public API
  const boot = await call("GET", "/api/bootstrap.js");
  const films = JSON.parse(boot.text.replace(/^window\.MANA_SERVER = /, "").replace(/;\s*$/, "")).movies;
  check(boot.status === 200 && films.length > 200, `bootstrap.js has every film (${films.length})`);
  const og = films.find(m => m.id === 10);
  check(og?.boxOffice?.days?.length === 29 && og.boxOffice.days[1].net === 63.75, "day-wise collections come back as entered");
  check(og?.critics?.imdb?.votes === "12,253" && og.critics.reviews.length === 8, "critics and IMDb snapshot come back as entered");
  check((await call("GET", "/api/health")).json?.ok === true, "health check");
  check((await call("GET", "/api/movies?lang=Tamil")).json?.movies.every(m => m.lang === "Tamil"), "films by language");
  check((await call("GET", "/api/movies/999999")).status === 404, "unknown film is a 404");
  const credits = await call("GET", "/api/movies/10/credits");
  check(credits.status === 200 && Array.isArray(credits.json.cast) && Array.isArray(credits.json.crew), "credits endpoint answers");

  // Audience ratings
  const first = await call("POST", "/api/movies/10/reviews", { name: "Check", stars: 4, text: "Good" });
  visitor = first.set.map(c => c.split(";")[0]).join("; ");
  check(first.status === 201 && first.json.review.mine === true && visitor.includes("mana_visitor="), "a visitor can rate a film");
  const again = await call("POST", "/api/movies/10/reviews", { name: "Check", stars: 5, text: "Better" }, { asVisitor: true });
  check(again.json?.replaced === true && again.json.review.stars === 5, "rating again replaces the visitor's own rating");
  check((await call("POST", "/api/movies/10/reviews", { stars: 9 })).status === 400, "bad stars are refused");
  const upcoming = films.find(m => m.release && m.release > new Date().toISOString().slice(0, 10));
  if (upcoming) check((await call("POST", `/api/movies/${upcoming.id}/reviews`, { stars: 3 })).status === 400, "upcoming films can't be rated yet");
  const mine = await call("GET", "/api/bootstrap.js", undefined, { asVisitor: true });
  check(/"mine":true/.test(mine.text) && !/"mine":true/.test((await call("GET", "/api/bootstrap.js")).text), "only the visitor sees their review marked as theirs");

  // Feedback
  check((await call("POST", "/api/messages", { name: "Check", message: "Hello", topic: "Other feedback" })).status === 201, "feedback form saves a message");
  check((await call("POST", "/api/messages", { name: "", message: "" })).status === 400, "empty feedback is refused");
  check((await call("POST", "/api/messages", { name: "X", message: "Y" }, { origin: "https://evil.example" })).status === 403, "other websites can't post");

  // Admin
  check((await call("GET", "/api/admin/data")).status === 401, "admin data needs sign-in");
  check((await call("POST", "/api/admin/login", { password: "wrong" })).status === 401, "wrong password is refused");
  const login = await call("POST", "/api/admin/login", { password: "check-password-123" });
  cookie = login.set.map(c => c.split(";")[0]).join("; ");
  check(login.status === 200 && login.set.some(c => /HttpOnly/i.test(c)), "admin signs in with an HttpOnly cookie");
  const data = (await call("GET", "/api/admin/data", undefined, { auth: true })).json;
  check(data.movies.length === films.length && data.reviews.length === 1 && data.messages.length === 1, "admin sees films, reviews and messages");

  const edited = { ...og, imdbId: "tt0000010", trailer: { videoId: "abcdefghijk" }, boxOffice: { ...og.boxOffice, days: [...og.boxOffice.days, { day: 29, net: 0.05 }] } };
  const put = await call("PUT", "/api/admin/movies/10", edited, { auth: true });
  check(put.status === 200 && put.json.movie.boxOffice.days.length === 30 && put.json.movie.imdbId === "tt0000010" && put.json.movie.trailer.videoId === "abcdefghijk", "admin saves collections, IMDb ID and trailer");
  const clash = await call("PUT", "/api/admin/movies/1", { ...films.find(m => m.id === 1), imdbId: "tt0000010" }, { auth: true });
  check(clash.status === 409, "two films can't share an IMDb ID");
  check((await call("PUT", "/api/admin/movies/10", { ...og, boxOffice: { days: [{ day: 1, net: -5 }] } }, { auth: true })).status === 400, "negative collections are refused");
  const added = await call("PUT", "/api/admin/movies/9001", { title: "Check Film", lang: "Telugu", languages: ["Telugu"], release: "2030-01-01" }, { auth: true });
  check(added.status === 200 && added.json.movie.id === 9001, "admin adds a film");
  check((await call("DELETE", "/api/admin/movies/9001", undefined, { auth: true })).status === 200, "admin deletes a film");

  const reviewId = data.reviews[0].id;
  check((await call("PATCH", `/api/admin/reviews/${reviewId}`, { hidden: true }, { auth: true })).json?.review.hidden === true, "admin hides a review");
  check(!/"Better"/.test((await call("GET", "/api/bootstrap.js")).text), "hidden reviews leave the website");
  check((await call("PATCH", `/api/admin/messages/${data.messages[0].id}`, { read: true }, { auth: true })).json?.message.read === true, "admin marks a message read");

  // Backup round trip
  const backup = { app: "mana-cinema", version: 2, catalog: 3, exportedAt: new Date().toISOString(), ...(await call("GET", "/api/admin/data", undefined, { auth: true })).json };
  const restored = await call("POST", "/api/admin/restore", backup, { auth: true });
  check(restored.status === 200 && restored.json.films === films.length, "backup restores");
  const after = (await call("GET", "/api/admin/data", undefined, { auth: true })).json;
  check(JSON.stringify(after.movies.find(m => m.id === 10)) === JSON.stringify(backup.movies.find(m => m.id === 10)), "a restored film is identical");
  check((await call("POST", "/api/admin/restore", { app: "nope" }, { auth: true })).status === 400, "a bad backup is refused");
  check((await call("POST", "/api/admin/reset/films", undefined, { auth: true })).json?.ok === true, "original films can be restored");
  const resetOg = (await call("GET", "/api/movies/10")).json.movie;
  check(resetOg.boxOffice.days.length === 29 && resetOg.imdbId === "tt0000010", "reset brings back the researched figures and keeps the IMDb ID");
  check((await call("GET", "/api/admin/sync", undefined, { auth: true })).json?.tasks.length === 5, "sync status lists the five tasks");
  check((await call("POST", "/api/admin/logout", undefined, { auth: true })).status === 200, "admin signs out");
  check((await call("GET", "/api/admin/data", undefined, { auth: true })).status === 401, "signed-out cookie no longer works");
} catch (err) {
  console.error(err);
  failures++;
} finally {
  server.close();
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
process.exit(failures ? 1 : 0);
