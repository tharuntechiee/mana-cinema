// The Express app: the website's pages and assets, the public API and the admin API.
// Only the site's own files are served: never .env, the database, server code or .git.
import "./env.js";
import express from "express";
import compression from "compression";
import path from "node:path";
import { ROOT } from "./db.js";
import { config } from "./env.js";
import { publicApi } from "./routes/public.js";
import { adminApi } from "./routes/admin.js";
import { imageRoute } from "./images.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  if (config.trustProxy) app.set("trust proxy", /^\d+$/.test(config.trustProxy) ? Number(config.trustProxy) : config.trustProxy);
  app.use(compression());

  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    });
    next();
  });

  // ---------- API ----------
  const api = express.Router();
  api.use(express.json({ limit: "15mb" }));   // a full backup is a few MB
  // Changes must come from this site's own pages, not from another website
  api.use((req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const origin = req.get("origin");
    if (origin) {
      let host = "";
      try { host = new URL(origin).host; } catch {}
      if (host !== req.get("host")) return res.status(403).json({ error: "Requests from other websites aren't allowed." });
    }
    next();
  });
  api.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  api.use("/admin", adminApi);
  api.use(publicApi);
  api.use((req, res) => res.status(404).json({ error: "There's no such API address." }));
  api.use((err, req, res, next) => {
    if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "That isn't valid JSON." });
    if (err?.type === "entity.too.large") return res.status(413).json({ error: "That's too large to send." });
    console.error(err);
    res.status(500).json({ error: "Something went wrong on the server. Try again." });
  });
  app.use("/api", api);

  // ---------- Images (posters and people photos from TMDB, cached on disk) ----------
  app.get("/img/:size/:file", imageRoute);

  // ---------- Website ----------
  const PAGES = ["index.html", "film.html", "lists.html", "admin.html"];
  const page = name => (req, res) => res.set("Cache-Control", "no-cache").sendFile(path.join(ROOT, name));
  app.get("/", page("index.html"));
  for (const name of PAGES) app.get(`/${name}`, page(name));
  for (const dir of ["css", "js", "images"]) {
    app.use(`/${dir}`, express.static(path.join(ROOT, dir), { maxAge: "1h", dotfiles: "ignore", index: false, fallthrough: true }));
  }
  app.use((req, res) => res.status(404).type("text").send("Page not found. Go to / for MANA CINEMA."));
  return app;
}
