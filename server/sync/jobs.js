// Runs the sync tasks one at a time, records each run in sync_runs, and reports progress to the admin portal.
import { db, nowISO } from "../db.js";
import { config } from "../env.js";
import { matchIds, syncRatings, syncCredits } from "./imdb.js";
import { syncTmdb } from "./tmdb.js";
import { syncTrailers } from "./youtube.js";

export const TASKS = {
  match: {
    label: "Match films to IMDb", source: "IMDb",
    about: "Finds each film's IMDb ID from IMDb's title list by title, year and runtime. Downloads about 230 MB.",
    run: matchIds,
  },
  tmdb: {
    label: "Full cast and crew from TMDB", source: "TMDB", key: "TMDB_API_KEY",
    about: "Every actor with their role and the whole crew, plus IMDb IDs the match missed. Needs a free TMDB key.",
    run: syncTmdb,
  },
  ratings: {
    label: "IMDb ratings", source: "IMDb",
    about: "Rating and votes for every matched film, from IMDb's daily ratings file (about 9 MB). Runs by itself once a day.",
    run: syncRatings,
  },
  credits: {
    label: "Cast and crew from IMDb", source: "IMDb",
    about: "IMDb's principal cast and crew (actors, director, writers, music, camera, editor) for films without TMDB's list. Downloads about 1.1 GB.",
    run: syncCredits,
  },
  youtube: {
    label: "YouTube trailers", source: "YouTube", key: "YOUTUBE_API_KEY",
    about: "Finds each film's trailer and keeps its views and likes up to date. Needs a free YouTube Data API key.",
    run: syncTrailers,
  },
};
export const TASK_IDS = Object.keys(TASKS);   // also the order "all" runs them in
const keySet = id => (id === "tmdb" ? Boolean(config.tmdbKey) : id === "youtube" ? Boolean(config.youtubeKey) : true);

// Runs tasks in order. log(line) gets progress; returns [{ task, ok, summary }]
export async function runTasks(tasks, { movieIds = null, refresh = false, log = () => {} } = {}) {
  const list = tasks.includes("all") ? TASK_IDS.filter(keySet) : TASK_IDS.filter(t => tasks.includes(t));
  const results = [];
  for (const task of list) {
    const run = db.prepare("INSERT INTO sync_runs (task, started_at) VALUES (?, ?)").run(task, nowISO());
    log(`${TASKS[task].label}...`);
    let ok = true, summary;
    try {
      summary = await TASKS[task].run({ log, movieIds, refresh });
    } catch (err) {
      ok = false;
      summary = err?.message || String(err);
    }
    db.prepare("UPDATE sync_runs SET finished_at = ?, ok = ?, summary = ? WHERE id = ?").run(nowISO(), Number(ok), summary, Number(run.lastInsertRowid));
    log(`${ok ? "Done" : "Failed"}: ${summary}`);
    results.push({ task, ok, summary });
  }
  return results;
}

// ---------- The one job the server runs at a time ----------
let job = null;

export function startSync({ tasks, movieIds = null, refresh = false }) {
  if (job && !job.done) throw new Error("A sync is already running. Wait for it to finish.");
  job = { tasks, startedAt: nowISO(), done: false, ok: null, log: [], results: [] };
  const current = job;
  const log = line => {
    current.log.push(`${new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false })}  ${line}`);
    if (current.log.length > 300) current.log.splice(0, current.log.length - 300);
  };
  runTasks(tasks, { movieIds, refresh, log })
    .then(results => { current.results = results; current.ok = results.every(r => r.ok); })
    .catch(err => { current.ok = false; log(`Failed: ${err.message}`); })
    .finally(() => { current.done = true; current.finishedAt = nowISO(); });
  return current;
}

export const syncRunning = () => Boolean(job && !job.done);

export function syncStatus() {
  const last = new Map(db.prepare(`
    SELECT task, finished_at, ok, summary FROM sync_runs r
    WHERE id = (SELECT MAX(id) FROM sync_runs WHERE task = r.task AND finished_at IS NOT NULL)
  `).all().map(r => [r.task, { finishedAt: r.finished_at, ok: Boolean(r.ok), summary: r.summary }]));
  const count = sql => db.prepare(sql).get().n;
  return {
    tasks: TASK_IDS.map(id => ({ id, label: TASKS[id].label, about: TASKS[id].about, source: TASKS[id].source, key: TASKS[id].key || null, keySet: keySet(id), lastRun: last.get(id) || null })),
    stats: {
      films: count("SELECT COUNT(*) AS n FROM movies"),
      imdbIds: count("SELECT COUNT(*) AS n FROM movies WHERE imdb_id IS NOT NULL"),
      imdbRatings: count("SELECT COUNT(*) AS n FROM imdb_ratings WHERE source = 'imdb'"),
      withCredits: count("SELECT COUNT(DISTINCT movie_id) AS n FROM credits"),
      people: count("SELECT COUNT(*) AS n FROM people"),
      trailers: count("SELECT COUNT(*) AS n FROM trailers"),
    },
    job: job && { tasks: job.tasks, startedAt: job.startedAt, finishedAt: job.finishedAt || null, done: job.done, ok: job.ok, log: job.log.slice(-80), results: job.results },
  };
}

// Once a day, refresh IMDb ratings (a 9 MB file) for every matched film. AUTO_SYNC_RATINGS=false turns it off.
export function scheduleDailyRatings(log = console.log) {
  if (!config.autoSyncRatings) return;
  const check = () => {
    if (syncRunning()) return;
    const hasIds = db.prepare("SELECT 1 FROM movies WHERE imdb_id IS NOT NULL LIMIT 1").get();
    const last = db.prepare("SELECT MAX(finished_at) AS at FROM sync_runs WHERE task = 'ratings' AND ok = 1").get().at;
    if (!hasIds || (last && Date.now() - Date.parse(last) < 22 * 3600e3)) return;
    log("Refreshing IMDb ratings (daily)...");
    startSync({ tasks: ["ratings"] });
  };
  setTimeout(check, 30e3).unref();
  setInterval(check, 3600e3).unref();
}
