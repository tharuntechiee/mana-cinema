// Loads settings from the project's .env file (see .env.example) before anything else reads them.
// Values already set in the environment win, so a host's dashboard settings override the file.
import fs from "node:fs";
import path from "node:path";
import dns from "node:dns";

// This network has no working IPv6 route to TMDB's image server: try IPv4 addresses first
dns.setDefaultResultOrder("ipv4first");

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
  // Viewers' sign-in (see .env.example)
  authSecret: (process.env.AUTH_SECRET || "").trim(),
  googleClientId: (process.env.GOOGLE_CLIENT_ID || "").trim(),
  googleJwksUrl: process.env.GOOGLE_JWKS_URL || "https://www.googleapis.com/oauth2/v3/certs",
  // Email codes: "smtp" (your own mail account, e.g. Gmail with an app password) or "console" (testing)
  emailSender: (process.env.EMAIL_SENDER || "").trim().toLowerCase(),
  smtp: {
    host: (process.env.SMTP_HOST || "smtp.gmail.com").trim(),
    port: Number(process.env.SMTP_PORT) || 465,
    user: (process.env.SMTP_USER || "").trim(),
    pass: (process.env.SMTP_PASS || "").replace(/\s/g, ""),   // Gmail shows app passwords in groups of 4
  },
  mailFrom: (process.env.MAIL_FROM || "").trim(),
  codesDailyLimit: Math.max(0, Number(process.env.CODES_DAILY_LIMIT ?? 400) || 0),
};
