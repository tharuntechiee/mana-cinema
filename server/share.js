// Link previews: the title, description and picture WhatsApp, X, Facebook and search engines show for a
// link. Those crawlers don't run the page's JavaScript, so the server writes the tags into each page as it
// sends it. A film page gets that film's title, summary and poster; other pages get the site card
// (images/og-cover.png); a person's page gets their name, a line about them and their photo.
// Without the server (GitHub Pages) the pages simply have no preview tags.
import fs from "node:fs";
import path from "node:path";
import { ROOT, db, readFilm } from "./db.js";
import { storedProfile } from "./people.js";
import { config } from "./env.js";

const files = new Map();   // name -> { mtime, html }
function pageHTML(name) {
  const file = path.join(ROOT, name);
  const mtime = fs.statSync(file).mtimeMs;
  const hit = files.get(name);
  if (hit?.mtime === mtime) return hit.html;
  const html = fs.readFileSync(file, "utf8");
  files.set(name, { mtime, html });
  return html;
}

const attr = s => String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const between = (html, re) => re.exec(html)?.[1] || "";

// The public address of this request: https://mana-cinema.onrender.com (behind a proxy with TRUST_PROXY set)
const origin = req => `${req.protocol}://${req.get("host")}`;

export function sharePage(name) {
  return (req, res) => {
    let html = pageHTML(name);
    const o = origin(req);
    let title = between(html, /<title>([^<]*)<\/title>/);
    let description = between(html, /<meta name="description" content="([^"]*)"/);
    let image = `${o}/images/og-cover.png`, imageAlt = "MANA CINEMA: Indian box office in every language";
    let url = `${o}/${name === "index.html" ? "" : name}`;
    let type = "website";

    const id = name === "film.html" && /^\d{1,9}$/.test(String(req.query.id || "")) ? Number(req.query.id) : null;
    const film = id ? readFilm(id) : null;
    const tmdbId = name === "person.html" && /^\d{1,9}$/.test(String(req.query.id || "")) ? Number(req.query.id) : null;
    // Credited here or with a saved profile. Anyone else on TMDB gets the site card until their page is first
    // opened (that fetches their profile); without a TMDB key they have no page.
    const known = tmdbId && db.prepare("SELECT name FROM people WHERE tmdb_id = ?").get(tmdbId);
    const saved = tmdbId ? storedProfile(tmdbId).profile : null;
    const person = known || saved ? { name: known?.name, ...saved } : null;
    if (person) {
      title = `${person.name}: Films, Box Office & Biography | MANA CINEMA`;
      const acted = (person.films || []).filter(f => f.acted && f.year).map(f => f.year);
      const career = acted.length ? `${acted.length} films since ${Math.min(...acted)}.` : "";
      description = [`${person.name}'s films, box office and biography on MANA CINEMA.`, career].filter(Boolean).join(" ").slice(0, 200);
      if (/^\/[A-Za-z0-9]{8,64}\.(jpg|png)$/.test(person.photo || "")) { image = `${o}/img/h632${person.photo}`; imageAlt = person.name; }
      url = `${o}/person.html?id=${tmdbId}`;
      type = "profile";
      html = html.replace(/<title>[^<]*<\/title>/, `<title>${attr(title)}</title>`)
        .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${attr(description)}">`);
    }
    if (film) {
      title = `${film.title} Box Office Collection & Ratings | MANA CINEMA`;
      const facts = [film.lang, film.year, film.director && `Directed by ${film.director}`].filter(Boolean).join(" · ");
      description = [film.desc, facts].filter(Boolean).join(" ").slice(0, 200);
      if (/^[A-Za-z0-9]{8,64}\.(jpg|png)$/.test(film.images?.poster || "")) { image = `${o}/img/w500/${film.images.poster}`; imageAlt = `${film.title} poster`; }
      url = `${o}/film.html?id=${film.id}`;
      type = "video.movie";
      html = html.replace(/<title>[^<]*<\/title>/, `<title>${attr(title)}</title>`)
        .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${attr(description)}">`);
    }

    const tags = [
      `<link rel="canonical" href="${attr(url)}">`,
      `<meta property="og:site_name" content="MANA CINEMA">`,
      `<meta property="og:type" content="${type}">`,
      `<meta property="og:title" content="${attr(title)}">`,
      `<meta property="og:description" content="${attr(description)}">`,
      `<meta property="og:url" content="${attr(url)}">`,
      `<meta property="og:image" content="${attr(image)}">`,
      `<meta property="og:image:alt" content="${attr(imageAlt)}">`,
      `<meta name="twitter:card" content="summary_large_image">`,
    ].map(t => `  ${t}\n`).join("");
    html = html.replace("</head>", `${tags}</head>`);
    // A film or person that isn't here is still the page (it says "not found"), with a 404 status
    if ((name === "film.html" && !film) || (name === "person.html" && !person && !(tmdbId && config.tmdbKey))) res.status(404);
    res.set("Cache-Control", "no-cache").type("html").send(html);
  };
}
