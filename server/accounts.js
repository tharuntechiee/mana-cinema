// Viewers' accounts: sign in with Google or with a 6-digit code sent to your email (codes.js), so each person
// has one rating per film (an anonymous cookie can be cleared to rate again; an account can't). Everything is
// kept in this site's own database; no outside sign-in service stores the accounts.
//
// A session is a random token in an HttpOnly cookie; the database keeps only its hash. Signing in replaces
// any earlier session in that browser, and anything the visitor posted before signing in (ratings, comments,
// likes) moves to their account. One email address is one account, whichever way you sign in.
import crypto from "node:crypto";
import { db, tx, nowISO, getMeta, setMeta } from "./db.js";
import { config } from "./env.js";
import { sha256, readCookies, reviewerFrom, ensureVisitor } from "./auth.js";
import { verifyJwt } from "./jwt.js";

// On HTTPS the cookie gets the __Host- prefix, so it can only be set by this exact site (not a subdomain)
const userCookie = req => (req.secure ? "__Host-mana_user" : "mana_user");
const userToken = req => { const c = readCookies(req); return c["__Host-mana_user"] || c.mana_user; };
const NONCE_COOKIE = "mana_nonce";
const SESSION_DAYS = 30;          // a sign-in lasts 30 days from the last visit...
const SESSION_MAX_DAYS = 180;     // ...and never more than 180 days from signing in
export const USER_NAME_MAX = 40;

// A secret for hashing sign-in codes: AUTH_SECRET from .env, else one made once and kept in the database
let secret = null;
export function authSecret() {
  if (secret) return secret;
  if (config.authSecret) return (secret = config.authSecret);
  let s = getMeta("auth_secret");
  if (!s) { s = crypto.randomBytes(32).toString("base64url"); setMeta("auth_secret", s); }
  return (secret = s);
}
export const keyed = text => crypto.createHmac("sha256", authSecret()).update(String(text)).digest("hex");

export const viewerKey = userId => `u:${userId}`;
const cookieOptions = req => ({ httpOnly: true, sameSite: "lax", secure: req.secure, path: "/" });

// ---------- Which sign-in methods this server offers ----------
// Email codes go out through your own mail account (EMAIL_SENDER=smtp) or, for testing on this computer,
// EMAIL_SENDER=console, which prints the code in the server window
export const emailMethod = () => (["smtp", "console"].includes(config.emailSender) ? { test: config.emailSender === "console" } : null);
export function signInMethods() {
  return { google: config.googleClientId || null, email: emailMethod() };
}
// With at least one method set up, ratings need an account; with none, the anonymous cookie is used as before
export const accountsOn = () => Boolean(config.googleClientId || emailMethod());

// The address an account is matched on: lower case, and for Gmail without dots or a +tag, because Gmail
// delivers r.a.vi+x@gmail.com to ravi@gmail.com (so one inbox can't make many accounts)
export function emailKey(address) {
  const email = String(address ?? "").trim().toLowerCase();
  const m = /^([^@\s]+)@([^@\s]+\.[^@\s]+)$/.exec(email);
  if (!m || email.length > 200) return null;
  let [, local, domain] = m;
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.split("+")[0].replace(/\./g, "");
  return local ? `${local}@${domain}` : null;
}

// The privacy notice shown when signing in; an account records which version it agreed to, and when
export const NOTICE_VERSION = "2026-10-27";

