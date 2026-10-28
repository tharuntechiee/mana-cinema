// npm run people: fetches the TMDB profile of every home page cover star (js/cover-stars.js) and saves them
// in server/people-seed.json, the copy their pages use until the server has fetched its own (server/people.js).
// Needs TMDB_API_KEY in .env. Run it again to bring the bundled copies up to date, then commit the file.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./db.js";
import { config } from "./env.js";
import { fetchProfile } from "./people.js";

if (!config.tmdbKey) {
  console.error("Add TMDB_API_KEY to .env first.");
  process.exit(1);
}
const stars = fs.readFileSync(path.join(ROOT, "js", "cover-stars.js"), "utf8");
const ids = [...stars.matchAll(/\btmdb:\s*(\d+)/g)].map(m => Number(m[1]));
const out = {};
for (const id of ids) {
  const p = await fetchProfile(id);
  if (!p) { console.warn(`TMDB has no person ${id}`); continue; }
  out[id] = p;
  console.log(`${p.name}: ${p.films.length} films`);
}
const file = path.join(ROOT, "server", "people-seed.json");
fs.writeFileSync(file, JSON.stringify(out) + "\n");
console.log(`Saved ${Object.keys(out).length} profiles to ${path.relative(ROOT, file)}`);
