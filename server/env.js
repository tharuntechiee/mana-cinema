// Loads settings from the project's .env file (see .env.example) before anything else reads them.
// Values already set in the environment win, so a host's dashboard settings override the file.
import fs from "node:fs";
import path from "node:path";

const file = path.resolve(import.meta.dirname, "..", ".env");
if (fs.existsSync(file)) process.loadEnvFile(file);

export const config = {
  port: Number(process.env.PORT) || 8080,
  adminPassword: process.env.ADMIN_PASSWORD || "",
  tmdbKey: (process.env.TMDB_API_KEY || "").trim(),
  youtubeKey: (process.env.YOUTUBE_API_KEY || "").trim(),
  youtubeSearchLimit: Math.max(0, Number(process.env.YOUTUBE_SEARCH_LIMIT ?? 40) || 0),
  autoSyncRatings: process.env.AUTO_SYNC_RATINGS !== "false",
  trustProxy: process.env.TRUST_PROXY || "",
};