// ---------- Sessions ----------
function sessionRow(req) {
  const token = userToken(req);
  if (!token || !/^[\w-]{40,64}$/.test(token)) return null;
  return db.prepare(`
    SELECT s.token_hash, s.last_seen_at AS session_seen, u.* FROM user_sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).get(sha256(`user:${token}`), nowISO()) || null;
}

// The signed-in user, or null. Keeps the session alive (at most one write an hour).
export function userFrom(req) {
  if (req.manaUser !== undefined) return req.manaUser;
  const row = sessionRow(req);
  if (row && Date.now() - Date.parse(row.session_seen) > 3600e3) {
    const now = Date.now();
    const created = db.prepare("SELECT created_at FROM user_sessions WHERE token_hash = ?").get(row.token_hash).created_at;
    const expires = Math.min(now + SESSION_DAYS * 864e5, Date.parse(created) + SESSION_MAX_DAYS * 864e5);
    db.prepare("UPDATE user_sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?").run(new Date(now).toISOString(), new Date(expires).toISOString(), row.token_hash);
    db.prepare("UPDATE users SET last_seen_at = ? WHERE id = ?").run(new Date(now).toISOString(), row.id);
  }
  req.manaUser = row;
  return row;
}

function startUserSession(req, res, userId) {
  endUserSession(req, res, { keepCookie: true });   // a fresh token on every sign-in
  const token = crypto.randomBytes(32).toString("base64url");
  const now = Date.now();
  db.prepare("DELETE FROM user_sessions WHERE expires_at <= ?").run(nowISO());
  db.prepare("INSERT INTO user_sessions (token_hash, user_id, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?)")
    .run(sha256(`user:${token}`), userId, new Date(now).toISOString(), new Date(now).toISOString(), new Date(now + SESSION_DAYS * 864e5).toISOString());
  res.cookie(userCookie(req), token, { ...cookieOptions(req), maxAge: SESSION_DAYS * 864e5 });
  req.manaUser = undefined;
}

export function endUserSession(req, res, { everywhere = false, keepCookie = false } = {}) {
  const token = userToken(req);
  if (token) {
    const row = db.prepare("SELECT user_id FROM user_sessions WHERE token_hash = ?").get(sha256(`user:${token}`));
    if (everywhere && row) db.prepare("DELETE FROM user_sessions WHERE user_id = ?").run(row.user_id);
    else db.prepare("DELETE FROM user_sessions WHERE token_hash = ?").run(sha256(`user:${token}`));
  }
  if (!keepCookie) res.clearCookie(userCookie(req), cookieOptions(req));
  req.manaUser = null;
}

// Who is posting or voting: the account when signed in, else the anonymous visitor cookie
export function viewerFrom(req) {
  const u = userFrom(req);
  return u ? viewerKey(u.id) : reviewerFrom(req);
}
export function ensureViewer(req, res) {
  const u = userFrom(req);
  return u ? viewerKey(u.id) : ensureVisitor(req, res);
}

// Posting a rating, comment or like: needs an account once sign-in is set up. Returns an error or null.
export function postingProblem(req, what = "rate") {
  const u = userFrom(req);
  if (u?.blocked) return { error: "Your account can't post on MANA CINEMA. Use the feedback form if you think this is a mistake.", status: 403 };
  if (!u && accountsOn()) return { error: `Sign in to ${what}.`, status: 401, signIn: true };
  return null;
}

// What the pages see about the signed-in user
export function userOut(u) {
  if (!u) return null;
  const out = { id: u.id, name: u.name, method: u.google_sub ? "google" : "email", since: u.created_at };
  if (u.email) out.email = u.email;
  if (u.blocked) out.blocked = true;
  return out;
}

// ---------- Signing in ----------
// Finds or makes the account, signs this browser in, and moves the visitor's anonymous posts to it.
// email must be an address the person has proved is theirs (Google says so, or they typed our code).
export function signIn(req, res, { googleSub = null, email = null, name = "" }, visitor = null) {
  const now = nowISO();
  const key = email ? emailKey(email) : null;
  let created = false;
  const user = tx(() => {
    let u = (googleSub && db.prepare("SELECT * FROM users WHERE google_sub = ?").get(googleSub))
      || (key && db.prepare("SELECT * FROM users WHERE email_key = ?").get(key));
    if (u) {
      // Signing in with Google to an account made by email code links the two (and the other way round)
      if (googleSub && !u.google_sub) db.prepare("UPDATE users SET google_sub = ? WHERE id = ?").run(googleSub, u.id);
      // A Google account whose address changed: follow it, unless another account already has that address
      if (key && key !== u.email_key && !db.prepare("SELECT 1 FROM users WHERE email_key = ?").get(key)) {
        db.prepare("UPDATE users SET email = ?, email_key = ? WHERE id = ?").run(email, key, u.id);
      }
      db.prepare("UPDATE users SET last_seen_at = ? WHERE id = ?").run(now, u.id);
    } else {
      const clean = String(name || "").trim().slice(0, USER_NAME_MAX) || (email ? email.split("@")[0].slice(0, USER_NAME_MAX) : "Viewer");
      const id = Number(db.prepare("INSERT INTO users (name, email, email_key, google_sub, notice, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(clean, email, key, googleSub, NOTICE_VERSION, now, now).lastInsertRowid);
      u = { id };
      created = true;
    }
    if (visitor) claimVisitorPosts(visitor, viewerKey(u.id));
    return db.prepare("SELECT * FROM users WHERE id = ?").get(u.id);
  });
  startUserSession(req, res, user.id);
  return { ...user, created };   // created: a new account, so the page asks for a name
}

// Ratings for films the account hasn't rated yet, comments and likes all move to the account
function claimVisitorPosts(from, to) {
  db.prepare(`UPDATE audience_reviews SET reviewer = ? WHERE reviewer = ?
    AND movie_id NOT IN (SELECT movie_id FROM audience_reviews WHERE reviewer = ?)`).run(to, from, to);
  db.prepare("DELETE FROM audience_reviews WHERE reviewer = ?").run(from);   // the account's own rating wins
  db.prepare("UPDATE comments SET author = ? WHERE author = ?").run(to, from);
  db.prepare(`UPDATE comment_votes SET voter = ? WHERE voter = ?
    AND comment_id NOT IN (SELECT comment_id FROM comment_votes WHERE voter = ?)`).run(to, from, to);
  db.prepare("DELETE FROM comment_votes WHERE voter = ?").run(from);
}

// Google: the page gets a nonce (also kept in a short-lived cookie), passes it to Google's button, and sends
// back the ID token; the token must carry the same nonce, so a token can't be replayed in another browser.
export function googleNonce(req, res) {
  const value = crypto.randomBytes(24).toString("base64url");
  res.cookie(NONCE_COOKIE, value, { ...cookieOptions(req), sameSite: "strict", path: "/api/auth", maxAge: 15 * 60e3 });
  return sha256(`nonce:${value}`);
}

export async function googleSignIn(req, res, credential, visitor) {
  if (!config.googleClientId) return { error: "Google sign-in isn't set up on this site.", status: 404 };
  let claims;
  try {
    claims = await verifyJwt(credential, {
      jwksUrl: config.googleJwksUrl,
      issuers: ["accounts.google.com", "https://accounts.google.com"],
      audience: config.googleClientId,
    });
  } catch (err) {
    return { error: err.message, status: 401 };
  }
  const nonce = readCookies(req)[NONCE_COOKIE];
  res.clearCookie(NONCE_COOKIE, { ...cookieOptions(req), sameSite: "strict", path: "/api/auth" });
  if (!nonce || claims.nonce !== sha256(`nonce:${nonce}`)) return { error: "That sign-in took too long or came from another tab. Try again.", status: 401 };
  const email = claims.email && claims.email_verified === true ? String(claims.email).slice(0, 200) : null;
  const user = signIn(req, res, { googleSub: String(claims.sub), name: claims.given_name || claims.name || "", email }, visitor);
  return { user };
}

// ---------- The account page: rename, download, delete ----------
export function renameUser(user, name) {
  const clean = String(name ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return { error: "Enter a name.", status: 400 };
  if (clean.length > USER_NAME_MAX) return { error: `Keep your name under ${USER_NAME_MAX} characters.`, status: 400 };
  if (clean.toLowerCase().replace(/[^a-z]/g, "").includes("manacinema")) return { error: "That name is kept for MANA CINEMA's own replies. Pick another.", status: 400 };
  db.prepare("UPDATE users SET name = ? WHERE id = ?").run(clean, user.id);
  return { user: userOut(db.prepare("SELECT * FROM users WHERE id = ?").get(user.id)) };
}

// Everything kept about the account, as one file
export function exportUser(user) {
  const key = viewerKey(user.id);
  return {
    app: "mana-cinema", exportedAt: nowISO(),
    account: { ...userOut(user), lastSeen: user.last_seen_at, privacyNoticeAgreed: user.notice || null },
    ratings: db.prepare("SELECT movie_id AS movieId, stars, body AS text, hidden, created_at AS at FROM audience_reviews WHERE reviewer = ? ORDER BY created_at").all(key),
    comments: db.prepare("SELECT id, movie_id AS movieId, parent_id AS parentId, body AS text, created_at AS at, edited_at AS editedAt FROM comments WHERE author = ? ORDER BY created_at").all(key),
    likes: db.prepare("SELECT comment_id AS commentId, vote FROM comment_votes WHERE voter = ?").all(key),
    signedInDevices: db.prepare("SELECT created_at AS since, last_seen_at AS lastSeen FROM user_sessions WHERE user_id = ?").all(user.id),
  };
}

// Deletes the account and everything it posted (ratings, comments and their replies, likes)
export function deleteUser(user) {
  const key = viewerKey(user.id);
  tx(() => {
    db.prepare("DELETE FROM audience_reviews WHERE reviewer = ?").run(key);
    db.prepare("DELETE FROM comments WHERE author = ?").run(key);
    db.prepare("DELETE FROM comment_votes WHERE voter = ?").run(key);
    if (user.email_key) db.prepare("DELETE FROM sign_in_codes WHERE email_hash = ?").run(keyed(`email:${user.email_key}`));
    db.prepare("DELETE FROM users WHERE id = ?").run(user.id);   // sessions go with it
  });
}

// ---------- Admin ----------
export function allUsers() {
  return db.prepare(`
    SELECT u.*, (SELECT COUNT(*) FROM audience_reviews r WHERE r.reviewer = 'u:' || u.id) AS ratings,
      (SELECT COUNT(*) FROM comments c WHERE c.author = 'u:' || u.id) AS comments
    FROM users u ORDER BY u.created_at DESC
  `).all().map(u => ({ ...userOut(u), lastSeen: u.last_seen_at, ratings: u.ratings, comments: u.comments, blocked: Boolean(u.blocked) }));
}

// Blocking hides everything the user posted and stops them posting (they stay signed in, so signing in again
// doesn't get round it); unblocking shows their posts again
export function setBlocked(id, blocked) {
  const u = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!u) return { error: "That account was deleted.", status: 404 };
  const key = viewerKey(id);
  tx(() => {
    db.prepare("UPDATE users SET blocked = ? WHERE id = ?").run(Number(blocked), id);
    db.prepare("UPDATE audience_reviews SET hidden = ? WHERE reviewer = ?").run(Number(blocked), key);
    db.prepare("UPDATE comments SET hidden = ? WHERE author = ?").run(Number(blocked), key);
  });
  return { user: allUsers().find(x => x.id === id) };
}
