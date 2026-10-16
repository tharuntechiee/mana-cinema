// npm run sync                      everything available (match, tmdb, ratings, credits, youtube)
// npm run sync -- ratings           only some tasks: match | tmdb | ratings | credits | youtube
// npm run sync -- credits --film 10 one film (by its id), or several: --film 10,1,2
// npm run sync -- credits --refresh load again even where cast and crew are already saved
import "../env.js";
import { runTasks, TASK_IDS } from "./jobs.js";
import { ensureSeeded } from "../seed.js";

const args = process.argv.slice(2);
const filmArg = args.indexOf("--film");
const movieIds = filmArg >= 0 ? String(args[filmArg + 1] || "").split(",").map(Number).filter(Number.isInteger) : null;
const refresh = args.includes("--refresh");
const tasks = args.filter((a, i) => !a.startsWith("--") && (filmArg < 0 || i !== filmArg + 1));
const unknown = tasks.filter(t => t !== "all" && !TASK_IDS.includes(t));
if (unknown.length) {
  console.error(`Unknown task: ${unknown.join(", ")}. Pick from: ${TASK_IDS.join(", ")} (or nothing for all).`);
  process.exit(1);
}

ensureSeeded();
const started = Date.now();
const results = await runTasks(tasks.length ? tasks : ["all"], { movieIds, refresh, log: line => console.log(line) });
console.log(`\nFinished in ${Math.round((Date.now() - started) / 1000)}s.`);
process.exit(results.every(r => r.ok) ? 0 : 1);
