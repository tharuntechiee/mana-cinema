// Fills the database from the website's own catalogue (js/films-india.js + js/data.js), so the
// researched films stay in one place. Runs on every start: an empty database gets every film, and
// when the catalogue grows (CATALOG_VERSION in js/data.js) the new films are added, like the
// browser-only version did. Films the admin edited or deleted are left alone.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { db, ROOT, tx, getMeta, setMeta, writeFilm } from "./db.js";

// Runs the two browser scripts in a sandbox (no window or localStorage: their storage code is wrapped in try/catch)
export function loadCatalogue() {
  const read = file => fs.readFileSync(path.join(ROOT, "js", file), "utf8");
  const code = `${read("films-india.js")}\n${read("data.js")}\n;__out.movies = DEFAULT_MOVIES; __out.catalog = CATALOG_VERSION; __out.version = DATA_VERSION;`;
  const sandbox = { __out: {}, console: { log() {}, warn() {}, error() {} } };
  vm.runInNewContext(code, sandbox, { filename: "catalogue.js", timeout: 5000 });
  const { movies, catalog, version } = sandbox.__out;
  if (!Array.isArray(movies) || !movies.length) throw new Error("Couldn't read the film catalogue from js/data.js.");
  return { movies: JSON.parse(JSON.stringify(movies)), catalog: Number(catalog) || 0, version: Number(version) || 0 };
}

export function ensureSeeded({ log = console.log } = {}) {
  const { movies, catalog } = loadCatalogue();
  const count = db.prepare("SELECT COUNT(*) AS n FROM movies").get().n;
  if (count === 0 && getMeta("catalog_version") === null) {
    tx(() => {
      for (const m of movies) writeFilm(m, { origin: "seed" });
      setMeta("catalog_version", catalog);
      setMeta("seeded_at", new Date().toISOString());
    });
    log(`Database created with ${movies.length} films from the catalogue.`);
    return;
  }
  // The catalogue grew: add its new films (ids 1001+, as js/data.js does for saved browser copies)
  if (Number(getMeta("catalog_version")) < catalog) {
    const have = new Set(db.prepare("SELECT id FROM movies").all().map(r => r.id));
    const missing = movies.filter(m => m.id > 1000 && !have.has(m.id));
    tx(() => {
      for (const m of missing) writeFilm(m, { origin: "seed" });
      setMeta("catalog_version", catalog);
    });
    if (missing.length) log(`Added ${missing.length} new films from the catalogue.`);
  }
}

// "Restore original films and collections": every catalogue film back as researched, films the admin
// added removed. IMDb IDs, IMDb ratings, cast and crew, and trailers found by a sync are kept.
export function resetFilms() {
  const { movies, catalog } = loadCatalogue();
  const ids = movies.map(m => m.id);
  tx(() => {
    db.prepare(`DELETE FROM movies WHERE id NOT IN (${ids.map(() => "?").join(",")})`).run(...ids);
    db.exec("DELETE FROM people WHERE id NOT IN (SELECT person_id FROM credits)");
    for (const m of movies) writeFilm(m, { origin: "seed" });
    setMeta("catalog_version", catalog);
  });
  return movies.length;
}
