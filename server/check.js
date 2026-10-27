// npm run check: starts the app on a spare port with a throwaway database and tries every API route.
// Your real database (data/mana-cinema.db) and .env password are not touched.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mana-check-"));
process.env.DATABASE_FILE = path.join(dir, "check.db");
process.env.ADMIN_PASSWORD = "check-password-123";
process.env.AUTO_SYNC_RATINGS = "false";
process.env.IMAGE_CACHE_DIR = path.join(dir, "img");
// Sign-in starts switched off whatever .env says; the accounts checks switch it on
process.env.EMAIL_SENDER = "";
process.env.GOOGLE_CLIENT_ID = "";

// A stand-in for TMDB's image server: a tiny WebP, a slow answer, an HTML page and a too-large file
const http = await import("node:http");
const upstreamHits = {};
let jwks = { keys: [] };   // a stand-in for Google's sign-in keys, at /certs
const TINY_WEBP = Buffer.from("UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=", "base64");
const upstream = http.createServer((req, res) => {
  if (req.url === "/certs") { res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "public, max-age=600" }); return res.end(JSON.stringify(jwks)); }
  const name = req.url.split("/").pop();
  upstreamHits[name] = (upstreamHits[name] || 0) + 1;
  if (name.startsWith("slowfile")) return setTimeout(() => { res.writeHead(200, { "Content-Type": "image/webp" }); res.end(TINY_WEBP); }, 300);
  if (name.startsWith("htmlfile")) { res.writeHead(200, { "Content-Type": "text/html" }); return res.end("<h1>not an image</h1>"); }
  if (name.startsWith("hugefile")) { res.writeHead(200, { "Content-Type": "image/webp" }); return res.end(Buffer.alloc(3 * 1024 * 1024)); }
  if (name.startsWith("gonefile")) { res.writeHead(404, { "Content-Type": "text/html" }); return res.end("gone"); }
  res.writeHead(200, { "Content-Type": "image/webp" });
  res.end(TINY_WEBP);
});
upstream.listen(0);
await new Promise(r => upstream.once("listening", r));
process.env.IMAGE_UPSTREAM = `http://localhost:${upstream.address().port}/t/p`;

const { ensureSeeded } = await import("./seed.js");
const { createApp } = await import("./app.js");
const { db, replaceCredits } = await import("./db.js");
ensureSeeded({ log: () => {} });
const server = createApp().listen(0);
await new Promise(r => server.once("listening", r));
const base = `http://localhost:${server.address().port}`;

