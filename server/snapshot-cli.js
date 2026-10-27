// Database copies in Turso, by hand (snapshot.js does it automatically on the live server).
//
//   npm run turso:push   upload THIS computer's database as the newest copy: the live site uses it the next
//                        time it starts. Use it once before the first deploy, so the site starts with your
//                        films, posters and edits. Careful later: it replaces what the live site has saved.
//   npm run turso:list   the saved copies
//
// Needs TURSO_DATABASE_URL and TURSO_AUTH_TOKEN (in .env, or set for one command).
import "./env.js";
import { snapshotsOn, upload, listSnapshots, closeSnapshots } from "./snapshot.js";
import { DB_FILE } from "./paths.js";

const what = process.argv[2];
if (!snapshotsOn()) {
  console.error("Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN first (see docs/deploy-render.md).");
  process.exit(1);
}
try {
  if (what === "push") {
    const { db } = await import("./db.js");
    const bytes = await upload(db, DB_FILE);
    db.close();
    console.log(`Uploaded ${DB_FILE} to Turso (${(bytes / 1024).toFixed(0)} KB compressed). The live site uses it when it next starts.`);
  } else if (what === "list") {
    const rows = await listSnapshots();
    if (!rows.length) console.log("No copies saved yet.");
    for (const r of rows) console.log(`${r.created_at}  ${(Number(r.bytes) / 1024).toFixed(0)} KB in ${r.chunks} chunk(s)`);
  } else {
    console.error("Use: npm run turso:push   or   npm run turso:list");
    process.exitCode = 1;
  }
} finally {
  await closeSnapshots();
}
