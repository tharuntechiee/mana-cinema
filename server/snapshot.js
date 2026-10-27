// Keeps the database safe on hosts whose disk is wiped on every restart (Render's free plan).
//
// The site still runs on its own SQLite file, as on any computer. A copy of that file, compressed and split
// into chunks, is kept in a Turso database (free: 5 GB, no card):
//   - when the server starts, before the database is opened, the newest copy is downloaded (restore)
//   - a few seconds after anything changes (a rating, a comment, an admin edit), a new copy is uploaded
//   - when the host stops the server (SIGTERM), a last copy is uploaded before it exits
// The newest 3 copies are kept. If the server crashed in the seconds between a change and its upload, that
// change would be lost; nothing else is.
//
// Switched on by TURSO_DATABASE_URL and TURSO_AUTH_TOKEN. Without them (your own computer) it does nothing.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { backup, DatabaseSync } from "node:sqlite";

const CHUNK = 512 * 1024;
const KEEP = 3;
const SAVE_AFTER_MS = 5e3;   // after a change, wait this long for more changes, then upload

export const snapshotsOn = () => Boolean(process.env.TURSO_DATABASE_URL);

let clientPromise = null;
async function turso() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const { createClient } = await import("@libsql/client");
      const c = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN || undefined });
      await c.batch([
        "CREATE TABLE IF NOT EXISTS snapshots (id INTEGER PRIMARY KEY, created_at TEXT NOT NULL, bytes INTEGER NOT NULL, sha256 TEXT NOT NULL, chunks INTEGER NOT NULL)",
        "CREATE TABLE IF NOT EXISTS snapshot_chunks (snapshot_id INTEGER NOT NULL, n INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (snapshot_id, n))",
      ], "write");
      return c;
    })().catch(err => { clientPromise = null; throw err; });
  }
  return clientPromise;
}

// The saved copies, newest first
export async function listSnapshots() {
  const c = await turso();
  return (await c.execute("SELECT id, created_at, bytes, chunks FROM snapshots ORDER BY id DESC")).rows;
}

// Closes the connection to Turso (the checks, and a clean exit)
export async function closeSnapshots() {
  const c = clientPromise && (await clientPromise.catch(() => null));
  clientPromise = null;
  c?.close();
}

// Before the database is opened: put the newest saved copy in place. Returns what happened, for the log.
export async function restoreSnapshot(dbFile, log = console.log) {
  if (!snapshotsOn()) return "off";
  const c = await turso();
  const latest = (await c.execute("SELECT * FROM snapshots ORDER BY id DESC LIMIT 1")).rows[0];
  if (!latest) { log("Database copy: none saved yet; starting from the catalogue. The first copy is saved shortly."); return "none"; }
  const rows = (await c.execute({ sql: "SELECT data FROM snapshot_chunks WHERE snapshot_id = ? ORDER BY n", args: [latest.id] })).rows;
  const packed = Buffer.concat(rows.map(r => Buffer.from(r.data)));
  if (rows.length !== Number(latest.chunks) || crypto.createHash("sha256").update(packed).digest("hex") !== latest.sha256) {
    throw new Error(`the saved database copy ${latest.id} is incomplete; refusing to start with it`);
  }
  const file = zlib.gunzipSync(packed);
  for (const f of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) fs.rmSync(f, { force: true });
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  fs.writeFileSync(dbFile, file);
  log(`Database copy: restored the one saved ${latest.created_at} (${(file.length / 1048576).toFixed(1)} MB).`);
  return "restored";
}

// One compressed copy of the live database, uploaded in a single transaction. Resolves to its size in bytes.
export async function upload(db, dbFile) {
  const tmp = `${dbFile}.snapshot`;
  try {
    await backup(db, tmp);
    const copy = new DatabaseSync(tmp);
    copy.exec("PRAGMA journal_mode = DELETE");   // one self-contained file
    copy.close();
    const packed = zlib.gzipSync(fs.readFileSync(tmp), { level: 6 });
    const id = Date.now();
    const parts = [];
    for (let i = 0; i < packed.length; i += CHUNK) parts.push(packed.subarray(i, i + CHUNK));
    const c = await turso();
    await c.batch([
      { sql: "INSERT INTO snapshots (id, created_at, bytes, sha256, chunks) VALUES (?, ?, ?, ?, ?)", args: [id, new Date(id).toISOString(), packed.length, crypto.createHash("sha256").update(packed).digest("hex"), parts.length] },
      ...parts.map((data, n) => ({ sql: "INSERT INTO snapshot_chunks (snapshot_id, n, data) VALUES (?, ?, ?)", args: [id, n, data] })),
      { sql: "DELETE FROM snapshot_chunks WHERE snapshot_id NOT IN (SELECT id FROM snapshots ORDER BY id DESC LIMIT ?)", args: [KEEP] },
      { sql: "DELETE FROM snapshots WHERE id NOT IN (SELECT id FROM snapshots ORDER BY id DESC LIMIT ?)", args: [KEEP] },
    ], "write");
    return packed.length;
  } finally {
    for (const f of [tmp, `${tmp}-wal`, `${tmp}-shm`, `${tmp}-journal`]) fs.rmSync(f, { force: true });
  }
}

// Watches for changes and uploads a copy after each burst of them. Returns { saveNow } for shutdown.
export function startAutoSave(db, dbFile, log = console.log) {
  if (!snapshotsOn()) return { saveNow: async () => {} };
  const changes = () => db.prepare("SELECT total_changes() AS n").get().n;
  let saved = changes(), seen = saved, quietSince = Date.now(), running = null, failures = 0;

  const save = async why => {
    if (running) return running;
    const at = changes();
    running = upload(db, dbFile)
      .then(bytes => { saved = at; failures = 0; log(`Database copy saved (${(bytes / 1024).toFixed(0)} KB, ${why}).`); })
      .catch(err => { failures++; log(`Database copy NOT saved (${why}): ${err.message}`); })
      .finally(() => { running = null; });
    return running;
  };

  // The first copy, when Turso has none yet (a brand-new setup)
  turso().then(c => c.execute("SELECT COUNT(*) AS n FROM snapshots")).then(r => { if (!Number(r.rows[0].n)) save("first copy"); })
    .catch(err => log(`Turso isn't reachable: ${err.message}`));

  const timer = setInterval(() => {
    const now = changes();
    if (now !== seen) { seen = now; quietSince = Date.now(); return; }
    // Changes waiting, quiet for a few seconds (or failing: retry at most once a minute)
    const wait = failures ? Math.min(60e3, SAVE_AFTER_MS * 2 ** failures) : SAVE_AFTER_MS;
    if (seen !== saved && Date.now() - quietSince >= wait) save("after changes");
  }, 1e3);
  timer.unref();

  return {
    // On shutdown: wait for an upload in progress, then upload anything still unsaved
    saveNow: async () => {
      clearInterval(timer);
      if (running) await running;
      if (changes() !== saved) await save("on shutdown");
    },
  };
}
