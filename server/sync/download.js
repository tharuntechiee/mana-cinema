// Streaming downloads for the big IMDb files: read line by line while they download, never all in memory.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { DATA_DIR } from "../db.js";

export const CACHE_DIR = path.join(DATA_DIR, "cache");
const USER_AGENT = "MANA-CINEMA/2.0 (box-office hub; Node.js)";

export async function fetchOk(url, { headers = {}, timeout = 0 } = {}) {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, ...headers },
    signal: timeout ? AbortSignal.timeout(timeout) : undefined,
  });
  if (!res.ok) throw new Error(`${new URL(url).hostname} answered ${res.status} ${res.statusText} for ${new URL(url).pathname}`);
  return res;
}

// A .gz file as decompressed text. cacheHours > 0 keeps a copy in data/cache and reuses it while fresh.
export async function openGzip(url, { cacheHours = 0, log = () => {} } = {}) {
  const name = path.basename(new URL(url).pathname);
  let source;
  if (cacheHours > 0) {
    const file = path.join(CACHE_DIR, name);
    const fresh = fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < cacheHours * 3600e3;
    if (!fresh) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      log(`Downloading ${name}...`);
      const res = await fetchOk(url);
      const tmp = `${file}.part`;
      await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(tmp));
      fs.renameSync(tmp, file);
    } else {
      log(`Using today's copy of ${name}.`);
    }
    source = fs.createReadStream(file);
  } else {
    log(`Reading ${name} from IMDb while it downloads...`);
    source = Readable.fromWeb((await fetchOk(url)).body);
  }
  const gunzip = zlib.createGunzip();
  source.on("error", err => gunzip.destroy(err));
  source.pipe(gunzip);
  gunzip.setEncoding("utf8");
  gunzip.on("close", () => source.destroy());
  return gunzip;
}

// Calls onLine for every line after the header. Returning false from onLine stops early.
export async function scanLines(stream, onLine, { log = () => {}, label = "rows", every = 5_000_000 } = {}) {
  let rest = "", header = true, n = 0, stopped = false;
  try {
    for await (const chunk of stream) {
      const text = rest + chunk;
      let start = 0, i;
      while ((i = text.indexOf("\n", start)) !== -1) {
        const line = text.slice(start, i);
        start = i + 1;
        if (header) { header = false; continue; }
        if (++n % every === 0) log(`  ${(n / 1e6).toFixed(0)} million ${label} read`);
        if (onLine(line) === false) { stopped = true; break; }
      }
      if (stopped) break;
      rest = text.slice(start);
    }
    if (!stopped && rest && !header) onLine(rest);
  } finally {
    stream.destroy();
  }
  return n;
}
