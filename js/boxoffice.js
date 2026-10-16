// Box office & ratings logic shared by every page (home, film page, admin).
// Loaded after data.js. Pages only read and display what these functions return.
//
// Units and terms (Indian trade conventions):
//   - Money is in ₹ crore (1 crore = 10 million rupees; 1 crore = 100 lakh).
//   - "Net" = India ticket sales after GST. Day-wise figures are India net.
//   - "Gross" includes GST. Worldwide gross = India gross + overseas gross (never India net + overseas).
//   - Day 0 = paid previews / premieres, only when reported separately from Day 1.
//     They count towards the opening day (unless a ranking turns them off), weekend and first week.
//   - Trade weeks run Friday to Thursday. Week 1 runs from release day to the Thursday after
//     the opening weekend, so a Thursday release has an 8-day "extended" first week.
//   - All figures are trade estimates, not audited numbers. Producers' claims are kept apart
//     and never ranked.

// ---------- Dates ----------
// "2024-12-05" -> local midnight. (new Date("2024-12-05") is UTC and can land on the previous day.)
function parseDay(iso) {
  const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return p ? new Date(Number(p[1]), Number(p[2]) - 1, Number(p[3])) : null;
}
function isoDay(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// A film is released once its release date arrives. Films without an exact date are upcoming.
// (status "released" is only a fallback for films saved by older versions without a date.)
function isReleased(m) {
  const r = parseDay(m.release);
  return r ? r <= startOfToday() : m.status === "released";
}
// Whole days from today to release (0 = today), or null without an exact date
function daysUntil(m) {
  const r = parseDay(m.release);
  return r ? Math.round((r - startOfToday()) / 864e5) : null;
}
// One date style everywhere: "25 Sep 2025", "Thu 25 Sep", "Thu 25 Sep 2025".
// Written out by hand because the en-IN locale prints "Sept" and adds commas.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function dayLabel(value, { weekday = false, year = true } = {}) {
  const d = value instanceof Date ? value : parseDay(value);
  if (!d || isNaN(d)) return "";
  return `${weekday ? WEEKDAYS[d.getDay()] + " " : ""}${d.getDate()} ${MONTHS[d.getMonth()]}${year ? " " + d.getFullYear() : ""}`;
}
// "5 Dec 2024", or the release note ("Sankranti 2027") when there is no exact date
function releaseLabel(m, opts = {}) {
  const r = parseDay(m.release);
  return r ? dayLabel(r, opts) : (m.releaseNote || "Date to be announced");
}

// ---------- Day-wise collections ----------
const WEEKEND_DAYS = [5, 6, 0];   // Fri, Sat, Sun: the box-office weekend

function boxOffice(m) {
  return m.boxOffice || {};
}
const boNum = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v))) ? null : Number(v);
const boSum = list => list.reduce((s, v) => s + v, 0);
const boRound1 = v => Math.round(v * 10) / 10;
const boRound2 = v => Math.round(v * 100) / 100;

// Opening weekend length: release day to the first Sunday (Fri 3 days, Thu 4, Wed 5).
// A Mon/Tue release gives 7/6 days: that is a whole first week, so it isn't ranked or used for legs as a weekend.
function weekendLength(release) {
  return ((7 - release.getDay()) % 7) + 1;
}
// Trade week 1: release day to the Thursday after the opening weekend (Fri release 7 days, Thu release 8)
function week1Length(m) {
  const release = parseDay(m.release);
  return release ? weekendLength(release) + 4 : 7;
}
// Trade week number of a day (previews belong to week 1)
function weekOf(m, day) {
  const w1 = week1Length(m);
  return day <= w1 ? 1 : 1 + Math.ceil((day - w1) / 7);
}

