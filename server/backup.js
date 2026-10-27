// npm run backup: a safe copy of the database while the site keeps running.
//
// Uses SQLite's online backup (a plain file copy can catch the database halfway through a write), checks the
// copy, and keeps the newest BACKUP_KEEP copies (default 14) in BACKUP_DIR (default data/backups).
// On the server, deploy/mana-cinema-backup.timer runs this every night. Copy the backups OFF the server too
// (see docs/deploy-oracle.md): if the server is lost, its disk goes with it.
import "./env.js";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync, backup } from "node:sqlite";
import { DB_FILE, ROOT, DATA_DIR } from "./db.js";

const dir = process.env.BACKUP_DIR ? path.resolve(ROOT, process.env.BACKUP_DIR) : path.join(DATA_DIR, "backups");
const keep = Math.max(1, Number(process.env.BACKUP_KEEP) || 14);
fs.mkdirSync(dir, { recursive: true });

// mana-cinema-2026-10-27-0230.db (India time, so the names match the site's dates)
const stamp = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
  .format(new Date()).replace(", ", "-").replace(":", "");
const target = path.join(dir, `mana-cinema-${stamp}.db`);
const part = `${target}.part`;

const source = new DatabaseSync(DB_FILE, { readOnly: true });
try {
  await backup(source, part);
} finally {
  source.close();
}

// Make the copy one self-contained file (the backup keeps the source's WAL mode, which would leave its
// newest pages in a separate -wal file), then it must pass SQLite's own check before it counts
const copy = new DatabaseSync(part);
copy.exec("PRAGMA journal_mode = DELETE");
const result = copy.prepare("PRAGMA integrity_check").get();
const counts = {
  films: copy.prepare("SELECT COUNT(*) AS n FROM movies").get().n,
  ratings: copy.prepare("SELECT COUNT(*) AS n FROM audience_reviews").get().n,
  accounts: copy.prepare("SELECT COUNT(*) AS n FROM users").get().n,
};
copy.close();
const leftovers = [`${part}-wal`, `${part}-shm`];
if (Object.values(result)[0] !== "ok" || leftovers.some(f => fs.existsSync(f) && fs.statSync(f).size > 0)) {
  for (const f of [part, ...leftovers]) fs.rmSync(f, { force: true });
  console.error(`Backup failed its check: ${JSON.stringify(result)}`);
  process.exit(1);
}
for (const f of leftovers) fs.rmSync(f, { force: true });
fs.renameSync(part, target);

// Keep the newest copies only
const old = fs.readdirSync(dir).filter(f => /^mana-cinema-\d{4}-\d{2}-\d{2}-\d{4}\.db$/.test(f)).sort().slice(0, -keep);
for (const f of old) fs.rmSync(path.join(dir, f));

const mb = (fs.statSync(target).size / 1048576).toFixed(1);
console.log(`Backed up to ${target} (${mb} MB: ${counts.films} films, ${counts.ratings} ratings, ${counts.accounts} accounts).${old.length ? ` Removed ${old.length} old cop${old.length === 1 ? "y" : "ies"}.` : ""}`);