let failures = 0, cookie = "", visitor = "";
const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"}  ${what}`); if (!ok) failures++; };
async function call(method, url, body, { auth = false, asVisitor = false, origin, jar } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) headers.Cookie = cookie;
  if (asVisitor && visitor) headers.Cookie = visitor;
  if (jar) headers.Cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
  if (origin) headers.Origin = origin;
  const res = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const set = res.headers.getSetCookie?.() || [];
  if (jar) for (const c of set) { const [kv] = c.split(";"); const i = kv.indexOf("="); const v = kv.slice(i + 1); if (v && !/Expires=Thu, 01 Jan 1970/i.test(c)) jar[kv.slice(0, i)] = v; else delete jar[kv.slice(0, i)]; }
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

  // Search by cast and crew
  replaceCredits(10, "tmdb", [
    { kind: "cast", name: "Pawan Kalyan", tmdbId: 1, character: "Ojas Gambheera" },
    { kind: "crew", name: "Sujeeth", tmdbId: 2, department: "Directing", job: "Director" },
  ]);
  const byActor = (await call("GET", "/api/search?q=pawan%20kalyan")).json;
  check(byActor.movies[0]?.id === 10 && byActor.movies[0].why === "Cast: Pawan Kalyan as Ojas Gambheera" && byActor.people[0]?.name === "Pawan Kalyan", "search finds a film by its actor");
  check((await call("GET", "/api/search?q=SUJEETH")).json.movies[0]?.why === "Director: Sujeeth", "search finds a film by its director, in any case");
  check((await call("GET", "/api/search?q=k")).json.movies.length === 0 && (await call("GET", "/api/search?q=%25_%25")).json.movies.length === 0, "one letter or wildcards find nothing");
  replaceCredits(10, "tmdb", []);

  // Posters and photos through /img (the stand-in above plays TMDB)
  const addImage = (file, status = "approved", role = null) => db.prepare(`INSERT INTO movie_images (movie_id, tmdb_id, kind, file_path, rank, status, role, chosen_by, first_seen, last_seen)
    VALUES (10, 1, 'poster', ?, 0, ?, ?, 'auto', 'now', 'now')`).run(file, status, role);
  addImage("posterfile1.jpg", "approved", "poster");
  addImage("slowfile123.jpg");
  addImage("htmlfile123.jpg");
  addImage("hugefile123.jpg");
  addImage("pendingfile1.jpg", "pending");
  const ogNow = (await call("GET", "/api/movies/10")).json.movie;
  check(ogNow.images?.poster === "posterfile1.jpg", "a film carries its chosen poster");
  const firstImg = await fetch(`${base}/img/w342/posterfile1.jpg`);
  const secondImg = await fetch(`${base}/img/w342/posterfile1.jpg`);
  check(firstImg.status === 200 && firstImg.headers.get("content-type") === "image/webp" && secondImg.status === 200 && upstreamHits["posterfile1.jpg"] === 1, "a poster is fetched once, then served from disk as WebP");
  await Promise.all(Array.from({ length: 10 }, () => fetch(`${base}/img/w185/slowfile123.jpg`)));
  check(upstreamHits["slowfile123.jpg"] === 1, "10 requests at once cause one download");
  const refused = await Promise.all(["/img/w342/pendingfile1.jpg", "/img/original/posterfile1.jpg", "/img/w342/..%2F..%2Fdb.jpg", "/img/w9999/posterfile1.jpg"].map(u => fetch(base + u).then(r => r.status)));
  check(refused.every(st => st === 404) && !upstreamHits["pendingfile1.jpg"], "unapproved files, original size and odd paths are refused without asking TMDB");
  const bad = await Promise.all(["/img/w342/htmlfile123.jpg", "/img/w342/hugefile123.jpg"].map(u => fetch(base + u).then(r => r.status)));
  check(bad.every(st => st === 502) && !fs.existsSync(path.join(dir, "img", "w342", "htmlfile123.jpg.webp")), "a non-image or oversized answer is refused and not saved");
  const photoLink = (await call("GET", "/api/movies/10/credits")).json;
  check([...photoLink.cast, ...photoLink.crew].every(p => !p.photo || p.photo.startsWith("img/w185/")), "cast and crew photos link to our own image server");
  db.prepare("DELETE FROM movie_images").run();

  // Comments
  const c1 = await call("POST", "/api/movies/10/comments", { name: "Check", text: "Loved the climax" }, { asVisitor: true });
  check(c1.status === 201 && c1.json.comment.mine === true, "a visitor can comment");
  const other = await call("POST", "/api/movies/10/comments", { name: "Other", text: "Interval block!" });
  const otherCookie = other.set.map(c => c.split(";")[0]).join("; ");
  const reply = await call("POST", "/api/movies/10/comments", { name: "Other", text: "Same here", parentId: c1.json.comment.id });
  check(reply.status === 201 && reply.json.comment.parentId === c1.json.comment.id, "anyone can reply");
  const nested = await call("POST", "/api/movies/10/comments", { name: "Third", text: "@Other yes", parentId: reply.json.comment.id });
  check(nested.json?.comment.parentId === c1.json.comment.id, "a reply to a reply joins the thread");
  check((await call("POST", "/api/movies/10/comments", { name: "MANA CINEMA", text: "fake" })).status === 400, "visitors can't post as MANA CINEMA");
  check((await call("POST", "/api/movies/10/comments", { text: "   " })).status === 400, "empty comments are refused");
  const liked = await call("PUT", `/api/comments/${c1.json.comment.id}/vote`, { vote: 1 }, { asVisitor: true });
  check(liked.json?.likes === 1 && liked.json.myVote === 1, "a visitor can like a comment");
  check((await call("PUT", `/api/comments/${c1.json.comment.id}/vote`, { vote: 1 }, { asVisitor: true })).json?.likes === 1, "liking twice still counts once");
  const page = (await call("GET", "/api/movies/10/comments?sort=top", undefined, { asVisitor: true })).json;
  check(page.total === 4 && page.threads === 2 && page.comments[0].id === c1.json.comment.id && page.comments[0].replyCount === 2, "Top comments: most liked first, with reply counts");
  check((await call("GET", "/api/movies/10/comments?sort=new")).json.comments[0].text === "Interval block!", "Newest first");
  check((await call("GET", `/api/comments/${c1.json.comment.id}/replies`)).json.replies.map(r => r.text).join("|") === "Same here|@Other yes", "replies come oldest first");
  const editedComment = await call("PATCH", `/api/comments/${c1.json.comment.id}`, { text: "Loved the climax!!" }, { asVisitor: true });
  check(editedComment.json?.comment.editedAt && editedComment.json.comment.text === "Loved the climax!!", "a visitor can edit their own comment");
  check((await call("PATCH", `/api/comments/${c1.json.comment.id}`, { text: "hacked" })).status === 403, "nobody else can edit it");
  check((await call("DELETE", `/api/comments/${c1.json.comment.id}`)).status === 403, "nobody else can delete it");

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

  // Comment moderation
  const threadId = c1.json.comment.id;
  check((await call("PATCH", `/api/admin/comments/${threadId}`, { pinned: true, hearted: true }, { auth: true })).json?.comment.pinned === true, "admin pins and hearts a comment");
  check((await call("GET", "/api/movies/10/comments?sort=new")).json.comments[0].id === threadId, "a pinned comment stays on top");
  check((await call("PATCH", `/api/admin/comments/${reply.json.comment.id}`, { pinned: true }, { auth: true })).status === 400, "replies can't be pinned");
  const official = await call("POST", "/api/admin/comments", { movieId: 10, parentId: threadId, text: "Thanks for watching!" }, { auth: true });
  check(official.status === 201 && official.json.comment.byAdmin && official.json.comment.name === "MANA CINEMA", "admin replies as MANA CINEMA");
  const otherId = (await call("GET", "/api/movies/10/comments?sort=new")).json.comments.find(c => c.text === "Interval block!").id;
  await call("PATCH", `/api/admin/comments/${otherId}`, { hidden: true }, { auth: true });
  check(!(await call("GET", "/api/movies/10/comments")).text.includes("Interval block!"), "a hidden comment leaves the page");
  const authorView = await fetch(`${base}/api/movies/10/comments`, { headers: { Cookie: otherCookie } }).then(r => r.json());
  check(authorView.comments.some(c => c.id === otherId && c.hidden), "its author still sees it, marked hidden");
  check((await call("GET", "/api/admin/comments", undefined, { auth: true })).json?.comments.length === 5, "admin sees every comment");

  // Backup round trip
  const backup = (await call("GET", "/api/admin/backup", undefined, { auth: true })).json;
  check(backup.comments?.length === 5 && backup.comments.some(c => c.votes?.length === 1), "the backup has comments with their likes");
  const restored = await call("POST", "/api/admin/restore", backup, { auth: true });
  check(restored.status === 200 && restored.json.films === films.length, "backup restores");
  const after = (await call("GET", "/api/admin/data", undefined, { auth: true })).json;
  check(JSON.stringify(after.movies.find(m => m.id === 10)) === JSON.stringify(backup.movies.find(m => m.id === 10)), "a restored film is identical");
  const backupAgain = (await call("GET", "/api/admin/backup", undefined, { auth: true })).json;
  check(JSON.stringify(backupAgain.comments) === JSON.stringify(backup.comments), "restored comments and likes are identical");
  check((await call("POST", "/api/admin/reset/comments", undefined, { auth: true })).json?.deleted === 5, "all comments can be deleted");
  check((await call("POST", "/api/admin/restore", { app: "nope" }, { auth: true })).status === 400, "a bad backup is refused");
  check((await call("POST", "/api/admin/reset/films", undefined, { auth: true })).json?.ok === true, "original films can be restored");
  const resetOg = (await call("GET", "/api/movies/10")).json.movie;
  check(resetOg.boxOffice.days.length === 29 && resetOg.imdbId === "tt0000010", "reset brings back the researched figures and keeps the IMDb ID");
  check((await call("GET", "/api/admin/sync", undefined, { auth: true })).json?.tasks.length === 6, "sync status lists the six tasks");
  // ---------- Viewers' accounts ----------
  const { config } = await import("./env.js");
  const nodeCrypto = await import("node:crypto");
  const keyPair = () => nodeCrypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const google = keyPair(), stranger = keyPair();
  jwks = { keys: [{ ...google.publicKey.export({ format: "jwk" }), kid: "check-key", alg: "RS256", use: "sig" }] };
  const CLIENT = "check-client.apps.googleusercontent.com";
  const googleToken = (claims, { key = google.privateKey, kid = "check-key" } = {}) => {
    const enc = o => Buffer.from(JSON.stringify(o)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const body = `${enc({ alg: "RS256", kid, typ: "JWT" })}.${enc({ iss: "https://accounts.google.com", aud: CLIENT, iat: now, exp: now + 3600, ...claims })}`;
    return `${body}.${nodeCrypto.sign("sha256", Buffer.from(body), key).toString("base64url")}`;
  };
  // The test email sender prints the code; catch it here
  let lastCode = "";
  const log = console.log;
  console.log = (...args) => { const m = /\[test email\].*: (\d{6})$/.exec(args.join(" ")); if (m) lastCode = m[1]; else log(...args); };

  // A visitor rates a film before sign-in is set up...
  const early = {};
  check((await call("POST", "/api/movies/10/reviews", { name: "Early", stars: 2, text: "Before accounts" }, { jar: early })).status === 201, "before sign-in is set up, anyone can rate");
  check((await call("POST", "/api/movies/10/comments", { name: "Early", text: "First!" }, { jar: early })).status === 201, "before sign-in is set up, anyone can comment");

  // ...then sign-in is switched on
  Object.assign(config, { emailSender: "console", googleClientId: CLIENT, googleJwksUrl: `http://localhost:${upstream.address().port}/certs` });
  const bootOff = (await call("GET", "/api/bootstrap.js")).text;
  check(bootOff.includes(`"signIn":{"google":"${CLIENT}","email":{"test":true}}`) && bootOff.includes('"me":null'), "pages learn which sign-in methods are offered");
  const anonRate = await call("POST", "/api/movies/10/reviews", { stars: 5 }, { jar: {} });
  check(anonRate.status === 401 && anonRate.json.signIn === true, "with sign-in set up, rating needs an account");
  check((await call("POST", "/api/movies/10/comments", { text: "hi" }, { jar: {} })).status === 401, "with sign-in set up, commenting needs an account");

  // Email-code sign-in
  check((await call("POST", "/api/auth/email/start", { email: "not-an-email" }, { jar: early })).status === 400, "something that isn't an email address is refused");
  const started = await call("POST", "/api/auth/email/start", { email: " Ravi.Teja+films@Gmail.com " }, { jar: early });
  check(started.status === 200 && /^\d{6}$/.test(lastCode), "a code is emailed");
  check((await call("POST", "/api/auth/email/start", { email: "raviteja@gmail.com" }, { jar: early })).status === 429, "a second code within a minute is refused, even for the same Gmail written differently");
  const wrong = String((Number(lastCode) + 1) % 1e6).padStart(6, "0");
  const wrongTry = await call("POST", "/api/auth/email/verify", { email: "Ravi.Teja+films@gmail.com", code: wrong }, { jar: early });
  check(wrongTry.status === 400 && /4 tries left/.test(wrongTry.json.error), "a wrong code is refused and counts a try");
  const goodCode = lastCode;
  const emailIn = await call("POST", "/api/auth/email/verify", { email: "raviteja@googlemail.com", code: goodCode }, { jar: early });
  check(emailIn.status === 200 && emailIn.json.created === true && Boolean(early.mana_user), "the right code signs in and makes an account");
  check((await call("POST", "/api/auth/email/verify", { email: "raviteja@gmail.com", code: goodCode }, { jar: {} })).status === 400, "a code works only once");
  const emailUser = emailIn.json.user;
  check(emailUser.method === "email" && emailUser.email === "raviteja@googlemail.com", "the account shows its email address");
  check(!JSON.stringify(db.prepare("SELECT * FROM sign_in_codes").all()).includes(goodCode), "the database never keeps the code itself");

  // What the visitor posted before signing in is now the account's
  const claimed = (await call("GET", "/api/movies/10/reviews", undefined, { jar: early })).json.reviews.find(r => r.mine);
  check(claimed?.verified === true && claimed.stars === 2, "a rating from before signing in moves to the account");
  check((await call("GET", "/api/movies/10/comments?sort=new", undefined, { jar: early })).json.comments.some(c => c.mine && c.text === "First!"), "comments from before signing in move to the account");
  const meBoot = (await call("GET", "/api/bootstrap.js", undefined, { jar: early })).text;
  check(/"me":\{"id":\d+,"name":"raviteja","method":"email"/.test(meBoot), "pages know who is signed in");

  // Renaming, rating as the account
  check((await call("PATCH", "/api/me", { name: "Mana Cinema" }, { jar: early })).status === 400, "an account can't be named MANA CINEMA");
  check((await call("PATCH", "/api/me", { name: "Ravi Teja Fan" }, { jar: early })).json?.user.name === "Ravi Teja Fan", "the account can be renamed");
  const rated = await call("POST", "/api/movies/10/reviews", { name: "Someone else", stars: 4, text: "Rated as an account" }, { jar: early });
  check(rated.status === 200 && rated.json.replaced && rated.json.review.name === "Ravi Teja Fan" && rated.json.review.verified, "an account's rating carries its name and replaces its earlier one");
  const newest = (await call("GET", "/api/movies/10/comments?sort=new")).json.comments[0].id;
  check((await call("PUT", `/api/comments/${newest}/vote`, { vote: 1 }, { jar: early })).json?.myVote === 1, "an account can like a comment");

  // Google sign-in
  const g = {};
  const nonceOf = async jar => (await call("GET", "/api/auth/nonce", undefined, { jar })).json.nonce;
  let nonce = await nonceOf(g);
  check(typeof nonce === "string" && Boolean(g.mana_nonce), "Google sign-in starts with a one-time nonce");
  const google401 = async (token, why) => check((await call("POST", "/api/auth/google", { credential: token }, { jar: { ...g } })).status === 401, why);
  await google401(googleToken({ sub: "g-1", nonce, aud: "someone-else" }), "a Google token for another website is refused");
  await google401(googleToken({ sub: "g-1", nonce, iss: "https://evil.example" }), "a token from another issuer is refused");
  await google401(googleToken({ sub: "g-1", nonce, exp: Math.floor(Date.now() / 1000) - 3600 }), "an expired Google token is refused");
  await google401(googleToken({ sub: "g-1", nonce }, { key: stranger.privateKey }), "a token signed with someone else's key is refused");
  await google401(googleToken({ sub: "g-1", nonce: "wrong" }), "a token with the wrong nonce is refused");
  await google401("not.a.token", "a damaged token is refused");
  const gIn = await call("POST", "/api/auth/google", { credential: googleToken({ sub: "g-1", nonce, email: "fan@example.com", email_verified: true, given_name: "Priya" }) }, { jar: g });
  check(gIn.status === 200 && gIn.json.created && gIn.json.user.name === "Priya" && gIn.json.user.email === "fan@example.com" && Boolean(g.mana_user), "a genuine Google token signs in");
  check(!g.mana_nonce, "the nonce is used up");
  const g2 = {};
  nonce = await nonceOf(g2);
  const gAgain = await call("POST", "/api/auth/google", { credential: googleToken({ sub: "g-1", nonce }) }, { jar: g2 });
  check(gAgain.status === 200 && gAgain.json.created === false && gAgain.json.user.id === gIn.json.user.id, "signing in again finds the same account");
  check((await call("POST", "/api/movies/10/reviews", { stars: 5 }, { jar: g })).status === 201, "a second person can rate the same film");
  // One email address is one account
  const g3 = {};
  nonce = await nonceOf(g3);
  const linked = await call("POST", "/api/auth/google", { credential: googleToken({ sub: "g-2", nonce, email: "RaviTeja@gmail.com", email_verified: true }) }, { jar: g3 });
  check(linked.json?.created === false && linked.json.user.id === emailUser.id && linked.json.user.method === "google", "Google with the same verified address reaches the email-code account");
  const g4 = {};
  nonce = await nonceOf(g4);
  const unverified = await call("POST", "/api/auth/google", { credential: googleToken({ sub: "g-3", nonce, email: "raviteja@gmail.com", email_verified: false }) }, { jar: g4 });
  check(unverified.json?.created === true && unverified.json.user.id !== emailUser.id, "an address Google hasn't verified isn't linked to anyone's account");

  // Admin: accounts and blocking
  const users = (await call("GET", "/api/admin/users", undefined, { auth: true })).json?.users || [];
  check(users.length === 3 && users.some(u => u.id === emailUser.id && u.ratings === 1 && u.comments === 1), "admin sees every account with its ratings");
  check((await call("GET", "/api/admin/users")).status === 401, "accounts are admin-only");
  check((await call("PATCH", `/api/admin/users/${emailUser.id}`, { blocked: true }, { auth: true })).json?.user.blocked === true, "admin blocks an account");
  check(!(await call("GET", "/api/movies/10/reviews")).text.includes("Rated as an account"), "a blocked account's ratings are hidden");
  check((await call("POST", "/api/movies/10/reviews", { stars: 1 }, { jar: early })).status === 403, "a blocked account can't rate");
  await call("PATCH", `/api/admin/users/${emailUser.id}`, { blocked: false }, { auth: true });
  check((await call("GET", "/api/movies/10/reviews")).text.includes("Rated as an account"), "unblocking shows the ratings again");

  // Download, sign out, delete
  const exported = await call("GET", "/api/me/export", undefined, { jar: early });
  check(exported.json?.ratings.length === 1 && exported.json.comments.length === 1 && exported.json.likes.length === 1, "the viewer can download everything kept about them");
  const second = {};
  nonce = await nonceOf(second);
  await call("POST", "/api/auth/google", { credential: googleToken({ sub: "g-1", nonce }) }, { jar: second });
  await call("POST", "/api/auth/signout", { everywhere: true }, { jar: g });
  check((await call("GET", "/api/me", undefined, { jar: { ...second } })).json.user === null, "signing out everywhere ends the other devices' sessions");
  check((await call("DELETE", "/api/me", { confirm: "yes" }, { jar: early })).status === 400, "deleting needs DELETE typed");
  check((await call("DELETE", "/api/me", { confirm: "DELETE" }, { jar: early })).status === 200, "a viewer can delete their account");
  check(!(await call("GET", "/api/movies/10/reviews")).text.includes("Rated as an account") && (await call("GET", "/api/me", undefined, { jar: early })).json.user === null, "deleting removes the account, its session and its ratings");
  check(db.prepare("SELECT COUNT(*) AS n FROM users").get().n === 2, "only the other accounts are left");
  check((await fetch(`${base}/api/movies/10/reviews`, { method: "POST", headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "cross-site", Cookie: `mana_user=${g4.mana_user}` }, body: '{"stars":5}' })).status === 403, "another website's page can't post with a viewer's cookie");

  // A real email through SMTP, to a stand-in mail server
  const net = await import("node:net");
  const mail = { auth: "", to: "", data: "" };
  const smtpServer = net.createServer(sock => {
    let inData = false;
    const say = text => sock.write(`${text}\r\n`);
    say("220 check ESMTP");
    sock.on("data", chunk => {
      for (const line of chunk.toString().split("\r\n").slice(0, -1)) {
        if (inData) { if (line === ".") { inData = false; say("250 queued"); } else mail.data += `${line}\n`; continue; }
        if (/^EHLO/i.test(line)) say("250-check\r\n250 AUTH PLAIN LOGIN");
        else if (/^AUTH PLAIN/i.test(line)) { mail.auth = Buffer.from(line.split(" ")[2] || "", "base64").toString(); say("235 ok"); }
        else if (/^RCPT TO/i.test(line)) { mail.to = line; say("250 ok"); }
        else if (/^DATA/i.test(line)) { inData = true; say("354 go"); }
        else if (/^QUIT/i.test(line)) sock.end("221 bye\r\n");
        else say("250 ok");
      }
    });
  }).listen(0);
  await new Promise(r => smtpServer.once("listening", r));
  Object.assign(config, { emailSender: "smtp", smtp: { host: "localhost", port: smtpServer.address().port, user: "site@example.com", pass: "app-password" }, mailFrom: "" });
  const smtpSent = await call("POST", "/api/auth/email/start", { email: "smtp.fan@example.com" }, { jar: {} });
  const mailed = /(\d{6}) is your MANA CINEMA sign-in code/.exec(mail.data)?.[1];
  check(smtpSent.status === 200 && mail.to.includes("smtp.fan@example.com") && mail.auth.includes("site@example.com") && Boolean(mailed), "with SMTP set up, the code is really emailed");
  check((await call("POST", "/api/auth/email/verify", { email: "smtp.fan@example.com", code: mailed }, { jar: {} })).status === 200, "the emailed code signs in");
  config.smtp.pass = "";
  check((await call("POST", "/api/auth/email/start", { email: "nobody@example.com" }, { jar: {} })).status === 502, "a mail problem is reported, not hidden");
  smtpServer.close();

  console.log = log;
  Object.assign(config, { emailSender: "", googleClientId: "" });
  check((await call("POST", "/api/admin/logout", undefined, { auth: true })).status === 200, "admin signs out");
  check((await call("GET", "/api/admin/data", undefined, { auth: true })).status === 401, "signed-out cookie no longer works");
} catch (err) {
  console.error(err);
  failures++;
} finally {
  server.close();
  upstream.close();
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
process.exit(failures ? 1 : 0);
