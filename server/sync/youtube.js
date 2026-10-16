// YouTube Data API v3: each film's trailer, with its views, likes and comments. Needs a free API key in .env
// (YOUTUBE_API_KEY, from Google Cloud with "YouTube Data API v3" turned on).
// Quota: 10,000 units a day. A search costs 100, so a run searches at most YOUTUBE_SEARCH_LIMIT films
// (default 40) that have no trailer yet; refreshing the views of every saved trailer costs 1 unit per 50.
// The admin can set or correct any film's trailer in the film form; those are never searched again.
import { db, tx, todayIST, filmsChanged } from "../db.js";
import { config } from "../env.js";
import { normTitle } from "./imdb.js";

const API = "https://www.googleapis.com/youtube/v3";

async function youtube(pathname, params) {
  const url = new URL(API + pathname);
  for (const [k, v] of Object.entries({ ...params, key: config.youtubeKey })) url.searchParams.set(k, v);
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = body?.error?.errors?.[0]?.reason || body?.error?.message || res.statusText;
    if (reason === "quotaExceeded") throw new Error("YouTube's daily quota is used up. Try again tomorrow.");
    throw new Error(`YouTube answered ${res.status}: ${reason}`);
  }
  return body;
}

const decode = s => String(s || "").replace(/&amp;/g, "&").replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");

// The first result that names the film and says trailer (else teaser)
function pickTrailer(film, items) {
  const want = normTitle(film.title.split(/[:–—]| - /)[0]);
  const named = items.filter(it => normTitle(decode(it.snippet?.title)).includes(want));
  return named.find(it => /trailer/i.test(it.snippet.title)) || named.find(it => /teaser|glimpse/i.test(it.snippet.title)) || null;
}

export async function syncTrailers({ log, movieIds }) {
  if (!config.youtubeKey) return "Skipped: add YOUTUBE_API_KEY to .env to find trailers on YouTube.";
  // Newest films first: upcoming and recent releases are the ones people look for trailers of
  const missing = db.prepare(`
    SELECT m.id, m.title, m.year, m.lang FROM movies m
    WHERE NOT EXISTS (SELECT 1 FROM trailers t WHERE t.movie_id = m.id)
    ORDER BY m.release_date DESC NULLS LAST, m.year DESC
  `).all().filter(f => !movieIds || movieIds.includes(f.id));
  const searches = movieIds ? missing : missing.slice(0, config.youtubeSearchLimit);
  let found = 0;
  for (const film of searches) {
    const query = `${film.title} ${film.year || ""} official trailer ${film.lang || ""}`.replace(/\s+/g, " ").trim();
    const res = await youtube("/search", { part: "snippet", type: "video", maxResults: "8", q: query, regionCode: "IN" });
    const pick = pickTrailer(film, res.items || []);
    if (!pick) continue;
    db.prepare("INSERT OR IGNORE INTO trailers (movie_id, video_id, title, channel, published_at, source) VALUES (?, ?, ?, ?, ?, 'youtube')")
      .run(film.id, pick.id.videoId, decode(pick.snippet.title), decode(pick.snippet.channelTitle), pick.snippet.publishedAt || null);
    found++;
  }
  if (searches.length) log(`Searched YouTube for ${searches.length} films, found ${found} trailers.`);

  // Views, likes and comments for every saved trailer, 50 at a time
  const saved = db.prepare("SELECT movie_id, video_id FROM trailers").all().filter(t => !movieIds || movieIds.includes(t.movie_id));
  const asOf = todayIST();
  let refreshed = 0;
  for (let i = 0; i < saved.length; i += 50) {
    const batch = saved.slice(i, i + 50);
    const res = await youtube("/videos", { part: "statistics,snippet", id: batch.map(t => t.video_id).join(",") });
    const byId = new Map((res.items || []).map(it => [it.id, it]));
    tx(() => {
      for (const t of batch) {
        const it = byId.get(t.video_id);
        if (!it) continue;   // removed or private: keep the link, the admin can replace it
        const s = it.statistics || {};
        db.prepare(`UPDATE trailers SET title = ?, channel = ?, published_at = ?, views = ?, likes = ?, comments = ?, as_of = ? WHERE movie_id = ?`).run(
          decode(it.snippet?.title) || null, decode(it.snippet?.channelTitle) || null, it.snippet?.publishedAt || null,
          s.viewCount !== undefined ? Number(s.viewCount) : null, s.likeCount !== undefined ? Number(s.likeCount) : null,
          s.commentCount !== undefined ? Number(s.commentCount) : null, asOf, t.movie_id);
        refreshed++;
      }
    });
  }
  filmsChanged();
  const left = movieIds ? 0 : Math.max(0, missing.length - searches.length);
  return `Found ${found} new trailers and updated views for ${refreshed}.${left ? ` ${left} films still to search (YouTube's daily quota allows about ${config.youtubeSearchLimit} a run).` : ""}`;
}