// Day rows sorted by day, each with calendar date, trade week, running total and changes.
// Rows without a figure are skipped: missing days stay missing and are never guessed.
// After a missing day the running total is unknown (cum = null), so milestones stop there.
function dayRows(m) {
  const release = parseDay(m.release);
  const previewsDate = parseDay(boxOffice(m).previewsDate);
  const rows = (boxOffice(m).days || [])
    .map(d => ({ day: Number(d.day), net: boNum(d.net), note: d.note || "" }))
    .filter(d => Number.isInteger(d.day) && d.day >= 0 && d.net !== null && d.net >= 0)
    .sort((a, b) => a.day - b.day)
    .filter((d, i, list) => i === 0 || d.day !== list[i - 1].day);   // one figure per day
  const byDay = new Map(rows.map(d => [d.day, d]));
  let cum = 0, nextDay = 1, broken = false;
  return rows.map(d => {
    if (d.day > 0) {
      if (d.day !== nextDay) broken = true;
      nextDay = d.day + 1;
    }
    cum += d.net;
    const date = d.day === 0 ? (previewsDate || (release && addDays(release, -1))) : release && addDays(release, d.day - 1);
    const prev = d.day >= 2 ? byDay.get(d.day - 1) : null;
    const lastWeek = d.day >= 8 ? byDay.get(d.day - 7) : null;
    return {
      ...d,
      date,
      label: d.day === 0 ? "Previews" : `Day ${d.day}`,
      week: d.day === 0 ? 1 : weekOf(m, d.day),
      weekend: Boolean(date && d.day > 0 && WEEKEND_DAYS.includes(date.getDay())),
      cum: broken ? null : boRound2(cum),
      change: prev && prev.net ? (d.net - prev.net) / prev.net : null,                    // vs previous day
      weekChange: lastWeek && lastWeek.net ? (d.net - lastWeek.net) / lastWeek.net : null, // vs same day last week
    };
  });
}

function previewsNet(m) {
  return dayRows(m).find(d => d.day === 0)?.net || 0;
}

// Sum of days from..to (inclusive). Null if any day in the range is missing, so totals are never understated.
function sumDays(m, from, to) {
  const byDay = new Map(dayRows(m).map(d => [d.day, d.net]));
  let total = 0;
  for (let day = from; day <= to; day++) {
    if (!byDay.has(day)) return null;
    total += byDay.get(day);
  }
  return boRound2(total);
}

// Opening day = Day 1, plus paid previews reported separately (Telugu trade style).
// Pass { previews: false } for a like-for-like Day 1.
// Films without day-wise figures (list films) use the reported opening instead:
// boxOffice.opening = { net: Day 1 India net as reported, previews: ₹ Cr or null, includesPreviews: true/false/null }.
function openingDay(m, { previews = true } = {}) {
  const d1 = dayRows(m).find(d => d.day === 1);
  if (d1) return boRound2(d1.net + (previews ? previewsNet(m) : 0));
  const o = boxOffice(m).opening || {};
  const net = boNum(o.net), pre = boNum(o.previews);
  if (net === null) return null;
  if (o.includesPreviews === true) return previews ? net : pre !== null ? boRound2(net - pre) : null;   // can't separate them
  if (o.includesPreviews === false) return previews && pre !== null ? boRound2(net + pre) : net;
  return net;   // not known either way: shown as reported
}
// Day-wise figures exist (charts, weeks, milestones); list films only have totals
function hasDayWise(m) {
  return dayRows(m).some(d => d.day > 0);
}

// ---------- Languages ----------
// Original language of a film (m.lang). Lists and filters follow this order.
const LANGUAGES = ["Hindi", "Telugu", "Tamil", "Malayalam", "Kannada", "Marathi", "Bengali", "Punjabi", "Gujarati"];
// Languages present among the given films, in LANGUAGES order (any others last, A-Z)
function languagesIn(movies) {
  const present = new Set(movies.map(m => m.lang).filter(Boolean));
  return [...LANGUAGES.filter(l => present.has(l)), ...[...present].filter(l => !LANGUAGES.includes(l)).sort()];
}

// Opening weekend runs from Day 1 to the first Sunday. A Thursday release has a 4-day "extended" weekend.
function openingWeekend(m, { previews = true } = {}) {
  const release = parseDay(m.release);
  if (!release) return null;
  const length = weekendLength(release);
  const days = sumDays(m, 1, length);
  return days === null ? null : { value: boRound2(days + (previews ? previewsNet(m) : 0)), days: length, extended: length > 3 };
}

