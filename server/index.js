// MANA CINEMA server. npm start, then open http://localhost:8080
import "./env.js";
import { config } from "./env.js";
import { db, DB_FILE } from "./db.js";
import { ensureSeeded } from "./seed.js";
import { createApp } from "./app.js";
import { scheduleDailyRatings } from "./sync/jobs.js";

ensureSeeded();
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

// On stop or restart (Ctrl+C, systemctl restart): finish the requests in flight, then close the database cleanly
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => { db.close(); process.exit(0); });
    server.closeIdleConnections();
    setTimeout(() => process.exit(0), 10e3).unref();   // a stuck connection can't hold up a restart
  });
}
