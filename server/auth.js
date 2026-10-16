// Admin sign-in (a password from .env and a session cookie) and anonymous visitor ids for audience ratings.
import crypto from "node:crypto";
import { db, nowISO } from "./db.js";
import { config } from "./env.js";

export const sha256 = text => crypto.createHash("sha256").update(String(text)).digest("hex");

export function readCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i < 1) continue;
    try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch {}
  }
  return out;
}

// ---------- Admin ----------
const ADMIN_COOKIE = "mana_admin";
const SESSION_MS = 12 * 3600e3;   // a sign-in lasts 12 hours

// Compares hashes of equal length in constant time, so the password can't be guessed one letter at a time
export function passwordMatches(input) {
  if (!config.adminPassword || typeof input !== "string") return false;
  const a = crypto.createHash("sha256").update(input).digest();
  const b = crypto.createHash("sha256").update(config.adminPassword).digest();
  return crypto.timingSafeEqual(a, b);
}

export function startSession(req, res) {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = Date.now();
  db.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?").run(nowISO());
  db.prepare("INSERT INTO admin_sessions (token_hash, created_at, expires_at) VALUES (?, ?, ?)")
    .run(sha256(token), new Date(now).toISOString(), new Date(now + SESSION_MS).toISOString());
  res.cookie(ADMIN_COOKIE, token, { httpOnly: true, sameSite: "strict", secure: req.secure, path: "/api", maxAge: SESSION_MS });
}

export function endSession(req, res) {
  const token = readCookies(req)[ADMIN_COOKIE];
  if (token) db.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").run(sha256(token));
  res.clearCookie(ADMIN_COOKIE, { httpOnly: true, sameSite: "strict", secure: req.secure, path: "/api" });
}

export function isAdmin(req) {
  const token = readCookies(req)[ADMIN_COOKIE];
  if (!token) return false;
  return Boolean(db.prepare("SELECT 1 FROM admin_sessions WHERE token_hash = ? AND expires_at > ?").get(sha256(token), nowISO()));
}

export function requireAdmin(req, res, next) {
  if (isAdmin(req)) return next();
  res.status(401).json({ error: "Your sign-in has expired. Sign in again." });
}

// ---------- Visitors ----------
// An anonymous cookie, set only when someone posts a rating, so each visitor has one rating per film.
// The database stores a hash of it, never the cookie itself.
const VISITOR_COOKIE = "mana_visitor";
const visitorHash = token => sha256(`visitor:${token}`);

export function reviewerFrom(req) {
  const token = readCookies(req)[VISITOR_COOKIE];
  return token && /^[\w-]{20,64}$/.test(token) ? visitorHash(token) : null;
}

export function ensureVisitor(req, res) {
  const known = reviewerFrom(req);
  if (known) return known;
  const token = crypto.randomBytes(24).toString("base64url");
  res.cookie(VISITOR_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: req.secure, path: "/", maxAge: 400 * 864e5 });
  return visitorHash(token);
}
