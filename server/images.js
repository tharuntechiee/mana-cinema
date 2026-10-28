// GET /img/:size/:file — film posters and people's photos, fetched from TMDB's image server the first time
// they're asked for, saved to disk, and served from disk after that. Visitors only ever contact this site.
//
// Only files the database allows can be served: approved film images (movie_images), the profile
// photos of credited people, and the photos and film posters on people's pages and in search. Anything else is a 404 with no request to TMDB, so this can't be used as an
// open proxy. Sizes are limited to what each kind needs; "original" (up to 2 MB) is never allowed.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { db, DATA_DIR, ROOT, currentFilmsVersion } from "./db.js";
import { personImage } from "./people.js";

const CACHE_DIR = process.env.IMAGE_CACHE_DIR ? path.resolve(ROOT, process.env.IMAGE_CACHE_DIR) : path.join(DATA_DIR, "cache", "img");
const UPSTREAM = (process.env.IMAGE_UPSTREAM || "https://image.tmdb.org/t/p").replace(/\/$/, "");
const TIMEOUT_MS = Number(process.env.IMAGE_TIMEOUT_MS) || 8000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_PARALLEL = 6;
const NAME = /^[A-Za-z0-9]{8,64}\.(jpg|png)$/;
const SIZES = {
  poster: ["w92", "w185", "w342", "w500", "w780"],
  backdrop: ["w300", "w780", "w1280"],
  logo: ["w92", "w185", "w300", "w500"],
  profile: ["w45", "w185", "h632"],
};
const TYPES = { "image/webp": ".webp", "image/jpeg": ".jpg", "image/png": ".png" };

// The allowed files, rebuilt only after the database changes
let allow = { key: "", files: new Map() };
function allowed() {
  const key = `${currentFilmsVersion()}:${db.prepare("PRAGMA data_version").get().data_version}`;
  if (allow.key === key) return allow.files;
  const files = new Map();
  for (const r of db.prepare("SELECT DISTINCT photo FROM people WHERE photo IS NOT NULL").all()) files.set(r.photo.replace(/^\//, ""), "profile");
  for (const r of db.prepare("SELECT file_path, kind FROM movie_images WHERE status = 'approved' AND gone_at IS NULL").all()) files.set(r.file_path, r.kind);
  allow = { key, files };
  return files;
}

// One download at a time per file, at most MAX_PARALLEL at once; after 5 failures in a row, pause 60 s
const inflight = new Map();
let running = 0;
const waiting = [];
let failures = 0, pausedUntil = 0;
const slot = () => (running < MAX_PARALLEL ? Promise.resolve(running++) : new Promise(r => waiting.push(r)).then(() => running++));
const release = () => { running--; waiting.shift()?.(); };

function cached(size, name) {
  const base = path.join(CACHE_DIR, size, name);
  for (const ext of Object.values(TYPES)) {
    const file = base + ext;
    if (fs.existsSync(file)) return { file, type: Object.keys(TYPES).find(t => TYPES[t] === ext) };
  }
  return null;
}

async function download(size, name) {
  if (Date.now() < pausedUntil) throw Object.assign(new Error("TMDB image server is failing; paused"), { status: 502 });
  await slot();
  try {
    const res = await fetch(`${UPSTREAM}/${size}/${name}`, {
      headers: { Accept: "image/webp,image/*;q=0.8", "User-Agent": "MANA-CINEMA/2.0" },
      redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 404) throw Object.assign(new Error("not on TMDB"), { status: 404 });
    const type = String(res.headers.get("content-type") || "").split(";")[0].trim();
    if (!res.ok || !TYPES[type]) throw Object.assign(new Error(`TMDB answered ${res.status} ${type}`), { status: 502 });
    const chunks = [];
    let bytes = 0;
    for await (const chunk of res.body) {
      bytes += chunk.length;
      if (bytes > MAX_BYTES) throw Object.assign(new Error("image too large"), { status: 502 });
      chunks.push(chunk);
    }
    if (!allowed().has(name) && !personImage(name)) throw Object.assign(new Error("hidden while downloading"), { status: 404 });
    const dir = path.join(CACHE_DIR, size);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, name + TYPES[type]);
    const part = `${file}.${crypto.randomBytes(4).toString("hex")}.part`;
    const body = Buffer.concat(chunks);
    try {
      fs.writeFileSync(part, body);
      fs.renameSync(part, file);
    } catch {   // disk full or read-only: still serve this one
      try { fs.rmSync(part, { force: true }); } catch {}
      failures = 0;
      return { body, type };
    }
    failures = 0;
    return { file, type };
  } catch (err) {
    if (err.status !== 404 && ++failures >= 5) { pausedUntil = Date.now() + 60e3; failures = 0; }
    throw err.status ? err : Object.assign(err, { status: 502 });
  } finally {
    release();
  }
}

export async function imageRoute(req, res) {
  const { size, file: name } = req.params;
  // Else a person's photo or one of their films' posters, on their page or in search (server/people.js)
  const kind = NAME.test(name || "") ? allowed().get(name) || personImage(name) : null;
  if (!kind || !SIZES[kind].includes(size)) return res.status(404).set("Cache-Control", "no-store").type("text").send("Not found");
  try {
    let hit = cached(size, name);
    if (!hit) {
      const key = `${size}/${name}`;
      if (!inflight.has(key)) inflight.set(key, download(size, name).finally(() => inflight.delete(key)));
      hit = await inflight.get(key);
    }
    res.set({ "Cache-Control": "public, max-age=2592000", "Content-Type": hit.type, "X-Content-Type-Options": "nosniff" });
    if (hit.body) return res.send(hit.body);
    return res.sendFile(hit.file, err => { if (err && !res.headersSent) res.status(502).set("Cache-Control", "no-store").end(); });
  } catch (err) {
    res.status(err.status === 404 ? 404 : 502).set("Cache-Control", "no-store").type("text").send(err.status === 404 ? "Not found" : "Image unavailable");
  }
}
