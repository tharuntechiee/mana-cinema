// Film catalogue, saved-data helpers and the data migration, shared by every page.
//
// Box office: trade estimates collected on 2026-10-14, mostly from Sacnilk (India net, ₹ crore),
// cross-checked against other trackers; see each film's sources and notes. Producers' claims are
// kept apart (totals.producerClaim) and never ranked. Synopses are our own short summaries.
// Field reference: see js/boxoffice.js for how every total is worked out.

const DATA_VERSION = 2;

// ---------- The server (Express API + SQLite database) ----------
// Run with `npm start`, every page first loads api/bootstrap.js, which sets MANA_SERVER to the films and
// audience reviews in the database: ONLINE is then true and changes go to the API. Opened as plain files or
// on static hosting (GitHub Pages) there is no server: the pages use the catalogue below and this browser's
// storage, as before.
const ONLINE = typeof MANA_SERVER === "object" && MANA_SERVER !== null && Array.isArray(MANA_SERVER.movies);

// Calls the API (api/...) with JSON in and out. Throws an Error with the server's message (and .status).
async function api(path, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(`api/${path}`, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw Object.assign(new Error("Can't reach the MANA CINEMA server. Check your connection and try again."), { status: 0 });
  }
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    // "Sign in first": open the sign-in window (js/account.js) as well as showing the message
    if (res.status === 401 && data?.signIn && typeof openSignIn === "function") openSignIn(data.error);
    throw Object.assign(new Error(data?.error || `The server couldn't do that (error ${res.status}).`), { status: res.status, signIn: Boolean(data?.signIn) });
  }
  return data;
}

