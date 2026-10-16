// Checks for data coming in through the API. Each returns "" when fine, or a message for the admin or visitor.
// The pages loop over these lists, so one wrong type would stop every page that shows films.

const isRecord = x => Boolean(x) && typeof x === "object" && !Array.isArray(x);
const isList = (x, each = () => true) => x === undefined || x === null || (Array.isArray(x) && x.every(each));
const isText = (x, max) => x === undefined || x === null || (typeof x === "string" && x.length <= max);
const finite = x => typeof x === "number" && Number.isFinite(x);

export const IMDB_TITLE = /^tt\d{7,10}$/;
export const YOUTUBE_VIDEO = /^[\w-]{11}$/;

export function filmProblem(f) {
  if (!isRecord(f)) return "A film must be an object.";
  if (!(Number.isInteger(f.id) && f.id > 0)) return "A film needs an id: a whole number from 1 up.";
  if (typeof f.title !== "string" || !f.title.trim() || f.title.length > 200) return "A film needs a title (up to 200 characters).";
  if (JSON.stringify(f).length > 400_000) return `${f.title} is too large to save.`;
  if (!isText(f.lang, 40)) return `${f.title}: the language must be text.`;
  if (f.release !== undefined && f.release !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(String(f.release))) return `${f.title}: the release date must look like 2026-10-16.`;
  if (f.year !== undefined && f.year !== null && !(Number.isInteger(f.year) && f.year >= 1900 && f.year <= 2100)) return `${f.title}: the year must be between 1900 and 2100.`;
  if (f.imdbId !== undefined && f.imdbId !== "" && !IMDB_TITLE.test(String(f.imdbId))) return `${f.title}: an IMDb ID looks like tt1234567.`;
  if (f.tmdbId !== undefined && f.tmdbId !== null && f.tmdbId !== "" && !(Number.isInteger(Number(f.tmdbId)) && Number(f.tmdbId) > 0)) return `${f.title}: a TMDB ID is a whole number.`;
  if (f.trailer !== undefined && f.trailer !== null && !(isRecord(f.trailer) && YOUTUBE_VIDEO.test(String(f.trailer.videoId || "")))) return `${f.title}: the YouTube trailer must be a video link or an 11-character video ID.`;
  if (!isList(f.languages, x => typeof x === "string") || !isList(f.colors, x => typeof x === "string")) return `${f.title}: languages and colours must be lists of text.`;
  if (f.boxOffice !== undefined && !isRecord(f.boxOffice)) return `${f.title}: the collections are damaged.`;
  const bo = f.boxOffice || {};
  const goodDay = d => isRecord(d) && Number.isInteger(d.day) && d.day >= 0 && d.day <= 2000 && finite(d.net) && d.net >= 0 && isText(d.note, 300);
  if (!isList(bo.days, goodDay)) return `${f.title}: every day-wise figure needs a day number and an India net of 0 or more.`;
  if (new Set((bo.days || []).map(d => d.day)).size !== (bo.days || []).length) return `${f.title}: the same day is listed twice.`;
  if (!isList(bo.sources, isRecord) || !isList(bo.notes, x => typeof x === "string")) return `${f.title}: the sources or notes are damaged.`;
  if (f.critics !== undefined && !isRecord(f.critics)) return `${f.title}: the ratings are damaged.`;
  const c = f.critics || {};
  if (!isList(c.reviews, r => isRecord(r) && isText(r.outlet, 200) && (r.score === null || r.score === undefined || finite(Number(r.score))))) return `${f.title}: the critics' scores are damaged.`;
  if (c.imdb !== undefined && c.imdb !== null && !isRecord(c.imdb)) return `${f.title}: the IMDb rating is damaged.`;
  return "";
}

// Drops empty optional fields the same way the admin portal does, so "" never reaches the database
export function tidyFilm(f) {
  const out = { ...f };
  for (const k of ["release", "imdbId", "tmdbId"]) if (out[k] === "" || out[k] === null) delete out[k];
  if (out.tmdbId !== undefined) out.tmdbId = Number(out.tmdbId);
  if (out.trailer === null) delete out.trailer;
  delete out.credits;   // a summary the server works out; never saved
  return out;
}

const STARS = s => Number.isInteger(s) && s >= 1 && s <= 5;

export function backupProblem(d, { version }) {
  if (!isRecord(d) || d.app !== "mana-cinema") return "That file isn't a MANA CINEMA backup.";
  if (d.version !== version) return "This backup is from another version of the site, so it can't be restored here.";
  if (!Array.isArray(d.movies) || !Array.isArray(d.reviews) || !Array.isArray(d.messages)) return "The backup is missing its films, reviews or messages.";
  for (const [i, m] of d.movies.entries()) {
    const problem = filmProblem(m);
    if (problem) return `Film ${i + 1} in the backup: ${problem}`;
  }
  if (new Set(d.movies.map(m => m.id)).size !== d.movies.length) return "Two films in the backup share the same id.";
  const imdbIds = d.movies.map(m => m.imdbId).filter(Boolean);
  if (new Set(imdbIds).size !== imdbIds.length) return "Two films in the backup share the same IMDb ID.";
  const badReview = d.reviews.findIndex(r => !isRecord(r) || !Number.isInteger(r.movieId) || !STARS(r.stars)
    || !isText(r.name, 100) || !isText(r.text, 2000) || !isText(r.at, 40));
  if (badReview >= 0) return `Review ${badReview + 1} in the backup is damaged. Each review needs a film number and 1 to 5 stars.`;
  const badMessage = d.messages.findIndex(m => !isRecord(m) || !isText(m.message, 5000) || !isText(m.name, 200));
  if (badMessage >= 0) return `Message ${badMessage + 1} in the backup is damaged.`;
  return "";
}

export const REVIEW_MAX = 500;
export const NAME_MAX = 40;
export function reviewProblem(b) {
  if (!isRecord(b)) return "Send the rating as JSON.";
  if (!STARS(Number(b.stars))) return "Pick 1 to 5 stars.";
  if (typeof (b.text ?? "") !== "string" || String(b.text ?? "").trim().length > REVIEW_MAX) return `Keep your review under ${REVIEW_MAX} characters.`;
  if (typeof (b.name ?? "") !== "string") return "Your name must be text.";
  return "";
}

export function messageProblem(b) {
  if (!isRecord(b)) return "Send the message as JSON.";
  const name = String(b.name ?? "").trim(), message = String(b.message ?? "").trim();
  if (!name || !message) return "Please fill in your name and message.";
  if (name.length > 80) return "Keep your name under 80 characters.";
  if (message.length > 3000) return "Keep your message under 3,000 characters.";
  if (String(b.email ?? "").length > 120 || String(b.topic ?? "").length > 60) return "That email or topic is too long.";
  if (b.movieId !== undefined && b.movieId !== null && !Number.isInteger(Number(b.movieId))) return "That film isn't valid.";
  return "";
}