// Trade week 1 (release day to the first Thursday after the weekend) + previews, with its day count
function firstWeek(m) {
  const length = week1Length(m);
  const days = sumDays(m, 1, length);
  return days === null ? null : { value: boRound2(days + previewsNet(m)), days: length };
}

// First 7 days (+ previews): the same length for every film, so it is the fair one to rank
function first7Days(m, { previews = true } = {}) {
  const days = sumDays(m, 1, 7);
  return days === null ? null : boRound2(days + (previews ? previewsNet(m) : 0));
}

// Totals for each trade week. A week is "complete" only when all its days are present. Week 1 includes previews.
function weekTotals(m) {
  const rows = dayRows(m);
  const last = Math.max(0, ...rows.map(d => d.day));
  if (!last) return [];
  const w1 = week1Length(m);
  const weeks = [];
  for (let w = 1; w <= weekOf(m, last); w++) {
    const from = w === 1 ? 1 : w1 + 7 * (w - 2) + 1;
    const to = w === 1 ? w1 : from + 6;
    const inWeek = rows.filter(d => d.week === w);
    const daysPresent = inWeek.filter(d => d.day > 0).length;
    weeks.push({ week: w, from, to, days: to - from + 1, total: boRound2(boSum(inWeek.map(d => d.net))), daysPresent, complete: daysPresent === to - from + 1 });
  }
  return weeks;
}

// Sum of every day-wise figure entered (gaps included as nothing)
function trackedNet(m) {
  const rows = dayRows(m);
  return rows.length ? boRound2(boSum(rows.map(d => d.net))) : null;
}

// Lifetime India net: the reported total, else the day-wise sum
function indiaNet(m) {
  return boNum(boxOffice(m).totals?.indiaNet) ?? trackedNet(m);
}
function indiaGross(m) {
  return boNum(boxOffice(m).totals?.indiaGross);
}
function overseasGross(m) {
  return boNum(boxOffice(m).totals?.overseasGross);
}
// Worldwide gross: the reported total, else India gross + overseas gross when both are known
function worldwideGross(m) {
  const t = boxOffice(m).totals || {};
  const ww = boNum(t.worldwideGross);
  if (ww !== null) return ww;
  const ig = boNum(t.indiaGross), og = boNum(t.overseasGross);
  return ig !== null && og !== null ? boRound2(ig + og) : null;
}
// What the makers announced (posters, press notes). Shown for context, never ranked.
function producerClaim(m) {
  return boNum(boxOffice(m).totals?.producerClaim);
}

// Collections not listed day by day (lifetime total minus the days entered)
function untrackedNet(m) {
  const life = boNum(boxOffice(m).totals?.indiaNet), tracked = trackedNet(m);
  return life !== null && tracked !== null && life - tracked > 0.005 ? boRound2(life - tracked) : null;
}

// Day 1 India net by language (Telugu, Hindi, ...), largest first
function languageSplit(m) {
  const split = boxOffice(m).day1Split || {};
  const rows = Object.entries(split).map(([lang, v]) => ({ lang, net: boNum(v) })).filter(x => x.net !== null && x.net > 0);
  const total = boSum(rows.map(x => x.net));
  return rows.sort((a, b) => b.net - a.net).map(x => ({ ...x, share: total ? x.net / total : 0 }));
}

// "Crossed ₹100 Cr on Day 2": first day the running India net total (incl. previews) reaches each mark.
// Stops at the first missing day, because the running total is unknown after it.
const MILESTONES = [50, 100, 200, 300, 500, 750, 1000, 1500];
function milestones(m) {
  const rows = dayRows(m).filter(d => d.cum !== null);
  return MILESTONES.map(amount => {
    const hit = rows.find(d => d.cum >= amount);
    return hit ? { amount, day: hit.day, label: hit.label, date: hit.date } : null;
  }).filter(Boolean);
}