const DEFAULT_MOVIES = [
  {
    id: 10, art: "og", image: "images/posters/they-call-him-og.jpg", cover: true,
    title: "They Call Him OG", genre: "Action / Gangster Drama", lang: "Telugu", languages: ["Telugu","Hindi","Tamil","Kannada"],
    year: 2025, release: "2025-09-25", duration: "2h 34m", cert: "A",
    director: "Sujeeth", cast: "Pawan Kalyan, Emraan Hashmi, Priyanka Arul Mohan",
    colors: ["#b3121b","#0a0000"],
    desc: "A feared gangster returns to Bombay after a decade away, and the city still remembers his name.",
    critics: {
      imdb: { score: 6, votes: "12,253", asOf: "2026-10-14" },
      reviews: [
        { outlet: "The Times of India", score: 3, outOf: 5, url: "https://timesofindia.indiatimes.com/entertainment/telugu/movie-reviews/they-call-him-og/movie-review/124119218.cms" },
        { outlet: "The Indian Express", score: 3, outOf: 5, url: "https://indianexpress.com/article/entertainment/movie-review/they-call-him-og-movie-review-pawan-kalyan-commands-og-control-in-sujeeths-actioner-10270509/" },
        { outlet: "Filmfare", score: 3, outOf: 5 },
        { outlet: "India Today", score: 2.5, outOf: 5, url: "https://www.indiatoday.in/movies/reviews/story/pawan-kalyan-they-call-him-og-review-gangster-drama-sujeeth-thaman-2792870-2025-09-25" },
        { outlet: "Pinkvilla", score: 2.5, outOf: 5, url: "https://www.pinkvilla.com/entertainment/south/they-call-him-og-review-a-treat-for-pawan-kalyan-fans-that-ventures-into-predictable-territory-1397178" },
        { outlet: "NDTV", score: 2.5, outOf: 5 },
        { outlet: "Firstpost", score: 2.5, outOf: 5 },
        { outlet: "LatestLY", score: 2, outOf: 5, url: "https://www.latestly.com/entertainment/south/they-call-him-og-movie-review-slick-and-swag-packed-sure-but-nothing-og-about-pawan-kalyans-action-spectacle-latestly-reviews-7130044.html" },
      ],
    },
    boxOffice: {
      asOf: "2026-10-14",
      running: false,
      previewsDate: "2025-09-24",
      budget: { low: 200, high: 250 },
      days: [
        { day: 0, net: 21 }, { day: 1, net: 63.75 }, { day: 2, net: 18.45 }, { day: 3, net: 18.5 }, { day: 4, net: 18.5 },
        { day: 5, net: 7.4 }, { day: 6, net: 7.25 }, { day: 7, net: 6.75 }, { day: 8, net: 7.7 }, { day: 9, net: 4.75 },
        { day: 10, net: 4.6 }, { day: 11, net: 4.15 }, { day: 12, net: 1.65 }, { day: 13, net: 1.45 }, { day: 14, net: 1 },
        { day: 15, net: 0.9 }, { day: 16, net: 0.75 }, { day: 17, net: 1.15 }, { day: 18, net: 1.32 }, { day: 19, net: 0.48 },
        { day: 20, net: 0.49 }, { day: 21, net: 0.42 }, { day: 22, net: 0.33 }, { day: 23, net: 0.21 }, { day: 24, net: 0.14 },
        { day: 25, net: 0.21 }, { day: 26, net: 0.14 }, { day: 27, net: 0.09 }, { day: 28, net: 0.1 },
      ],
      day1Split: { Telugu: 63, Hindi: 0.5, Tamil: 0.22, Kannada: 0.03 },
      totals: { indiaNet: 194.15, indiaGross: 229.97, overseasGross: 65.25, worldwideGross: 295.22, producerClaim: 308 },
      verdict: "Hit", verdictSource: "Sacnilk. Koimoi disagrees: 'Losing' against its ₹250 Cr India net target",
      sources: [
        { title: "Sacnilk - They Call Him OG Box Office Collection, day-wise and worldwide", url: "https://sacnilk.com/news/OG_2024_Box_Office_Collection_Day_Wise_Worldwide" },
        { title: "Sacnilk - They Call Him OG Box Office Collection Day 1", url: "https://www.sacnilk.com/quicknews/OG_2024_Box_Office_Collection_Day_1?hl=en" },
        { title: "Sacnilk - They Call Him OG Box Office Collection Day 8", url: "https://www.sacnilk.com/quicknews/OG_2024_Box_Office_Collection_Day_8" },
        { title: "Sacnilk - They Call Him OG Box Office Collection Day 20", url: "https://www.sacnilk.com/quicknews/OG_2024_Box_Office_Collection_Day_20" },
        { title: "Sacnilk - They Call Him OG Box Office Collection Day 11", url: "https://www.sacnilk.com/quicknews/OG_2024_Box_Office_Collection_Day_11" },
        { title: "Sacnilk - movie page (verdict, totals, language-wise)", url: "https://sacnilk.com/movie/OG_2024" },
      ],
      notes: [
        "Paid previews on 24 Sep 2025 (₹21 Cr net) are reported separately from Day 1.",
        "The makers announced ₹308 Cr+ worldwide in 11 days, higher than every trade estimate.",
        "Days 29-85 added only about ₹52 L and are not listed day by day.",
      ],
    },
  },
  {
    id: 1, art: "kalki", image: "images/posters/kalki-2898-ad.jpg",
    title: "Kalki 2898 AD", genre: "Sci-Fi / Mythological Epic", lang: "Telugu", languages: ["Telugu","Hindi","Tamil","Kannada","Malayalam"],
    year: 2024, release: "2024-06-27", duration: "3h 1m", cert: "U/A",
    director: "Nag Ashwin", cast: "Prabhas, Amitabh Bachchan, Kamal Haasan, Deepika Padukone",
    colors: ["#d9a441","#3a2208"],
    desc: "In the ruined city of Kasi, a bounty hunter crosses paths with a woman carrying a child foretold to change the world.",
    critics: {
      imdb: { score: 7, votes: "78,005", asOf: "2026-10-14" },
      reviews: [
        { outlet: "Bollywood Hungama", score: 4, outOf: 5, url: "https://www.bollywoodhungama.com/movie/kalki-2898-ad/critic-review/kalki-2898-ad-movie-review/" },
        { outlet: "The Guardian (Leslie Felperin)", score: 4, outOf: 5, url: "https://www.theguardian.com/film/article/2024/jun/28/kalki-2898-ad-review-amitabh-bachchan-sci-fi-movie-mahabharata-mad-max" },
        { outlet: "Pinkvilla (Goutham S)", score: 4, outOf: 5, url: "https://www.pinkvilla.com/entertainment/reviews/kalki-2898-ad-movie-review-prabhas-starrer-is-a-glorious-epic-feast-with-amitabh-bachchan-and-kamal-haasan-capturing-everyones-attention-1321497" },
        { outlet: "India Today (Janani K)", score: 3.5, outOf: 5, url: "https://www.indiatoday.in/movies/reviews/story/kalki-2898-ad-review-prabhas-supremacy-reign-amitabh-bachchan-deepika-padukone-impress-2558959-2024-06-27" },
        { outlet: "Rediff (Sukanya Verma)", score: 3.5, outOf: 5, url: "https://m.rediff.com/movies/review/kalki-2898-ad-review/20240627.htm" },
        { outlet: "NDTV (Saibal Chatterjee)", score: 2.5, outOf: 5, url: "https://www.ndtv.com/entertainment/kalki-2898-ad-review-prabhas-film-has-firepower-that-an-aspiring-futuristic-franchise-needs-2-5-stars-5981738" },
      ],
    },
    boxOffice: {
      asOf: "2026-10-14",
      running: false,
      budget: { low: 600, high: 600 },
      days: [
        { day: 1, net: 95.3 }, { day: 2, net: 59.3 }, { day: 3, net: 66.2 }, { day: 4, net: 88.2 }, { day: 5, net: 34.15 },
        { day: 6, net: 27.05 }, { day: 7, net: 22.25 }, { day: 8, net: 22.4 }, { day: 9, net: 16.7 }, { day: 10, net: 34.15 },
        { day: 11, net: 44.35 }, { day: 12, net: 10.4 }, { day: 13, net: 8.8 }, { day: 14, net: 7.5 }, { day: 15, net: 6.6 },
        { day: 16, net: 6 }, { day: 17, net: 14.35 }, { day: 18, net: 16.45 }, { day: 19, net: 4 }, { day: 20, net: 5.1 },
        { day: 21, net: 7.2 }, { day: 22, net: 3 }, { day: 23, net: 2.9 }, { day: 24, net: 6.1 }, { day: 25, net: 8.4 },
        { day: 26, net: 1.65 }, { day: 27, net: 2 }, { day: 28, net: 1.7 }, { day: 29, net: 1.65 }, { day: 30, net: 1.25 },
        { day: 31, net: 2.9 }, { day: 32, net: 4 }, { day: 33, net: 1.05 }, { day: 34, net: 0.95 }, { day: 35, net: 0.95 },
        { day: 36, net: 1 }, { day: 37, net: 0.65 }, { day: 38, net: 1.25 }, { day: 39, net: 1.8 }, { day: 40, net: 0.5 },
        { day: 41, net: 0.48 }, { day: 42, net: 0.48 }, { day: 43, net: 0.45 }, { day: 44, net: 0.65 }, { day: 45, net: 1.14 },
        { day: 46, net: 1.45 }, { day: 47, net: 0.35 }, { day: 48, net: 0.35 }, { day: 49, net: 0.3 },
      ],
      day1Split: { Telugu: 65.8, Hindi: 22.5, Tamil: 4.5, Malayalam: 2.2, Kannada: 0.3 },
      totals: { indiaNet: 646.31, indiaGross: 767.25, overseasGross: 275, worldwideGross: 1042.25, producerClaim: 1100 },
      verdict: "Blockbuster", verdictSource: "Sacnilk. Koimoi: 'a big success'",
      sources: [
        { title: "Sacnilk - Kalki 2898 AD movie page (totals, language split, verdict)", url: "https://www.sacnilk.com/movie/Project_K_2024" },
        { title: "Sacnilk - Kalki 2898 AD Box Office Collection Day 49 (day-wise table, Days 1-49)", url: "https://sacnilk.com/quicknews/Project_K_2024_Box_Office_Collection_Day_49" },
        { title: "Sacnilk - Kalki 2898 AD Box Office Collection Day 1", url: "https://www.sacnilk.com/quicknews/Project_K_2024_Box_Office_Collection_Day_1?hl=en" },
        { title: "Koimoi - Kalki Day 1 early estimate (27 Jun 2024)", url: "https://www.koimoi.com/box-office/kalki-2898-ad-box-office-collection-day-1/" },
        { title: "Koimoi - Kalki 2898 AD box office collection Day 2", url: "https://www.koimoi.com/box-office/kalki-2898-ad-box-office-collection-day-2/" },
        { title: "Koimoi - Kalki 2898 AD box office collection Day 4", url: "https://www.koimoi.com/box-office/kalki-2898-ad-box-office-collection-day-4/" },
      ],
      notes: [
        "No separate paid previews in India. The 26 Jun North America premieres count in the overseas gross.",
        "Its trade week 1 ran 8 days (Thu to Thu): ₹414.85 Cr.",
        "Koimoi's totals run slightly higher (₹1,054.67 Cr worldwide). The makers announced ₹1,100 Cr+ in July 2024.",
      ],
    },
  },
  {
    id: 2, art: "pushpa", image: "images/posters/pushpa-2-the-rule.jpg",
    title: "Pushpa 2: The Rule", genre: "Action / Drama", lang: "Telugu", languages: ["Telugu","Hindi","Tamil","Kannada","Malayalam"],
    year: 2024, release: "2024-12-05", duration: "3h 20m", cert: "U/A",
    director: "Sukumar", cast: "Allu Arjun, Rashmika Mandanna, Fahadh Faasil",
    colors: ["#e85d04","#370617"],
    desc: "Pushpa Raj now rules the red sandalwood trade, and he will not bow to anyone, least of all his old rival.",
    critics: {
      imdb: { score: 6, votes: "68,772", asOf: "2026-10-14" },
      reviews: [
        { outlet: "Bollywood Hungama (Taran Adarsh)", score: 4.5, outOf: 5, url: "https://www.bollywoodhungama.com/movie/pushpa-2-rule/critic-review/pushpa-2-rule-movie-review/pushpa-2-the-rule-is-a-wildfire-entertainer/" },
        { outlet: "Firstpost (Ganesh Aaglave)", score: 4, outOf: 5, url: "https://www.firstpost.com/entertainment/pushpa-2-the-rule-movie-review-allu-arjun-is-here-to-rule-as-he-delivers-a-bonafide-massy-blockbuster-with-his-wild-fiery-performance-fahadh-faasil-rashmika-mandanna-13841751.html" },
        { outlet: "The Times of India (Paul Nicodemus, Telugu desk)", score: 3.5, outOf: 5, url: "https://timesofindia.indiatimes.com/entertainment/telugu/movie-reviews/pushpa-2-the-rule/movie-review/115989021.cms" },
        { outlet: "NDTV (Saibal Chatterjee)", score: 2.5, outOf: 5, url: "https://www.ndtv.com/entertainment/pushpa-the-rule-part-2-review-the-film-is-crushed-under-the-weight-of-its-own-vaulting-ambition-2-5-stars-7178499" },
        { outlet: "India Today (Janani K)", score: 2.5, outOf: 5, url: "https://www.indiatoday.in/movies/reviews/story/pushpa-2-the-rule-movie-review-allu-arjun-stellar-act-overindulgent-film-rashmika-mandanna-fahadh-faasil-2645372-2024-12-05" },
        { outlet: "The Indian Express (Anandu Suresh)", score: 2.5, outOf: 5, url: "https://indianexpress.com/article/entertainment/movie-review/pushpa-2-the-rule-review-allu-arjun-fahadh-faasil-film-chokes-under-the-weight-of-performance-pressure-9706694/" },
        { outlet: "The Week (Sajin Shrijith)", score: 2, outOf: 5, url: "https://www.theweek.in/review/movies/2024/12/05/pushpa-2-the-rule-review-a-massive-insult-to-intelligence-and-peelings.html" },
      ],
    },
    boxOffice: {
      asOf: "2026-10-14",
      running: false,
      previewsDate: "2024-12-04",
      budget: { low: 400, high: 500 },
      days: [
        { day: 0, net: 10.65 }, { day: 1, net: 164.25 }, { day: 2, net: 93.8 }, { day: 3, net: 119.25 }, { day: 4, net: 141.05 },
        { day: 5, net: 64.45 }, { day: 6, net: 51.55 }, { day: 7, net: 43.35 }, { day: 8, net: 37.45 }, { day: 9, net: 36.4 },
        { day: 10, net: 63.3 }, { day: 11, net: 76.6 }, { day: 12, net: 26.95 }, { day: 13, net: 23.35 }, { day: 14, net: 20.55 },
        { day: 15, net: 17.65 }, { day: 16, net: 14.3 }, { day: 17, net: 24.75 }, { day: 18, net: 32.95 }, { day: 19, net: 13 },
        { day: 20, net: 14.5 }, { day: 21, net: 19.5 }, { day: 22, net: 10.5 }, { day: 23, net: 8.75 }, { day: 24, net: 12.5 },
        { day: 25, net: 15.65 }, { day: 26, net: 6.8 }, { day: 27, net: 7.7 }, { day: 28, net: 13.25 }, { day: 29, net: 5 },
        { day: 30, net: 3.75 }, { day: 31, net: 5.5 }, { day: 32, net: 7.2 }, { day: 33, net: 2.5 }, { day: 34, net: 2.15 },
        { day: 35, net: 2.15 }, { day: 36, net: 2 }, { day: 37, net: 1.15 }, { day: 38, net: 2 }, { day: 39, net: 2.35 },
        { day: 40, net: 1 }, { day: 41, net: 1.5 }, { day: 42, net: 1 }, { day: 43, net: 0.7 }, { day: 44, net: 0.95 },
        { day: 45, net: 1.1 }, { day: 46, net: 1.5 }, { day: 47, net: 0.65 }, { day: 48, net: 0.65 }, { day: 49, net: 0.5 },
        { day: 50, net: 0.5 }, { day: 51, net: 0.3 }, { day: 52, net: 0.45 }, { day: 53, net: 1 }, { day: 54, net: 0.3 },
        { day: 55, net: 0.26 }, { day: 56, net: 0.29 }, { day: 57, net: 0.25 }, { day: 58, net: 0.1 }, { day: 59, net: 0.08 },
        { day: 60, net: 0.15 }, { day: 61, net: 0.08 }, { day: 62, net: 0.1 }, { day: 63, net: 0.09 }, { day: 64, net: 0.1 },
      ],
      day1Split: { Telugu: 80.3, Hindi: 70.3, Tamil: 7.7, Kannada: 1, Malayalam: 4.95 },
      totals: { indiaNet: 1234.1, indiaGross: 1471.1, overseasGross: 271, worldwideGross: 1742.1, producerClaim: 1831 },
      verdict: "All-Time Blockbuster", verdictSource: "Sacnilk, Bollywood Hungama",
      sources: [
        { title: "Sacnilk - Pushpa 2: The Rule Box Office Collection Day Wise Worldwide", url: "https://www.sacnilk.com/news/Pushpa_The_Rule_2021_Box_Office_Collection_Day_Wise_Worldwide" },
        { title: "Sacnilk - Pushpa 2 Censor Certificate and Official Runtime (28 Nov 2024)", url: "https://sacnilk.com/news/Allu_Arjuns_Pushpa_2__The_Rule_Censor_Certificate_and_Official_Runtime" },
        { title: "Sacnilk - All-Time Blockbuster Pushpa 2 Completes 50 Days (24 Jan 2025)", url: "https://www.sacnilk.com/news/AllTime_Blockbuster_Pushpa_2__The_Rule_Completes_50_Days_At_The_Box_Office" },
        { title: "Wikipedia - Pushpa 2: The Rule", url: "https://en.wikipedia.org/wiki/Pushpa_2:_The_Rule" },
        { title: "Wikipedia - List of highest-grossing Indian films", url: "https://en.wikipedia.org/wiki/List_of_highest-grossing_Indian_films" },
        { title: "Wikipedia - List of highest-grossing films in India", url: "https://en.wikipedia.org/wiki/List_of_highest-grossing_films_in_India" },
      ],
      notes: [
        "Paid previews on 4 Dec 2024 (₹10.65 Cr net) are reported separately from Day 1.",
        "Its trade week 1 ran 8 days (Thu to Thu): ₹725.80 Cr with paid previews.",
        "Box Office India's all-version numbers are lower than Sacnilk's. The makers claimed ₹1,831 Cr worldwide in 32 days.",
      ],
    },
  },
  {
    id: 3, art: "devara", image: "images/posters/devara-part-1.jpg",
    title: "Devara: Part 1", genre: "Action / Drama", lang: "Telugu", languages: ["Telugu","Hindi","Tamil","Kannada","Malayalam"],
    year: 2024, release: "2024-09-27", duration: "2h 58m", cert: "U/A",
    director: "Koratala Siva", cast: "N. T. Rama Rao Jr., Janhvi Kapoor, Saif Ali Khan",
    colors: ["#1d4e89","#020c1b"],
    desc: "On a lawless coast, a fearless leader turns the sea against the smugglers he once sailed with, and his legend outlives him.",
    critics: {
      imdb: { score: 6, votes: "24,030", asOf: "2026-10-14" },
      reviews: [
        { outlet: "The Times of India", score: 3, outOf: 5, url: "https://timesofindia.indiatimes.com/entertainment/telugu/movie-reviews/devara-part-1/movie-review/113734788.cms" },
        { outlet: "India Today", score: 2.5, outOf: 5, url: "https://www.indiatoday.in/movies/reviews/story/devara-part-1-review-jr-ntr-saif-ali-khan-shoulder-koratala-siva-predictable-action-drama-2607353-2024-09-27" },
        { outlet: "The Indian Express", score: 2.5, outOf: 5, url: "https://indianexpress.com/article/entertainment/movie-review/devara-movie-review-jr-ntr-anchors-this-action-drama-burdened-by-the-allure-of-a-sequel-9591098/" },
        { outlet: "NDTV", score: 2.5, outOf: 5, url: "https://www.ndtv.com/entertainment/devara-review-jr-ntrs-film-does-occasionally-manage-to-anchor-itself-to-terra-firma-2-5-stars-6662514" },
        { outlet: "Bollywood Hungama", score: 3, outOf: 5, url: "https://www.bollywoodhungama.com/movie/devara-part-1/critic-review/devara-part-1-movie-review/devara-part-1-suffers-from-a-weak-second-half/" },
        { outlet: "Firstpost", score: 3, outOf: 5, url: "https://www.firstpost.com/entertainment/devara-part-1-movie-review-jr-ntr-saif-ali-khan-janhvi-kapoors-entertaining-film-lacks-substance-13819674.html" },
        { outlet: "Rediff", score: 2.5, outOf: 5, url: "https://m.rediff.com/movies/review/devara-part-1-review/20240927.htm" },
        { outlet: "Deccan Chronicle", score: 2, outOf: 5, url: "https://www.deccanchronicle.com/entertainment/movie-review/devara-review-rating-1826369" },
      ],
    },
    boxOffice: {
      asOf: "2026-10-14",
      running: false,
      budget: { low: 250, high: 300 },
      days: [
        { day: 1, net: 82.5 }, { day: 2, net: 38.2 }, { day: 3, net: 39.9 }, { day: 4, net: 12.75 }, { day: 5, net: 14 },
        { day: 6, net: 21 }, { day: 7, net: 7.25 }, { day: 8, net: 6 }, { day: 9, net: 9.5 }, { day: 10, net: 12.65 },
        { day: 11, net: 5 }, { day: 12, net: 4.65 }, { day: 13, net: 4 }, { day: 14, net: 3.45 }, { day: 15, net: 2.75 },
        { day: 16, net: 5.25 }, { day: 17, net: 5.3 }, { day: 18, net: 2.15 }, { day: 19, net: 1.6 }, { day: 20, net: 1.4 },
        { day: 21, net: 1.3 }, { day: 22, net: 1.05 }, { day: 23, net: 1.45 }, { day: 24, net: 1.9 }, { day: 25, net: 0.8 },
        { day: 26, net: 0.8 }, { day: 27, net: 0.65 }, { day: 28, net: 0.65 }, { day: 29, net: 0.45 }, { day: 30, net: 0.65 },
        { day: 31, net: 0.9 }, { day: 32, net: 0.45 }, { day: 33, net: 0.4 }, { day: 34, net: 0.5 }, { day: 35, net: 0.2 },
        { day: 36, net: 0.09 }, { day: 37, net: 0.08 }, { day: 38, net: 0.14 }, { day: 39, net: 0.06 }, { day: 40, net: 0.09 },
        { day: 41, net: 0.07 }, { day: 42, net: 0.05 },
      ],
      day1Split: { Telugu: 73.25, Hindi: 7.5, Tamil: 1, Kannada: 0.35, Malayalam: 0.4 },
      totals: { indiaNet: 292.47, indiaGross: 351, overseasGross: 77, worldwideGross: 428, producerClaim: 466 },
      verdict: "Hit", verdictSource: "Trade consensus: about 111% recovery (Pinkvilla called it a super hit; Box Office India was cooler)",
      sources: [
        { title: "Sacnilk - Devara Part 1 Box Office Collection Day Wise Worldwide", url: "https://www.sacnilk.com/news/NTR_30_2022_Box_Office_Collection_Day_Wise_Worldwide" },
        { title: "Sacnilk - Devara Part 1 Box Office Collection Day 1", url: "https://sacnilk.com/quicknews/NTR_30_2022_Box_Office_Collection_Day_1" },
        { title: "Sacnilk - Devara Part 1 Box Office Collection Day 4", url: "https://sacnilk.com/quicknews/NTR_30_2022_Box_Office_Collection_Day_4" },
        { title: "Sacnilk - Devara Part 1 Tops 400 Crore Worldwide Gross", url: "https://www.sacnilk.com/news/Box_Office_Jr_NTRs_Devara_Part_1_Tops_400_Crore_Worldwide_Gross" },
        { title: "Sacnilk - Censor Certificate and Theatrical Runtime (U/A, 178 min)", url: "https://sacnilk.com/news/Jr_NTRs_Devara_Part_1_Censor_Certificate_and_Theatrical_Runtime_Revealed" },
        { title: "Bollywood Hungama - censor report (U/A, 178.03 min, 4 modifications)", url: "https://www.bollywoodhungama.com/?p=1853663" },
      ],
      notes: [
        "No separate paid previews in India: the 1 AM special shows are part of Day 1.",
        "Trade estimates of the worldwide gross run from ₹380 Cr (Box Office India) to ₹428 Cr (Sacnilk).",
        "The makers claimed ₹466 Cr in 10 days; a later ₹500 Cr claim was also reported.",
      ],
    },
  },
  {
    id: 4, art: "family",
    title: "Sankranthiki Vasthunam", genre: "Family Comedy / Action", lang: "Telugu", languages: ["Telugu"],
    year: 2025, release: "2025-01-14", duration: "2h 24m", cert: "U/A",
    director: "Anil Ravipudi", cast: "Venkatesh, Aishwarya Rajesh, Meenakshi Chaudhary",
    colors: ["#f59e0b","#3a1c03"],
    desc: "A retired cop is pulled back for one last rescue mission, with his ex-girlfriend in charge and his jealous wife tagging along.",
    critics: {
      imdb: { score: 6.1, votes: "4,346", asOf: "2026-10-14" },
      reviews: [
        { outlet: "OTTplay", score: 3.5, outOf: 5, url: "https://www.ottplay.com/review/sankranthiki-vasthunnam-review-a-paisa-vasool-family-drama-that-entertains-thoroughly/704e3cd759913" },
        { outlet: "The South First", score: 3.5, outOf: 5, url: "https://thesouthfirst.com/entertainment/telugu/sankranthiki-vasthunam-movie-review/" },
        { outlet: "123telugu", score: 3.25, outOf: 5, url: "https://www.123telugu.com/reviews/sankranthiki-vasthunam-telugu-movie-review.html" },
        { outlet: "India Today", score: 3, outOf: 5, url: "https://www.indiatoday.in/movies/reviews/story/sankranthiki-vasthunnam-review-venkatesh-ravipudi-deliver-a-generic-but-fun-film-2664483-2025-01-14" },
        { outlet: "Cinema Express", score: 3, outOf: 5, url: "https://www.cinemaexpress.com/telugu/review/2025/Jan/14/sankranthiki-vasthunam-movie-review-an-almost-overwhelming-roller-coaster-of-a-feast" },
        { outlet: "Times Now", score: 2.5, outOf: 5, url: "https://www.timesnownews.com/entertainment-news/reviews/telugu/sankranthiki-vasthunam-movie-review-venkatesh-anil-ravipudis-film-is-intermittently-funny-review-117224682/amp" },
      ],
    },
    boxOffice: {
      asOf: "2026-10-14",
      running: false,
      budget: { low: 50, high: 50 },
      days: [
        { day: 1, net: 23 }, { day: 2, net: 20 }, { day: 3, net: 17.5 }, { day: 4, net: 16 }, { day: 5, net: 17.75 },
        { day: 6, net: 19.35 }, { day: 7, net: 8.4 }, { day: 8, net: 6.75 }, { day: 9, net: 4.75 }, { day: 10, net: 3.8 },
        { day: 11, net: 3.6 }, { day: 12, net: 6.3 }, { day: 13, net: 9.8 }, { day: 14, net: 2.7 }, { day: 15, net: 2.35 },
        { day: 16, net: 1.95 }, { day: 17, net: 1.6 }, { day: 18, net: 1.35 }, { day: 19, net: 2.5 }, { day: 20, net: 3.65 },
        { day: 21, net: 1.15 }, { day: 22, net: 1.15 }, { day: 23, net: 1 }, { day: 24, net: 0.75 }, { day: 25, net: 0.65 },
        { day: 26, net: 1.1 }, { day: 27, net: 1.5 }, { day: 28, net: 0.55 }, { day: 29, net: 0.5 }, { day: 30, net: 0.5 },
        { day: 31, net: 0.5 }, { day: 32, net: 0.4 }, { day: 33, net: 0.44 }, { day: 34, net: 0.61 }, { day: 35, net: 0.34 },
        { day: 36, net: 0.3 }, { day: 37, net: 0.25 }, { day: 38, net: 0.25 }, { day: 39, net: 0.2 }, { day: 40, net: 0.25 },
        { day: 41, net: 0.3 }, { day: 42, net: 0.15 }, { day: 43, net: 0.13 }, { day: 44, net: 0.2 }, { day: 45, net: 0.15 },
        { day: 46, net: 0.13 }, { day: 47, net: 0.15 }, { day: 48, net: 0.03 }, { day: 49, net: 0.01 }, { day: 50, net: 0.01 },
        { day: 51, net: 0.05 }, { day: 52, net: 0.01 }, { day: 53, net: 0.01 }, { day: 54, net: 0.01 }, { day: 55, net: 0.01 },
        { day: 56, net: 0.01 }, { day: 57, net: 0.01 }, { day: 58, net: 0.01 }, { day: 59, net: 0.01 }, { day: 62, net: 0.01 },
        { day: 69, net: 0.01 }, { day: 70, net: 0.02 }, { day: 73, net: 0.03 }, { day: 78, net: 0.01 }, { day: 118, net: 0.01 },
      ],
      day1Split: { Telugu: 23 },
      totals: { indiaNet: 186.97, indiaGross: 220.08, overseasGross: 35.4, worldwideGross: 255.48, producerClaim: null },
      verdict: "Blockbuster", verdictSource: "Sacnilk. Koimoi: Super Duper Hit",
      sources: [
        { title: "Sacnilk - Sankranthiki Vasthunam movie page (day-wise, totals, verdict, budget)", url: "https://www.sacnilk.com/movie/Sankranthiki_Vasthunam_2025" },
        { title: "Sacnilk - Day Wise Worldwide box office report", url: "https://www.sacnilk.com/news/Sankranthiki_Vasthunam_2025_Box_Office_Collection_Day_Wise_Worldwide" },
        { title: "Sacnilk - Day 1 quicknews", url: "https://sacnilk.com/quicknews/Sankranthiki_Vasthunam_2025_Box_Office_Collection_Day_1" },
        { title: "Sacnilk - Day 2 quicknews", url: "https://www.sacnilk.com/quicknews/Sankranthiki_Vasthunam_2025_Box_Office_Collection_Day_2" },
        { title: "Koimoi - Sankranthiki Vasthunam Day 1 (early estimate)", url: "https://www.koimoi.com/box-office/sankranthiki-vasthunam-box-office-day-1-opens-with-541-higher-collection-than-venkateshs-last-sankranti-release/" },
        { title: "Koimoi - Sankranthiki Vasthunam box office collection Day 2", url: "https://www.koimoi.com/box-office/sankranthiki-vasthunam-box-office-collection-day-2-fantastic-run-continues-needs-just-7-crores-more-to-recover-the-budget/" },
      ],
      notes: [
        "Released on a Tuesday for Sankranti, so its trade week 1 ran 10 days.",
        "Released only in Telugu. Widely reported '₹300 Cr' figures are not attributed to a tracker and are left out.",
      ],
    },
  },
  {
    id: 5, art: "mirage",
    title: "Game Changer", genre: "Political Action Drama", lang: "Telugu", languages: ["Telugu","Hindi","Tamil"],
    year: 2025, release: "2025-01-10", duration: "2h 45m", cert: "U/A",
    director: "S. Shankar", cast: "Ram Charan, Kiara Advani, S. J. Suryah",
    colors: ["#2563eb","#060b1f"],
    desc: "A hot-headed idealist turned IAS officer takes on a corrupt minister, with the rulebook as his only weapon.",
    critics: {
      imdb: { score: 5, votes: "29K", asOf: "2026-10-14" },
      reviews: [
        { outlet: "Filmfare", score: 3.5, outOf: 5, url: "https://www.filmfare.com/reviews/south-movies/game-changer-review-70758.html" },
        { outlet: "The Times of India", score: 3, outOf: 5, url: "https://timesofindia.indiatimes.com/entertainment/telugu/movie-reviews/game-changer/movie-review/117105664.cms" },
        { outlet: "Bollywood Hungama", score: 3, outOf: 5, url: "https://www.bollywoodhungama.com/movie/game-changer/critic-review/game-changer-movie-review/game-changer-is-yet-another-mass-appealing-saga-from-shankar/" },
        { outlet: "The Indian Express", score: 2.5, outOf: 5, url: "https://indianexpress.com/article/entertainment/movie-review/game-changer-the-rule-movie-review-a-riveting-ram-charan-anchors-a-middling-shankar-showreel-that-needed-upgrades-9771339/" },
        { outlet: "India Today", score: 2.5, outOf: 5, url: "https://www.indiatoday.in/movies/reviews/story/game-changer-review-ram-charan-excels-shankar-settles-for-mediocrity-2662790-2025-01-10" },
        { outlet: "Cinema Express", score: 2.5, outOf: 5, url: "https://www.cinemaexpress.com/telugu/review/2025/Jan/10/game-changer-movie-review-big-ideas-thin-characters-little-feeling" },
        { outlet: "News18", score: 2.5, outOf: 5, url: "https://www.news18.com/movies/game-changer-review-ram-charan-shines-in-shankars-usual-anti-corruption-film-9184376.html" },
        { outlet: "NDTV", score: 2, outOf: 5, url: "https://www.ndtv.com/entertainment/game-changer-review-ram-charan-shines-but-the-film-doesnt-2-stars-7442411" },
      ],
    },
    boxOffice: {
      asOf: "2026-10-14",
      running: false,
      budget: { low: 350, high: 500 },
      days: [
        { day: 1, net: 51 }, { day: 2, net: 21.6 }, { day: 3, net: 15.9 }, { day: 4, net: 7.65 }, { day: 5, net: 10 },
        { day: 6, net: 7 }, { day: 7, net: 4.5 }, { day: 8, net: 2.75 }, { day: 9, net: 2.4 }, { day: 10, net: 2.6 },
        { day: 11, net: 1 }, { day: 12, net: 0.9 }, { day: 13, net: 0.8 }, { day: 14, net: 0.7 }, { day: 15, net: 0.31 },
        { day: 16, net: 0.33 }, { day: 17, net: 0.42 }, { day: 18, net: 0.25 }, { day: 19, net: 0.24 }, { day: 20, net: 0.23 },
        { day: 21, net: 0.18 }, { day: 22, net: 0.08 }, { day: 23, net: 0.06 }, { day: 24, net: 0.05 }, { day: 25, net: 0.03 },
        { day: 26, net: 0.03 }, { day: 27, net: 0.04 }, { day: 28, net: 0.03 }, { day: 29, net: 0.02 }, { day: 30, net: 0.02 },
        { day: 31, net: 0.02 }, { day: 32, net: 0.02 }, { day: 33, net: 0.01 }, { day: 34, net: 0 }, { day: 35, net: 0.01 },
        { day: 86, net: 0.01 }, { day: 87, net: 0.01 },
      ],
      day1Split: { Telugu: 41.25, Hindi: 7.5, Tamil: 2.12, Kannada: 0.1, Malayalam: 0.03 },
      totals: { indiaNet: 131.2, indiaGross: 156.03, overseasGross: 30.25, worldwideGross: 186.28, producerClaim: null },
      verdict: "Disaster", verdictSource: "Sacnilk",
      sources: [
        { title: "Sacnilk - Game Changer movie page (RC15_2022)", url: "https://www.sacnilk.com/movie/RC15_2022" },
        { title: "Sacnilk - Game Changer Box Office Collection | All Language | Day Wise | Worldwide", url: "https://www.sacnilk.com/news/RC15_2022_Box_Office_Collection_Day_Wise_Worldwide" },
        { title: "Sacnilk - Game Changer Box Office Collection Day 1", url: "https://www.sacnilk.com/quicknews/RC15_2022_Box_Office_Collection_Day_1" },
        { title: "Sacnilk - Box Office: Game Changer Opening Day Early Estimates", url: "https://www.sacnilk.com/news/Box_Office_Game_Changer_Opening_Day_Early_Estimates" },
        { title: "Sacnilk - Game Changer Worldwide Pre-Release Theatrical Business Details", url: "https://www.sacnilk.com/news/Game_Changer_Worldwide_PreRelease_Theatrical_Business_Details" },
        { title: "Sacnilk - Huge Budget For Superstar Ram Charan's Game Changer", url: "https://www.sacnilk.com/news/Huge_Budget_For_Superstar_Ram_Charans_Game_Changer" },
      ],
      notes: [
        "The makers' ₹186 Cr was a Day 1 claim, not a lifetime figure, and was widely disputed.",
        "Box Office India's Hindi figures are lower than Sacnilk's.",
      ],
    },
  },
  {
    id: 6, art: "staff",
    title: "Mirai", genre: "Fantasy Action Adventure", lang: "Telugu", languages: ["Telugu","Hindi","Tamil","Kannada","Malayalam"],
    year: 2025, release: "2025-09-12", duration: "2h 49m", cert: "UA 16+",
    director: "Karthik Gattamneni", cast: "Teja Sajja, Manchu Manoj, Ritika Nayak",
    colors: ["#7c3aed","#0b0518"],
    desc: "A small-time thief learns he is destined to protect Emperor Ashoka's sacred scriptures from a warlord chasing godlike power.",
    critics: {
      imdb: { score: 6.8, votes: "10,909", asOf: "2026-10-14" },
      reviews: [
        { outlet: "The Times of India", score: 3.5, outOf: 5, url: "https://timesofindia.indiatimes.com/entertainment/telugu/movie-reviews/mirai/movie-review/123859061.cms" },
        { outlet: "Firstpost (Ganesh Aaglave)", score: 3.5, outOf: 5, url: "https://www.firstpost.com/entertainment/mirai-movie-review-teja-sajja-takes-you-on-an-entertaining-visually-enriching-journey-13932924.html" },
        { outlet: "Bollywood Hungama (Hindi version)", score: 3, outOf: 5, url: "https://www.bollywoodhungama.com/movie/mirai/critic-review/mirai-movie-review/mirai-works-due-to-the-mythological-factor/" },
        { outlet: "LatestLY (Sreeju Sudhakaran)", score: 2.5, outOf: 5, url: "https://www.latestly.com/entertainment/south/mirai-movie-review-teja-sajjas-smartly-packaged-myth-fantasy-entertainer-needed-a-tighter-knit-framework-latestly-exclusive-7106013.html" },
      ],
    },
    boxOffice: {
      asOf: "2026-10-14",
      running: false,
      budget: { low: 60, high: 60 },
      days: [
        { day: 1, net: 13 }, { day: 2, net: 15 }, { day: 3, net: 16.6 }, { day: 4, net: 6.4 }, { day: 5, net: 6 },
        { day: 6, net: 4.75 }, { day: 7, net: 3.35 }, { day: 8, net: 2.75 }, { day: 9, net: 5.15 }, { day: 10, net: 6 },
        { day: 11, net: 1.8 }, { day: 12, net: 1.75 }, { day: 13, net: 1.5 }, { day: 14, net: 0.45 }, { day: 15, net: 0.8 },
        { day: 16, net: 1.35 }, { day: 17, net: 1.6 }, { day: 18, net: 0.75 }, { day: 19, net: 1.05 }, { day: 20, net: 0.95 },
        { day: 21, net: 1 }, { day: 22, net: 0.65 }, { day: 23, net: 0.63 }, { day: 24, net: 0.62 }, { day: 25, net: 0.1 },
        { day: 26, net: 0.08 }, { day: 27, net: 0.09 }, { day: 28, net: 0.07 }, { day: 29, net: 0.12 }, { day: 30, net: 0.03 },
        { day: 31, net: 0.08 }, { day: 32, net: 0.12 }, { day: 33, net: 0.1 }, { day: 34, net: 0.1 }, { day: 35, net: 0.06 },
        { day: 38, net: 0.01 },
      ],
      day1Split: { Telugu: 11.15, Hindi: 1.65, Tamil: 0.1, Kannada: 0.05, Malayalam: 0.05 },
      totals: { indiaNet: 94.86, indiaGross: 111.41, overseasGross: 32.8, worldwideGross: 144.21, producerClaim: null },
      verdict: "Super Hit", verdictSource: "Sacnilk. Koimoi: 'Plus', short of a Hit",
      sources: [
        { title: "Sacnilk - Mirai (2025) movie page (language-wise day-wise, totals, verdict, budget)", url: "https://www.sacnilk.com/movie/Mirai_2025" },
        { title: "Sacnilk - Mirai Box Office Collection Day Wise Worldwide", url: "https://www.sacnilk.com/news/Mirai_2025_Box_Office_Collection_Day_Wise_Worldwide" },
        { title: "Sacnilk - Mirai Box Office Collection Day 1", url: "https://www.sacnilk.com/quicknews/Mirai_2025_Box_Office_Collection_Day_1?hl=en" },
        { title: "Sacnilk - Mirai Box Office Preview (CBFC U/A 16+, 169 min)", url: "https://www.sacnilk.com/news/Mirai_Box_Office_Preview_Another_PanIndia_Blockbuster_Loading_For_Teja_Sajja" },
        { title: "Sacnilk - Mirai 2 Days Box Office", url: "https://www.sacnilk.com/news/Mirai_2_Days_Box_Office_Teja_Sajja_Delivers_Big_Again" },
        { title: "Sacnilk - Teja Sajja's Mirai Hits 100 Crore At The Worldwide Box Office", url: "https://www.sacnilk.com/news/Teja_Sajjas_Mirai_Hits_100_Crore_At_The_Worldwide_Box_Office" },
      ],
      notes: [
        "Worldwide totals cover the 2025 run; its 2026 Japan release is not included.",
      ],
    },
  },
  {
    id: 7, art: "king",
    title: "The RajaSaab", genre: "Fantasy Horror Comedy", lang: "Telugu", languages: ["Telugu","Hindi","Tamil","Kannada","Malayalam"],
    year: 2026, release: "2026-01-09", duration: "3h 9m", cert: "UA 16+",
    director: "Maruthi", cast: "Prabhas, Sanjay Dutt, Malavika Mohanan, Nidhhi Agerwal",
    colors: ["#0f766e","#020f0d"],
    desc: "Hunting for his long-lost grandfather, a carefree young man walks into a haunted palace and far more than he bargained for.",
    critics: {
      imdb: { score: 3.1, votes: "12,197", asOf: "2026-10-14" },
      reviews: [
        { outlet: "India Today", score: 1.5, outOf: 5, url: "https://www.indiatoday.in/movies/reviews/story/prabhas-the-rajsaab-review-horror-comedy-fails-weak-story-poor-effects-2849006-2026-01-09" },
        { outlet: "Hindustan Times", score: 2, outOf: 5, url: "https://www.hindustantimes.com/entertainment/telugu-cinema/the-raja-saab-movie-review-prabhas-one-liners-brief-moments-of-flair-cannot-save-this-unhinged-mess-101767927608855.html" },
        { outlet: "Bollywood Hungama", score: 2, outOf: 5, url: "https://www.bollywoodhungama.com/movie/the-raja-saab/critic-review/the-raja-saab-movie-review/the-rajasaab-has-an-interesting-premise-but-suffers-from-messy-writing/" },
        { outlet: "Deccan Chronicle", score: 2, outOf: 5, url: "https://www.deccanchronicle.com/entertainment/prabhas-raja-saab-review-rating-1929354" },
        { outlet: "The Hans India", score: 1.5, outOf: 5, url: "https://www.thehansindia.com/cinema/the-raja-saabreview-a-grand-idea-lost-in-aimless-spectacle-1038039" },
        { outlet: "The Week", score: 1, outOf: 5, url: "https://www.theweek.in/review/movies/2026/01/09/the-raja-saab-review-did-a-teenager-come-up-with-this-idea.html" },
        { outlet: "The Indian Express", score: 2, outOf: 5, url: "https://indianexpress.com/article/entertainment/movie-review/the-raja-saab-movie-review-prabhas-affable-presence-cant-save-this-film-from-spiraling-out-of-control-10463542/" },
        { outlet: "NDTV", score: 2, outOf: 5, url: "https://www.ndtv.com/entertainment/the-raja-saab-review-only-for-prabhas-fans-2-stars-10565255" },
      ],
    },
    boxOffice: {
      asOf: "2026-10-14",
      running: false,
      previewsDate: "2026-01-08",
      budget: { low: 300, high: 400 },
      days: [
        { day: 0, net: 9.15 }, { day: 1, net: 53.75 }, { day: 2, net: 26 }, { day: 3, net: 19.1 }, { day: 4, net: 6.6 },
        { day: 5, net: 4.8 }, { day: 6, net: 5.35 }, { day: 7, net: 5.5 }, { day: 8, net: 3.5 }, { day: 9, net: 3 },
        { day: 10, net: 2.6 }, { day: 11, net: 1.35 }, { day: 12, net: 0.8 }, { day: 13, net: 0.7 }, { day: 14, net: 0.63 },
        { day: 15, net: 0.17 }, { day: 16, net: 0.24 }, { day: 17, net: 0.36 }, { day: 18, net: 0.27 }, { day: 19, net: 0.35 },
        { day: 20, net: 0.35 }, { day: 21, net: 0.36 }, { day: 22, net: 0.25 }, { day: 23, net: 0.27 }, { day: 24, net: 0.3 },
        { day: 25, net: 0.25 }, { day: 26, net: 0.01 }, { day: 27, net: 0.02 }, { day: 28, net: 0.01 },
      ],
      day1Split: { Telugu: 47, Hindi: 6, Tamil: 0.55, Kannada: 0.1, Malayalam: 0.1 },
      totals: { indiaNet: 146.04, indiaGross: 174.14, overseasGross: 34.25, worldwideGross: 208.39, producerClaim: null },
      verdict: "Flop", verdictSource: "Sacnilk, Koimoi",
      sources: [
        { title: "Sacnilk - The Raja Saab movie page (language-wise, state-wise gross, totals, verdict)", url: "https://www.sacnilk.com/movie/The_Raja_Saab_2024" },
        { title: "Sacnilk - The Raja Saab Box Office Collection Day Wise (quicknews)", url: "https://www.sacnilk.com/quicknews/The_Raja_Saab_2024_Box_Office_Collection_Day_Wise_Worldwide" },
        { title: "Wikipedia - The Raja Saab", url: "https://en.wikipedia.org/wiki/The_Raja_Saab" },
        { title: "Hindustan Times - The Raja Saab worldwide box office collection Day 4", url: "https://www.hindustantimes.com/entertainment/telugu-cinema/the-raja-saab-worldwide-box-office-collection-day-4-prabhas-film-faring-worse-than-adipurush-saaho-170-crore-101768279713775.html" },
        { title: "Hindustan Times - The Raja Saab extended cut to release on OTT", url: "https://www.hindustantimes.com/entertainment/telugu-cinema/the-raja-saab-extended-cut-to-release-on-jiohotstar-ott-internet-trolls-maruthi-snyder-over-prabhas-200-crore-dud-101770277248878.html" },
        { title: "The Hollywood Reporter India - The Raja Saab crosses ₹100 Cr in India", url: "https://www.hollywoodreporterindia.com/features/insight/the-raja-saab-box-office-prabhas-horror-comedy-crosses-100-crore-in-india-records-disappointing-trend" },
      ],
      notes: [
        "Paid previews on 8 Jan 2026 (₹9.15 Cr net) are reported separately from Day 1.",
        "Its first weekend crossed ₹100 Cr only with paid previews counted (₹98.85 Cr without them).",
        "The producer's 'about ₹112 Cr' was an opening-day claim, not a lifetime figure.",
        "Budget reports range from ₹300 Cr to ₹400 Cr; none is official.",
      ],
    },
  },
  {
    id: 8, art: "couple",
    title: "Mana Shankara Vara Prasad Garu", genre: "Action Comedy / Family", lang: "Telugu", languages: ["Telugu"],
    year: 2026, release: "2026-01-12", duration: "2h 44m", cert: "U/A",
    director: "Anil Ravipudi", cast: "Chiranjeevi, Nayanthara, Venkatesh",
    colors: ["#db2777","#1c0511"],
    desc: "An NSG officer, kept from his wife and children by a disapproving father-in-law, hides who he is to win his family back.",
    critics: {
      imdb: { score: 5.7, votes: "4,180", asOf: "2026-10-14" },
      reviews: [
        { outlet: "NDTV (Latha Srinivasan)", score: 2.5, outOf: 5, url: "https://www.ndtv.com/entertainment/mana-shankara-vara-prasad-garu-review-chiranjeevis-performance-cannot-save-this-predictable-sankranthi-film-2-5-stars-10732772" },
        { outlet: "The Indian Express (Swaroop Kodur)", score: 2.5, outOf: 5, url: "https://indianexpress.com/article/entertainment/movie-review/mana-shankara-vara-prasad-garu-review-chiranjeevi-anil-ravipudi-settle-for-easy-contrived-laughs-10468961/" },
        { outlet: "Filmfare (Sashidhar Adivi)", score: 3, outOf: 5 },
        { outlet: "Deccan Chronicle (BVS Prakash)", score: 2, outOf: 5, url: "https://www.deccanchronicle.com/entertainment/tollywood/mana-shankara-vara-prasad-garu-review-chiranjeevi-shines-comedy-falls-flat-1929955" },
        { outlet: "Gulte", score: 3, outOf: 5, url: "https://www.gulte.com/moviereviews/391274/mana-shankara-vara-prasad-garu-review" },
        { outlet: "M9 News", score: 2.5, outOf: 5, url: "https://www.m9.news/reviews/mana-shankara-vara-prasad-garu-movie-review/" },
        { outlet: "Telugu360", score: 3, outOf: 5, url: "https://www.telugu360.com/mana-shankara-vara-prasad-garu-review/" },
      ],
    },
    boxOffice: {
      asOf: "2026-10-14",
      running: false,
      previewsDate: "2026-01-11",
      budget: { low: null, high: 200 },
      days: [
        { day: 0, net: 9.35 }, { day: 1, net: 32.25 }, { day: 2, net: 18.75 }, { day: 3, net: 19.5 }, { day: 4, net: 22 },
        { day: 5, net: 19.5 }, { day: 6, net: 18.9 }, { day: 7, net: 17.65 }, { day: 8, net: 8 }, { day: 9, net: 5.75 },
        { day: 10, net: 4.2 }, { day: 11, net: 3.3 }, { day: 12, net: 2.65 }, { day: 13, net: 4.25 }, { day: 14, net: 6.2 },
        { day: 15, net: 5 }, { day: 16, net: 2.1 }, { day: 17, net: 1.3 }, { day: 18, net: 1.3 }, { day: 19, net: 1.1 },
        { day: 20, net: 1.6 }, { day: 21, net: 2.5 }, { day: 22, net: 0.95 }, { day: 23, net: 0.9 }, { day: 24, net: 0.7 },
        { day: 25, net: 0.65 }, { day: 26, net: 0.48 }, { day: 27, net: 0.82 }, { day: 28, net: 1 }, { day: 29, net: 0.6 },
        { day: 30, net: 0.5 }, { day: 31, net: 0.55 }, { day: 32, net: 0.4 }, { day: 33, net: 0.2 }, { day: 34, net: 0.56 },
        { day: 35, net: 0.12 }, { day: 36, net: 0.59 }, { day: 37, net: 0.53 }, { day: 38, net: 0.02 }, { day: 39, net: 0.02 },
        { day: 40, net: 0.38 }, { day: 41, net: 0.02 }, { day: 42, net: 0.42 }, { day: 43, net: 0.02 }, { day: 44, net: 0.02 },
        { day: 45, net: 0.01 }, { day: 46, net: 0.02 }, { day: 47, net: 0.01 }, { day: 48, net: 0.01 }, { day: 49, net: 0.33 },
        { day: 50, net: 0.27 }, { day: 51, net: 0.01 }, { day: 52, net: 0.01 }, { day: 53, net: 0.01 }, { day: 54, net: 0.02 },
        { day: 55, net: 0.01 }, { day: 56, net: 0.01 }, { day: 57, net: 0.01 }, { day: 58, net: 0.01 }, { day: 59, net: 0.01 },
        { day: 60, net: 0.01 }, { day: 61, net: 0.01 }, { day: 62, net: 0.01 }, { day: 63, net: 0.01 }, { day: 65, net: 0.01 },
        { day: 66, net: 0.04 }, { day: 116, net: 0.01 }, { day: 118, net: 0.01 }, { day: 121, net: 0.01 },
      ],
      day1Split: { Telugu: 32.25 },
      totals: { indiaNet: 218.47, indiaGross: 258.49, overseasGross: 43, worldwideGross: 301.49, producerClaim: 300 },
      verdict: "Super Hit", verdictSource: "Sacnilk. Koimoi: 'Plus'; others call it a Blockbuster",
      sources: [
        { title: "Sacnilk - Mana ShankaraVaraprasad Garu movie page (day-wise, totals, verdict)", url: "https://sacnilk.com/movie/Mana_Shankaravaraprasad_Garu_2026" },
        { title: "Sacnilk - Mana Shankara Vara Prasad Garu Box Office Collection Day 1", url: "https://sacnilk.com/quicknews/Mana_Shankaravaraprasad_Garu_2026_Box_Office_Collection_Day_1" },
        { title: "Sacnilk - Day-wise worldwide collection article (weekly totals)", url: "https://www.sacnilk.com/news/Mana_Shankaravaraprasad_Garu_2026_Box_Office_Collection_Day_Wise_Worldwide" },
        { title: "Sacnilk - Finishes its blockbuster run with 300+ crore worldwide (27 Feb 2026)", url: "https://www.sacnilk.com/news/Mana_ShankaraVaraprasad_Garu_Box_Office_Chiranjeevi_Starrer_Finishes_Its_Blockbuster_Run_With_300_Crore_Worldwide" },
        { title: "Sacnilk - Peddi becomes the highest-grossing Telugu film of 2026 (14 Jun 2026)", url: "https://www.sacnilk.com/news/peddi-box-office-ram-charan-starrer-beats-mana-shankaravaraprasad-garu-to-become-highest-grossing-telugu-movie-of-2026" },
        { title: "Koimoi - Mana Shankara Vara Prasad Garu closing collection (27 Feb 2026)", url: "https://www.koimoi.com/box-office/mana-shankara-vara-prasad-garu-box-office-closing-collection-chiranjeevi-delivers-his-first-300-crore-grosser-makes-history-in-tollywood/" },
      ],
      notes: [
        "Paid previews on 11 Jan 2026 (₹9.35 Cr net) are reported separately from Day 1.",
        "The budget is unofficial: about ₹200 Cr, as reported by Koimoi and others.",
        "Koimoi's closing figures are slightly higher: ₹220.99 Cr India net and ₹303.76 Cr worldwide.",
      ],
    },
  },
  {
    id: 9, art: "athlete",
    title: "Peddi", genre: "Sports Action Drama", lang: "Telugu", languages: ["Telugu","Hindi","Tamil","Kannada","Malayalam"],
    year: 2026, release: "2026-06-04", duration: "3h 9m", cert: "UA 16+",
    director: "Buchi Babu Sana", cast: "Ram Charan, Janhvi Kapoor, Shiva Rajkumar",
    colors: ["#a16207","#1c1203"],
    desc: "A sports official's visit to a remote Andhra village uncovers a fiery local athlete and his community's long fight for recognition.",
    critics: {
      imdb: { score: 5.2, votes: "9,511", asOf: "2026-10-14" },
      reviews: [
        { outlet: "Hindustan Times", score: 3.5, outOf: 5, url: "https://www.hindustantimes.com/entertainment/telugu-cinema/peddi-movie-review-ram-charan-janhvi-kapoor-buchi-babu-sana-film-is-important-asks-pertinent-questions-101780492459643-amp.html" },
        { outlet: "The Hans India", score: 3.5, outOf: 5 },
        { outlet: "123telugu", score: 3.25, outOf: 5, url: "https://www.123telugu.com/reviews/ram-charans-peddi-telugu-movie-review-and-rating.html" },
        { outlet: "India Today", score: 3, outOf: 5, url: "https://www.indiatoday.in/movies/reviews/story/peddi-review-ram-charan-buchi-babu-sana-emotions-hit-sixes-writing-gets-dhobi-pachaad-2921573-2026-06-04" },
        { outlet: "NDTV", score: 3, outOf: 5, url: "https://www.ndtv.com/entertainment/peddi-review-ram-charan-carries-this-ambitious-sports-drama-across-the-finish-line-3-stars-11589902" },
        { outlet: "Times of India", score: 3, outOf: 5, url: "https://timesofindia.indiatimes.com/entertainment/telugu/movie-reviews/peddi/movie-review/131495718.cms" },
        { outlet: "Indian Express", score: 2.5, outOf: 5, url: "https://indianexpress.com/article/entertainment/movie-review/peddi-movie-review-ram-charan-carries-a-worthy-but-uneven-sports-drama-on-his-shoulders-10723215/" },
        { outlet: "Firstpost", score: 2.5, outOf: 5, url: "https://www.firstpost.com/entertainment/peddi-movie-review-ram-charans-muddled-sports-drama-suffers-from-too-many-subplots-and-an-objectified-janhvi-kapoor-14018616.html" },
      ],
    },
    boxOffice: {
      asOf: "2026-10-14",
      running: false,
      previewsDate: "2026-06-03",
      budget: { low: 300, high: 350 },
      days: [
        { day: 0, net: 18.5 }, { day: 1, net: 51 }, { day: 2, net: 26.9 }, { day: 3, net: 29.1 }, { day: 4, net: 32.15 },
        { day: 5, net: 12.35 }, { day: 6, net: 9.7 }, { day: 7, net: 7.55 }, { day: 8, net: 6.3 }, { day: 9, net: 5.15 },
        { day: 10, net: 8.1 }, { day: 11, net: 9.2 }, { day: 12, net: 4.1 }, { day: 13, net: 3.45 }, { day: 14, net: 2.45 },
        { day: 15, net: 2 }, { day: 16, net: 1.5 }, { day: 17, net: 1.95 }, { day: 18, net: 2.82 }, { day: 19, net: 0.83 },
        { day: 20, net: 0.8 }, { day: 21, net: 0.7 }, { day: 22, net: 0.77 }, { day: 23, net: 0.93 }, { day: 24, net: 0.8 },
        { day: 25, net: 1.04 }, { day: 26, net: 0.35 }, { day: 27, net: 0.35 }, { day: 28, net: 0.32 }, { day: 29, net: 0.32 },
        { day: 30, net: 0.55 }, { day: 31, net: 0.44 }, { day: 32, net: 0.26 }, { day: 33, net: 0.36 }, { day: 34, net: 0.36 },
        { day: 35, net: 0.38 }, { day: 36, net: 0.38 }, { day: 37, net: 0.03 }, { day: 38, net: 0.01 }, { day: 39, net: 0.02 },
        { day: 40, net: 0.01 }, { day: 41, net: 0.01 }, { day: 42, net: 0.01 }, { day: 43, net: 0.01 }, { day: 44, net: 0.02 },
        { day: 45, net: 0.01 }, { day: 46, net: 0.01 }, { day: 47, net: 0.04 }, { day: 48, net: 0.05 }, { day: 49, net: 0.01 },
        { day: 50, net: 0.01 }, { day: 51, net: 0.02 },
      ],
      day1Split: { Telugu: 47.2, Hindi: 3, Tamil: 0.45, Kannada: 0.25, Malayalam: 0.1 },
      totals: { indiaNet: 244.64, indiaGross: 289, overseasGross: 52.9, worldwideGross: 341.9, producerClaim: null },
      verdict: "Below Average", verdictSource: "Koimoi: 'Losing', about 70% recovery. Sacnilk: regional hit, pan-India underperformer",
      sources: [
        { title: "Sacnilk - Peddi (2026) movie box office page", url: "https://www.sacnilk.com/movie/Peddi_2026" },
        { title: "Sacnilk - Peddi Box Office Collection Day Wise Worldwide", url: "https://www.sacnilk.com/quicknews/peddi_2026_Box_Office_Collection_Day_Wise_Worldwide" },
        { title: "Sacnilk - Peddi final box office hits 340 crore worldwide", url: "https://www.sacnilk.com/news/peddi-final-box-office-collection-hits-340-crore-worldwide-8th-telugu-film-to-cross-200-crore-in-aptg-as-regional-hit-but-pan-india-underperformer" },
        { title: "Sacnilk - Peddi OTT release date, 340 crore grosser (4 Jul 2026)", url: "https://www.sacnilk.com/news/peddi-ott-release-date-superstar-ram-charans-340-crore-grosser-sets-netflix-debut" },
        { title: "Sacnilk - Peddi highest Telugu grosser of 2026 in North America (18 Jun 2026)", url: "https://www.sacnilk.com/news/peddi-box-office-overtakes-mana-shankara-vara-prasad-garu-in-north-america-becomes-highest-telugu-grosser-of-2026" },
        { title: "Sacnilk - Peddi team includes 6 minutes of additional footage (18 Jun 2026)", url: "https://www.sacnilk.com/news/peddi-team-includes-6-minutes-of-additional-footage-in-cinemas-but-will-the-gimmick-work" },
      ],
      notes: [
        "Paid previews on 3 Jun 2026 (₹18.50 Cr net) are reported separately from Day 1.",
        "A hit in Andhra Pradesh and Telangana, but distributors lost money on the Hindi, other dubbed and overseas versions.",
        "Media reported ₹400 Cr+ worldwide by Day 14. That wasn't confirmed as the makers' figure and is far above the trackers.",
      ],
    },
  },
  {
    id: 11, art: "kalki",
    title: "Ranabaali", genre: "Period Action Drama", lang: "Telugu", languages: ["Telugu","Hindi","Tamil","Kannada","Malayalam"],
    year: 2026, release: "2026-10-16", duration: "2h 50m", cert: "U/A",
    director: "Rahul Sankrityan", cast: "Vijay Deverakonda, Rashmika Mandanna, Arnold Vosloo",
    colors: ["#9a3412","#190702"],
    desc: "In famine-struck Rayalaseema under British rule, a young man leads a bloody uprising against the colonisers.",
  },
  {
    id: 12, art: "trident",
    title: "Vrushakarma", genre: "Mythological Adventure Thriller", lang: "Telugu", languages: ["Telugu","Tamil"],
    year: 2026, release: "2026-12-04",
    director: "Karthik Dandu", cast: "Naga Chaitanya, Meenakshi Chaudhary, Sparsh Shrivastava",
    colors: ["#0ea5e9","#021019"],
    desc: "A treasure hunter is pulled into a mythological adventure. The makers are keeping the plot under wraps.",
  },
  {
    id: 13, art: "pushpa",
    title: "King100", genre: "Action Drama", lang: "Telugu", languages: ["Telugu"],
    year: 2026, release: "2026-12-24",
    director: "R. A. Karthik", cast: "Nagarjuna, Tabu",
    colors: ["#b91c1c","#140303"],
    desc: "Nagarjuna's 100th film: a man once mocked as a penniless loser rises to become the people's king.",
  },
  {
    id: 14, art: "signal",
    title: "Spirit", genre: "Action Cop Drama", lang: "Telugu", languages: ["Telugu","Hindi","Tamil","Kannada","Malayalam"],
    year: 2027, releaseNote: "March 2027 (delay reported)",
    director: "Sandeep Reddy Vanga", cast: "Prabhas, Triptii Dimri, Vivek Oberoi",
    colors: ["#475569","#05070a"],
    desc: "Prabhas plays an intense police officer in a standalone action drama. The story hasn't been revealed yet.",
  },
  {
    id: 15, art: "astronaut",
    title: "Varanasi", genre: "Epic Action Adventure", lang: "Telugu", languages: ["Telugu","Hindi","Tamil","Kannada","Malayalam"],
    year: 2027, release: "2027-04-07",
    director: "S. S. Rajamouli", cast: "Mahesh Babu, Priyanka Chopra Jonas, Prithviraj Sukumaran",
    colors: ["#ea580c","#170802"],
    desc: "When an asteroid threatens Varanasi, one man sets out on an adventure that spans continents and ages.",
  },
  {
    id: 16, art: "devara",
    title: "Dragon", genre: "Period Action Drama", lang: "Telugu", languages: ["Telugu","Hindi","Tamil","Kannada","Malayalam"],
    year: 2027, release: "2027-06-11",
    director: "Prashanth Neel", cast: "N. T. Rama Rao Jr., Rukmini Vasanth, Anil Kapoor",
    colors: ["#065f46","#010d09"],
    desc: "In 1967, amid opium wars that stretch from Afghanistan to the Golden Triangle, an assassin called Dragon makes his move.",
  },
].concat(typeof INDIA_FILMS !== "undefined" ? INDIA_FILMS : []);   // every other Indian language: js/films-india.js (loaded first)

