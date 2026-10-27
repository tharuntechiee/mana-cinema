// MANA CINEMA server. npm start, then open http://localhost:8080
import { config } from "./env.js";
import { DB_FILE } from "./paths.js";
import { restoreSnapshot, startAutoSave } from "./snapshot.js";

// On a host with a wiped disk (Render free), put the saved database copy in place before anything opens it
try {
  await restoreSnapshot(DB_FILE);
} catch (err) {
  console.error(`Couldn't restore the database copy from Turso: ${err.message}`);
  process.exit(1);   // starting empty would overwrite the saved copy with an empty one
}

const { db } = await import("./db.js");
const { ensureSeeded } = await import("./seed.js");
const { createApp } = await import("./app.js");
const { scheduleDailyRatings } = await import("./sync/jobs.js");

ensureSeeded();
const autoSave = startAutoSave(db, DB_FILE);
const server = createApp().listen(config.port, config.host, () => {
  console.log(`MANA CINEMA is running at http://${config.host || "localhost"}:${config.port}`);
  console.log(`Database: ${DB_FILE}`);
  if (!config.adminPassword) console.log("Admin sign-in is off: set ADMIN_PASSWORD in .env (see .env.example) and restart.");
  console.log(`TMDB key ${config.tmdbKey ? "found" : "not set"}. YouTube key ${config.youtubeKey ? "found" : "not set"}.`);
});
server.on("error", err => {
  console.error(err.code === "EADDRINUSE" ? `Port ${config.port} is busy. Close the other server or set PORT in .env.` : err);
  process.exit(1);
});
scheduleDailyRatings();

// On stop or restart (Ctrl+C, systemctl restart, Render's SIGTERM): finish the requests in flight, save the
// last database copy, then close the database cleanly. Render allows 30 seconds.
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    setTimeout(() => process.exit(0), 25e3).unref();   // a stuck connection or upload can't hold up a restart
    const closed = new Promise(resolve => server.close(resolve));
    server.closeIdleConnections();
    Promise.race([closed, new Promise(r => setTimeout(r, 5e3))])   // requests in flight get 5 seconds
      .then(() => autoSave.saveNow())
      .finally(() => { db.close(); process.exit(0); });
  });
}