// How the run held up. Each value is null when the days it needs are missing.
//   mondayDrop:   first Monday vs the first Friday (the trade's word-of-mouth test)
//   weekendDrop:  second Fri-Sun weekend vs the first
//   multiplier:   lifetime India net / opening weekend ("legs"; big openers usually have lower ones)
//   frontLoad:    share of trade week 1 earned on the opening day
function trends(m) {
  const release = parseDay(m.release);
  if (!release || !dayRows(m).length) return null;
  const firstFri = ((5 - release.getDay() + 7) % 7) + 1;           // day number of the first Friday
  const net = day => sumDays(m, day, day);
  const fri = net(firstFri), mon = net(firstFri + 3);
  const wk1 = sumDays(m, firstFri, firstFri + 2), wk2 = sumDays(m, firstFri + 7, firstFri + 9);
  const ow = openingWeekend(m), life = indiaNet(m), fw = firstWeek(m), od = openingDay(m);
  return {
    mondayDrop: fri && mon !== null ? (mon - fri) / fri : null,
    weekendDrop: wk1 && wk2 !== null ? (wk2 - wk1) / wk1 : null,
    multiplier: ow && ow.value && ow.days <= 5 && life !== null ? life / ow.value : null,
    frontLoad: fw && fw.value && od !== null ? od / fw.value : null,
  };
}

// ---------- Budget and verdict ----------
function budget(m) {
  const b = boxOffice(m).budget || {};
  const low = boNum(b.low), high = boNum(b.high) ?? low;
  if (low === null && high === null) return null;
  const lo = low ?? high;
  return { low: lo, high, mid: (lo + high) / 2 };
}
// Lifetime India net as a multiple of the (mid) budget: Koimoi's published "return on budget" basis
function budgetMultiple(m) {
  const b = budget(m), net = indiaNet(m);
  return b && b.mid > 0 && net !== null ? net / b.mid : null;
}

// Verdict labels, worst to best, with the colour tone used for the badge
const VERDICTS = [
  { label: "Disaster", tone: "bad" },
  { label: "Flop", tone: "bad" },
  { label: "Below Average", tone: "warn" },
  { label: "Average", tone: "warn" },
  { label: "Above Average", tone: "ok" },
  { label: "Hit", tone: "good" },
  { label: "Super Hit", tone: "good" },
  { label: "Blockbuster", tone: "great" },
  { label: "All-Time Blockbuster", tone: "great" },
];
// Used only when the trade has not given a verdict. Basis: lifetime India net / budget (Koimoi's bands).
// Deliberately conservative: it never calls a film a Disaster or a Blockbuster on its own.
const INDICATIVE_VERDICT = [
  { below: 0.5, label: "Flop" },
  { below: 0.9, label: "Below Average" },   // Koimoi: "Losing"
  { below: 1.1, label: "Average" },
  { below: 2.0, label: "Above Average" },   // Koimoi: "Plus"
  { below: 2.5, label: "Hit" },
  { below: Infinity, label: "Super Hit" },
];
const INDICATIVE_BASIS = "Indicative: lifetime India net vs budget (Koimoi's bands). No trade verdict yet.";

function verdictTone(label) {
  return VERDICTS.find(v => v.label.toLowerCase() === String(label).toLowerCase())?.tone || "ok";
}

// Trade verdict entered by the admin, else (once the run is over) an indicative one. While a film is
// still running (boxOffice.running) a trade verdict is provisional and shown as "Trending".
function verdict(m) {
  if (!isReleased(m)) return null;
  const b = boxOffice(m);
  const running = Boolean(b.running);
  if (b.verdict) return { label: b.verdict, tone: verdictTone(b.verdict), indicative: false, running, source: b.verdictSource || "" };
  // Indicative bands need the whole run: a partial, still-running total is never banded
  if (running) return null;
  const r = budgetMultiple(m);
  if (r === null) return null;
  const label = INDICATIVE_VERDICT.find(t => r < t.below).label;
  return { label, tone: verdictTone(label), indicative: true, running, source: "" };
}