// ---------- Saved data (localStorage) ----------
// Without the server, the admin portal saves its changes here and the website reads them back.
// With it, only per-visitor conveniences live here (theme, reminders, the leaderboard tab).
function loadStore(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return Array.isArray(v) ? v : fallback;
  } catch { return fallback; }
}
function saveStore(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

// Version 1 of this site sold tickets. Its bookings and coupons are dropped; films the admin
// added are kept (with fresh ids, since the new catalogue uses ids 1-16) and our own films
// get this version's researched data.
const V1_FILM_IDS = [1, 2, 3, 10];
function upgradeV1Film(m, id) {
  const { price, rating, status, release, ...rest } = m;
  return {
    ...rest,
    id,
    cert: m.cert || rating || "",
    status: status === "now" ? "released" : "soon",       // used only because v1 films have no exact date
    releaseNote: status === "soon" ? String(release || "") : "",
    critics: {},
    boxOffice: {},
  };
}
(function migrate() {
  try {
    if (localStorage.getItem("manaDataVersion") === String(DATA_VERSION)) return;
    localStorage.removeItem("manaBookings");
    localStorage.removeItem("manaCoupons");
    const old = JSON.parse(localStorage.getItem("manaMovies"));
    if (Array.isArray(old)) {
      let nextId = Math.max(...DEFAULT_MOVIES.map(m => m.id)) + 1;
      const added = old.filter(m => m && !V1_FILM_IDS.includes(m.id)).map(m => upgradeV1Film(m, nextId++));
      localStorage.setItem("manaMovies", JSON.stringify([...DEFAULT_MOVIES, ...added]));
    }
    localStorage.setItem("manaDataVersion", String(DATA_VERSION));
  } catch {}
})();

// Seed wording corrected after it was first published. A browser that saved the films (an admin save,
// a backup restore or the v1 upgrade) keeps its own copy, so the same text is corrected there too.
// Only text that still matches the old wording is changed or dropped: anything the admin rewrote is kept.
const TOTALS_ONLY_NOTE = "Totals only: day-by-day figures aren't listed for this film.";   // the film page already says so
const SEED_NOTES_DROPPED = [   // matched by their opening words
  "Critics and IMDb were harsh (3.1/10), while ",
  "Totals only: day-by-day figures aren't listed",
  "Still in theatres. Figures as of 15-10-2026",
  "Hindi original (Wikipedia: ",   // research notes cut off mid-number
  "Malayalam original (net ",
];
const SEED_TEXT_FIXES = new Map([
  ["Released the same day in Malayalam, Tamil, Telugu, Hindi and Kannada (net: Malayalam 77.",
   "Released the same day in Malayalam, Tamil, Telugu, Hindi and Kannada."],
  ["Released the same day in Malayalam, Telugu, Tamil, Hindi and Kannada (net: 61.",
   "Released the same day in Malayalam, Telugu, Tamil, Hindi and Kannada."],
  ["Paid premieres on 24 Sep 2025 (₹21 Cr net) are reported separately from Day 1.",
   "Paid previews on 24 Sep 2025 (₹21 Cr net) are reported separately from Day 1."],
  ["Paid premieres on 4 Dec 2024 (₹10.65 Cr net) are reported separately from Day 1.",
   "Paid previews on 4 Dec 2024 (₹10.65 Cr net) are reported separately from Day 1."],
  ["Its trade week 1 ran 8 days (Thu to Thu): ₹725.80 Cr with premieres.",
   "Its trade week 1 ran 8 days (Thu to Thu): ₹725.80 Cr with paid previews."],
  ["Sacnilk - Kalki 2898 AD (Project K) movie page: lifetime totals, language split, verdict, ",
   "Sacnilk - Kalki 2898 AD movie page (totals, language split, verdict)"],
  ["Sacnilk - Kalki 2898 AD Box Office Collection Day 1 (language split, India gross, worldwid",
   "Sacnilk - Kalki 2898 AD Box Office Collection Day 1"],
  ["Koimoi - Kalki Day 2 (Day 1 Rs 93 cr; Day 2 Rs 50-55 cr early)",
   "Koimoi - Kalki 2898 AD box office collection Day 2"],
  ["Koimoi - Kalki Day 4 (Day 3 Rs 68 cr; Day 4 Rs 84-86 cr early; 4-day Rs 302-304 cr)",
   "Koimoi - Kalki 2898 AD box office collection Day 4"],
  ["Sacnilk - Pushpa: The Rule - Part 2 Box Office Collection | All Language | Day Wise | Worl",
   "Sacnilk - Pushpa 2: The Rule Box Office Collection Day Wise Worldwide"],
  ["Sacnilk - Devara Part 1 Box Office Collection, Day Wise, Worldwide (re-fetched: India net ",
   "Sacnilk - Devara Part 1 Box Office Collection Day Wise Worldwide"],
  ["Sacnilk - Day 1 (82.50 net, 98.02 gross, overseas 44, WW 142.02, footfalls 4,270,121)",
   "Sacnilk - Devara Part 1 Box Office Collection Day 1"],
  ["Sacnilk - Day 4 (12.75 net, language split, running total 173.35)",
   "Sacnilk - Devara Part 1 Box Office Collection Day 4"],
  ["Sacnilk - Devara Part 1 Tops 400 Crore Worldwide Gross (17 days: India gross ~324, oversea",
   "Sacnilk - Devara Part 1 Tops 400 Crore Worldwide Gross"],
  ["Koimoi - Day 1 (initial Rs 25 Cr estimate)",
   "Koimoi - Sankranthiki Vasthunam Day 1 (early estimate)"],
  ["Koimoi - Day 2 (Rs 23 + Rs 20 Cr)",
   "Koimoi - Sankranthiki Vasthunam box office collection Day 2"],
  ["Sacnilk - Mirai Box Office Collection Day Wise Worldwide (combined India net day-wise, wee",
   "Sacnilk - Mirai Box Office Collection Day Wise Worldwide"],
  ["Sacnilk - Mirai Box Office Collection Day 1 (language split, Day 1 India gross/overseas/wo",
   "Sacnilk - Mirai Box Office Collection Day 1"],
  ["Hindustan Times - Worldwide box office Day 4 (Day 4 Rs 6.60 cr; Rs 114.60 cr net in 4 days",
   "Hindustan Times - The Raja Saab worldwide box office collection Day 4"],
  ["Hindustan Times - Extended cut on OTT (Rs 208.38 cr worldwide; 'dud')",
   "Hindustan Times - The Raja Saab extended cut to release on OTT"],
  ["The Hollywood Reporter India - crosses Rs 100 crore in India (Day 1-3, weekend 108, budget",
   "The Hollywood Reporter India - The Raja Saab crosses ₹100 Cr in India"],
  ["Sacnilk - Day 1 box office report (previews separate; cumulative 41.60 net)",
   "Sacnilk - Mana Shankara Vara Prasad Garu Box Office Collection Day 1"],
  ["Sacnilk - Peddi beats MSVPG to become highest-grossing Telugu movie of 2026 (14 Jun 2026)",
   "Sacnilk - Peddi becomes the highest-grossing Telugu film of 2026 (14 Jun 2026)"],
  ["Koimoi - Closing collection: Chiranjeevi's first 300 crore grosser (27 Feb 2026; 220.99 ne",
   "Koimoi - Mana Shankara Vara Prasad Garu closing collection (27 Feb 2026)"],
  ["Sacnilk - Peddi final box office hits 340 crore worldwide; regional hit but pan-India unde",
   "Sacnilk - Peddi final box office hits 340 crore worldwide"],
]);
// Seed figures corrected the same way. A fix applies while its field still holds the old seed value
// (so once, and never over the admin's own edit); that field and the ones in `copy` then take the
// current seed's value (a value the seed no longer has is removed).
const RT_OG = "https://www.rottentomatoes.com/m/they_call_him_og";
const BH_WORLDWIDE = [{ title: "Bollywood Hungama", url: "https://www.bollywoodhungama.com/box-office-collections/worldwide/" }];
const SEED_FIGURE_FIXES = [
  // Sardaar Ji 3 never released in India: its India figures are missing, not 0
  { id: 2124, field: "boxOffice.notes", was: [TOTALS_ONLY_NOTE], copy: ["boxOffice.totals.indiaNet", "boxOffice.totals.indiaGross"] },
  // Bharat (2019)'s opening day had been merged into Bharat Ane Nenu (2018); Bharat gets its own entry back
  { id: 2032, field: "boxOffice.sources", was: [{ title: "Wikipedia", url: "https://en.wikipedia.org/wiki/Bharat_Ane_Nenu" }, { title: "Sacnilk", url: "https://www.sacnilk.com/movie/Bharat" }], copy: ["boxOffice.opening"], addFilm: 2171 },
  // Reported opening days that were missing: Gadar 2, Sultan, Sanju, Tiger Zinda Hai, Dhoom 3
  ...[2009, 2010, 2011, 2013, 2014].map(id => ({ id, field: "boxOffice.sources", was: BH_WORLDWIDE, copy: ["boxOffice.opening"] })),
  // Still in theatres
  { id: 2015, field: "boxOffice.notes", was: ["Trade estimates of the worldwide gross range from ₹485.21 Cr to ₹509 Cr.", "Hindi only.", TOTALS_ONLY_NOTE], copy: ["boxOffice.running"] },
  { id: 2090, field: "boxOffice.notes", was: ["Trade estimates of the worldwide gross range from ₹50 Cr to ₹73.96 Cr.", TOTALS_ONLY_NOTE], copy: ["boxOffice.running"] },
  // Overseas not tracked, so the "worldwide" figure is the India gross
  { id: 2133, field: "boxOffice.notes", was: ["Trade estimates of the worldwide gross range from ₹25 Cr to ₹34.2 Cr.", TOTALS_ONLY_NOTE] },
  { id: 2135, field: "boxOffice.notes", was: ["Trade estimates of the worldwide gross range from ₹21.63 Cr to ₹23 Cr.", TOTALS_ONLY_NOTE] },
  { id: 2136, field: "boxOffice.notes", was: ["Trade estimates of the worldwide gross range from ₹21 Cr to ₹25 Cr.", TOTALS_ONLY_NOTE] },
  // Critic links that opened Rotten Tomatoes instead of the outlet's own review
  { id: 10, field: "critics.reviews.2", was: { outlet: "Filmfare", score: 3, outOf: 5, url: RT_OG } },
  { id: 10, field: "critics.reviews.5", was: { outlet: "NDTV", score: 2.5, outOf: 5, url: RT_OG } },
  { id: 10, field: "critics.reviews.6", was: { outlet: "Firstpost", score: 2.5, outOf: 5, url: RT_OG } },
  { id: 8, field: "critics.reviews.2", was: { outlet: "Filmfare (Sashidhar Adivi)", score: 3, outOf: 5, url: "https://www.rottentomatoes.com/m/mana_shankaravaraprasad_garu/reviews" } },
];
// Applies the fixes to a saved copy of the films; true when something changed
function fixSavedSeedFigures(saved) {
  const read = (obj, keys) => keys.reduce((v, k) => (v && typeof v === "object" ? v[k] : undefined), obj);
  const copy = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  let changed = false;
  for (const fx of SEED_FIGURE_FIXES) {
    const film = saved.find(m => m && m.id === fx.id), seed = DEFAULT_MOVIES.find(m => m.id === fx.id);
    if (!film || !seed || JSON.stringify(read(film, fx.field.split("."))) !== JSON.stringify(fx.was)) continue;
    for (const path of [fx.field, ...(fx.copy || [])]) {
      const keys = path.split("."), last = keys.pop();
      const parent = read(film, keys);
      if (!parent || typeof parent !== "object") continue;
      const now = read(seed, [...keys, last]);
      if (now === undefined) delete parent[last]; else parent[last] = copy(now);
    }
    const added = fx.addFilm && DEFAULT_MOVIES.find(m => m.id === fx.addFilm);
    if (added && !saved.some(m => m && m.id === added.id)) saved.push(copy(added));
    changed = true;
  }
  return changed;
}
(function fixSavedSeedText() {
  try {
    const saved = JSON.parse(localStorage.getItem("manaMovies"));
    if (!Array.isArray(saved)) return;
    let changed = fixSavedSeedFigures(saved);   // first: some fixes are recognised by their old notes
    const fix = s => {
      if (!SEED_TEXT_FIXES.has(s)) return s;
      changed = true;
      return SEED_TEXT_FIXES.get(s);
    };
    const dropped = n => typeof n === "string" && SEED_NOTES_DROPPED.some(p => n.startsWith(p));
    saved.forEach(m => {
      const bo = m && m.boxOffice;
      if (!bo || typeof bo !== "object") return;
      if (Array.isArray(bo.notes)) {
        const kept = bo.notes.filter(n => !dropped(n));
        if (kept.length !== bo.notes.length) changed = true;
        bo.notes = kept.map(fix);
      }
      if (Array.isArray(bo.sources)) bo.sources.forEach(s => { if (s && typeof s === "object") s.title = fix(s.title); });
    });
    if (changed) localStorage.setItem("manaMovies", JSON.stringify(saved));
  } catch {}
})();

// The catalogue grew to every Indian language (ids 1001+). A browser that saved its own copy of the
// films keeps it, so those films are added to that copy once. Only ids 1001+ are added, so films the
// admin deleted from the original catalogue don't come back.
const CATALOG_VERSION = 3;   // 3: this week's releases (ids 3001+)
(function addAllIndiaFilms() {
  try {
    if (Number(localStorage.getItem("manaCatalog")) >= CATALOG_VERSION) return;
    const saved = JSON.parse(localStorage.getItem("manaMovies"));
    if (Array.isArray(saved)) {
      const have = new Set(saved.map(m => m && m.id));
      const missing = DEFAULT_MOVIES.filter(m => m.id > 1000 && !have.has(m.id));
      if (missing.length) localStorage.setItem("manaMovies", JSON.stringify([...saved, ...missing]));
    }
    localStorage.setItem("manaCatalog", String(CATALOG_VERSION));
  } catch {}
})();

const MOVIES = ONLINE ? MANA_SERVER.movies : loadStore("manaMovies", DEFAULT_MOVIES);

function getMovie(id) {
  return MOVIES.find(m => m.id === Number(id));
}

// "They Call Him OG" -> "they-call-him-og"
function slug(title) {
  return String(title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Text from the admin portal or from visitors is escaped before it goes into the page
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Optional poster photo: a file in images/posters/ (see images/README.txt) or an https address.
// Anything else is ignored, so a typo can't break the page's styles.
// Order: on the server, the film's real TMDB poster (served at the size asked for by our own /img route);
// else a local photo set in the admin portal (the only picture without the server); else nothing and the
// drawn art shows. The real poster comes first because the original catalogue's local photos for OG,
// Pushpa 2, Kalki and Devara are photos of their stars, not posters.
const POSTER_SIZES = ["w92", "w185", "w342", "w500", "w780"];
function posterImage(m, size = "w342") {
  const file = ONLINE ? String(m.images?.poster || "") : "";
  if (/^[A-Za-z0-9]{8,64}\.(jpg|png)$/.test(file)) return `img/${POSTER_SIZES.includes(size) ? size : "w342"}/${file}`;
  const src = String(m.image || "");
  return /^(https:\/\/[\w.-]+\/)?[\w\-./%]+\.(jpe?g|png|webp|avif|gif)$/i.test(src) ? src : "";
}
const safeColor = c => (/^#[0-9a-f]{3,8}$/i.test(c || "") ? c : "#24242e");

// HTML attribute that lets ui.js check the photo loaded
function imgAttr(m, size) {
  const src = posterImage(m, size);
  return src ? `data-img="${src}"` : "";
}

// The photo (if any) sits on top of the film's colour gradient
function posterStyle(m, size) {
  const src = posterImage(m, size);
  const [c1, c2] = m.colors || [];
  const photo = src ? `url('${src}') center top / cover no-repeat, ` : "";
  return `background: ${photo}linear-gradient(160deg, ${safeColor(c1)}, ${safeColor(c2)});`;
}