// ---------- Ratings ----------
// Critics: each review normalised to /10, then averaged
function criticsScore(m) {
  const list = (m.critics?.reviews || [])
    .map(r => ({ ...r, score: boNum(r.score), outOf: boNum(r.outOf) }))
    .filter(r => r.score !== null && r.outOf > 0 && r.score <= r.outOf);
  if (!list.length) return null;
  return { score: boRound1(boSum(list.map(r => (r.score / r.outOf) * 10)) / list.length), count: list.length, reviews: list };
}

// IMDb rating out of 10: a snapshot entered by the admin, with its vote count and date
function imdbScore(m) {
  const i = m.critics?.imdb || {};
  const score = boNum(i.score);
  return score !== null && score > 0 && score <= 10 ? { score, votes: i.votes || "", asOf: i.asOf || "" } : null;
}

// Audience reviews: written by visitors on the film page. On the server they're in the database
// (MANA_SERVER.reviews, from api/bootstrap.js); without it, in this browser.
const REVIEWS_KEY = "manaReviews";
const REVIEW_MAX = 500;
const NAME_MAX = 40;
const AUDIENCE_MIN_VOTES = 5;   // below this an average is shown as "early"
// A whole 1-5 star rating, else null (guards against restored or hand-edited data)
const validStars = v => { const s = Number(v); return Number.isInteger(s) && s >= 1 && s <= 5 ? s : null; };

function allReviews() {
  return ONLINE ? MANA_SERVER.reviews || [] : loadStore(REVIEWS_KEY, []);
}
// Visible reviews for one film, newest first
function filmReviews(movieId) {
  return allReviews()
    .filter(r => r.movieId === Number(movieId) && !r.hidden)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

// Average stars (out of 5), count, how many 1-5 star ratings, and whether there are enough to trust
function audienceScore(movieId) {
  const stars = filmReviews(movieId).map(r => validStars(r.stars)).filter(s => s !== null);
  const dist = [0, 0, 0, 0, 0];
  stars.forEach(s => dist[s - 1]++);
  return {
    avg: stars.length ? boRound1(boSum(stars) / stars.length) : null,
    count: stars.length,
    dist,
    early: stars.length < AUDIENCE_MIN_VOTES,
  };
}

// Average pulled towards a prior (by default 3.5 stars) until a film has enough ratings,
// so one 5-star rating can't put a film above one with hundreds of ratings
const AUDIENCE_PRIOR = 3.5;
function weightedAudience(movieId, prior = AUDIENCE_PRIOR) {
  const { avg, count } = audienceScore(movieId);
  return count ? (avg * count + prior * AUDIENCE_MIN_VOTES) / (count + AUDIENCE_MIN_VOTES) : null;
}

// One score out of 10 for ranking: the mean of the critics score, IMDb and the (weighted) audience score
// out of 10, using whichever exist. The separate scores are always shown next to it.
// Audience ratings lean towards the film's own critics/IMDb level, so a low rating can only lower the score.
// With no critics or IMDb score, a film needs AUDIENCE_MIN_VOTES ratings before it gets an overall score.
function overallScore(m) {
  const base = [criticsScore(m)?.score, imdbScore(m)?.score].filter(v => v !== null && v !== undefined);
  if (!base.length && audienceScore(m.id).count < AUDIENCE_MIN_VOTES) return null;
  const aud = weightedAudience(m.id, base.length ? boSum(base) / base.length / 2 : AUDIENCE_PRIOR);
  const parts = aud === null ? base : [...base, aud * 2];
  return parts.length ? boRound1(boSum(parts) / parts.length) : null;
}

// Anonymous id for this browser, so each visitor has one rating per film (a new one replaces the old)
function reviewerId() {
  try {
    let id = localStorage.getItem("manaReviewer");
    if (!id) {
      id = (window.crypto?.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random().toString(16).slice(2);
      localStorage.setItem("manaReviewer", id);
    }
    return id;
  } catch { return "guest"; }
}
// On the server, a visitor's own review comes marked "mine" (the server knows them by a cookie)
function isMyReview(r) {
  return ONLINE ? Boolean(r.mine) : r.by === reviewerId();
}
function myReview(movieId) {
  return allReviews().find(r => r.movieId === Number(movieId) && isMyReview(r)) || null;
}

// Validate and save a visitor's rating. Resolves to { ok, error?, replaced?, review? }.
async function submitReview(m, { name = "", stars, text = "" }) {
  if (!m) return { ok: false, error: "That film doesn't exist." };
  if (!isReleased(m)) return { ok: false, error: "Ratings open on release day." };
  const s = Number(stars);
  if (!Number.isInteger(s) || s < 1 || s > 5) return { ok: false, error: "Pick 1 to 5 stars." };
  const body = String(text).trim();
  if (body.length > REVIEW_MAX) return { ok: false, error: `Keep your review under ${REVIEW_MAX} characters.` };
  if (ONLINE) {
    try {
      const res = await api(`movies/${Number(m.id)}/reviews`, { method: "POST", body: { name: String(name).trim().slice(0, NAME_MAX), stars: s, text: body } });
      MANA_SERVER.reviews = [res.review, ...allReviews().filter(r => !(r.movieId === m.id && r.mine))];
      return { ok: true, replaced: res.replaced, review: res.review };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
  const me = reviewerId();
  const list = allReviews();
  const old = list.find(r => r.movieId === m.id && r.by === me);
  const review = {
    id: old?.id || Date.now(),
    movieId: m.id,
    name: String(name).trim().slice(0, NAME_MAX) || "Anonymous",
    stars: s,
    text: body,
    at: new Date().toISOString(),
    by: me,
    hidden: Boolean(old?.hidden),   // editing doesn't undo a moderator's hide
  };
  const next = old ? list.map(r => (r === old ? review : r)) : [review, ...list];
  if (!saveStore(REVIEWS_KEY, next)) return { ok: false, error: "Couldn't save. Your browser storage may be full or blocked." };
  return { ok: true, replaced: Boolean(old), review };
}

// ---------- Release reminders ("Remind me" on upcoming films, kept in this browser) ----------
const REMINDERS_KEY = "manaReminders";
function hasReminder(movieId) {
  return loadStore(REMINDERS_KEY, []).includes(Number(movieId));
}
// Turns the reminder on or off; returns true when it is now on, false when off, null if it couldn't be saved
function toggleReminder(movieId) {
  const id = Number(movieId);
  const list = loadStore(REMINDERS_KEY, []);
  const on = !list.includes(id);
  if (!saveStore(REMINDERS_KEY, on ? [...list, id] : list.filter(x => x !== id))) return null;
  return on;
}
// Films with a reminder that are now out. Clears those reminders, so each is announced once.
function takeDueReminders(movies) {
  const list = loadStore(REMINDERS_KEY, []);
  const due = movies.filter(m => list.includes(m.id) && isReleased(m));
  if (due.length) saveStore(REMINDERS_KEY, list.filter(id => !due.some(m => m.id === id)));
  return due;
}

// ---------- Rankings ----------
// Each ranking reads one number per film; films without that number (or with a money figure of 0) are left out.
// Money rankings never mix bases: India net and worldwide gross are separate tables.
// opts: { previews: false } ranks opening figures without paid previews (show noteNoPreviews then).
const RANKINGS = {
  opening:   { label: "Opening day",     note: "India net · Day 1 + paid previews", noteNoPreviews: "India net · Day 1 only, paid previews left out", usesPreviews: true, get: (m, o) => openingDay(m, o), format: v => crore(v) },
  weekend:   { label: "Opening weekend", note: "India net · Day 1 to first Sunday (day count shown) · Mon/Tue releases not ranked (see First 7 days)", noteNoPreviews: "India net · Day 1 to first Sunday, paid previews left out · Mon/Tue releases not ranked", usesPreviews: true, get: (m, o) => { const ow = openingWeekend(m, o); return ow && ow.days <= 5 ? ow.value : null; }, format: v => crore(v) },
  first7:    { label: "First 7 days",    note: "India net · Days 1-7, same length for every film", noteNoPreviews: "India net · Days 1-7, paid previews left out", usesPreviews: true, get: (m, o) => first7Days(m, o), format: v => crore(v) },
  indiaNet:  { label: "India net",       note: "Lifetime India net",                  get: m => indiaNet(m), format: v => crore(v) },
  worldwide: { label: "Worldwide gross", note: "Lifetime worldwide gross (India gross + overseas)", get: m => worldwideGross(m), format: v => crore(v) },
  rating:    { label: "Top rated",       note: "Critics, IMDb and audience, out of 10", get: m => overallScore(m), format: v => `${v.toFixed(1)}/10` },
};

// Released films with a value, highest first. Equal values (to 0.01) share a rank (1, 1, 3);
// ties are listed by earlier release (a film with only a year counts as 31 Dec of it), then title.
// A money figure of 0 means none to show (say, no India release), so it isn't ranked either.
function ranking(movies, key, opts = {}) {
  const r = RANKINGS[key];
  const time = m => parseDay(m.release)?.getTime() ?? (Number(m.year) ? new Date(Number(m.year), 11, 31).getTime() : Infinity);
  const sorted = movies
    .filter(isReleased)
    .map(m => ({ m, value: r.get(m, opts) }))
    .filter(x => x.value !== null && x.value !== undefined && Number.isFinite(x.value) && (key === "rating" || x.value > 0))
    .sort((a, b) => boRound2(b.value) - boRound2(a.value) || time(a.m) - time(b.m) || a.m.title.localeCompare(b.m.title));
  let rank = 0;
  return sorted.map((x, i) => {
    if (i === 0 || boRound2(x.value) !== boRound2(sorted[i - 1].value)) rank = i + 1;
    return { ...x, rank };
  });
}

// ---------- Formatting ----------
// 164.25 -> "₹164.25 Cr", 1742.1 -> "₹1,742.10 Cr", 0.48 -> "₹48 L" (under a crore, the trade writes lakh)
function crore(v, { dash = "–" } = {}) {
  const n = boNum(v);
  if (n === null) return dash;
  if (n !== 0 && Math.abs(n) < 1) return `₹${boRound1(n * 100).toLocaleString("en-IN")} L`;
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Cr`;
}
// Budget style: "₹400–500 Cr"
function croreRange(lo, hi) {
  if (lo === null && hi === null) return "–";
  const f = v => Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return lo === hi || hi === null || lo === null ? `₹${f(lo ?? hi)} Cr` : `₹${f(lo)}–${f(hi)} Cr`;
}
// 0.123 -> "+12.3%", -0.4 -> "−40.0%"
function pct(x) {
  if (x === null || x === undefined || !Number.isFinite(x)) return "";
  const v = Math.abs(x * 100).toFixed(1);
  return `${x > 0 ? "+" : x < 0 ? "−" : ""}${v}%`;
}

// Star bar for a 0-5 value (partial stars supported). Styles: .stars in css/style.css
function starsHTML(value, { size = "" } = {}) {
  const v = Math.max(0, Math.min(5, Number(value) || 0));
  return `<span class="stars${size ? " stars-" + size : ""}" style="--v:${v}" role="img" aria-label="${v.toFixed(1)} out of 5 stars"></span>`;
}

// Verdict badge. An asterisk marks an indicative or still-running verdict. Styles: .verdict in css/style.css
function verdictHTML(m) {
  const v = verdict(m);
  if (!v) return "";
  const title = v.indicative ? INDICATIVE_BASIS : `Trade verdict${v.source ? " · " + v.source : ""}`;
  const label = v.running ? `Trending: ${v.label}` : v.label;
  return `<span class="verdict verdict-${v.tone}" title="${esc(title + (v.running ? ". Still in theatres, so it may change." : ""))}">${esc(label)}${v.indicative || v.running ? "*" : ""}</span>`;
}
