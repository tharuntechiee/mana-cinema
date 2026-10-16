# MANA CINEMA — Indian box office & ratings

Box office collections, verdicts and ratings for Indian films in nine languages: Hindi, Telugu, Tamil, Malayalam, Kannada, Marathi, Bengali, Punjabi and Gujarati.

**Live site:** https://tharuntechiee.github.io/mana-cinema/ (the static version, without the server)

## What's inside

- **Stars cover:** the MANA CINEMA title with Pawan Kalyan in the centre (in a red ring, opening the They Call Him OG page) and 21 heroes from all nine languages around him. Each hero opens their language's lists.
- **New this week:** this week's releases in every language, with release status, first critics' scores and Day 1 figures as they are reported.
- **Box office leaderboard:** rank films by opening day, opening weekend, first 7 days, lifetime India net, worldwide gross or rating. Filter by language and year, and include or leave out paid previews.
- **Lists** (`lists.html`): for every language, the all-time top grossers (top 25 for Hindi, Telugu, Tamil, Malayalam and Kannada; top 10 for Marathi, Bengali, Punjabi and Gujarati) and the biggest opening days.
- **Film pages:** for about 30 big recent releases, Day 1, Day 2 … every reported day, with a chart, weekend and trade-week totals, milestones (₹100 Cr on Day 2 …), how the run held up, Day 1 by language, budget, verdict and sources. Older and smaller films show their reported totals, opening day, verdict and rank in their language.
- **Search:** a magnifier beside the theme button (or press `/` or Ctrl+K) opens a search box. It finds films by title, director, actor, language or year, and on the server by anyone in a film's full cast and crew, such as a music director.
- **Cast & crew:** from IMDb (principal cast and crew) or TMDB (everyone), with each actor's role and the crew by department.
- **Ratings:** critics' scores, IMDb's rating refreshed daily from IMDb, plus audience star ratings and short reviews.
- **Comments:** YouTube-style comments on every film page: comment, reply in threads, like or dislike, sort by Top or Newest, edit or delete your own. No account needed. MANA CINEMA can pin, heart, hide and delete comments and reply as "Official" from the admin portal.
- **Trailers:** each film's YouTube trailer with its views and likes (with a YouTube key).
- **Coming soon:** upcoming releases with a countdown and a "Remind me" button.
- **Admin portal** (`admin.html`): edit films, paste day-wise collections, enter reported opening days, manage critics' scores, moderate reviews, read feedback, run the IMDb / TMDB / YouTube syncs, and back up or restore all data.
- **District Black** look by default, with more themes in the palette menu.

## Run it locally

You need [Node.js](https://nodejs.org) 22.13 or newer. Double-click `start-website.bat`, or run:

```bash
npm install
npm start
```

Then open http://localhost:8080. On the first start the server creates the database (`data/mana-cinema.db`) with every film from the catalogue.

Copy `.env.example` to `.env` and set `ADMIN_PASSWORD` to sign in to the admin portal. The keys for TMDB and YouTube are optional.

To load IMDb ratings and cast & crew, run this once. It downloads about 1.3 GB of IMDb's data files and takes a few minutes:

```bash
npm run sync
```

The same syncs can be run from the admin portal's Settings page. IMDb ratings then refresh by themselves once a day while the server runs.

The pages still work without the server, for example on GitHub Pages or with `python -m http.server 8080`. They then use the built-in catalogue and save to the browser, as before.

## Backend

| Part | What it uses |
| --- | --- |
| Server | Node.js with Express 5 (`server/`) |
| Database | SQLite, built into Node (`node:sqlite`), one file in `data/` |
| IMDb | IMDb's official non-commercial datasets: no key needed |
| TMDB | Optional free key, for every actor and the whole crew |
| YouTube | Optional free YouTube Data API key, for trailers |

**Why SQLite:** the catalogue is a few hundred films and the writes are small (ratings, feedback, admin edits). A single-file database needs no separate install, is fast for reads, and backs up by copying one file. If the site moves to a host without a persistent disk, or needs several servers, move to PostgreSQL; the tables carry over as they are.

### Database tables

| Table | Holds |
| --- | --- |
| `movies` | One row per film: title, language, year, release date, IMDb and TMDB IDs, display details and box-office summary |
| `box_office_days` | Day-wise India net, one row per film per day (day 0 = paid previews) |
| `critic_reviews` | Critics' scores in the order entered |
| `imdb_ratings` | IMDb rating, votes, date, and where it came from (IMDb, the admin, or the catalogue) |
| `people`, `credits` | Cast and crew: who, which film, role or job, department, billing order |
| `trailers` | YouTube trailer with views, likes and comments |
| `audience_reviews` | Visitors' ratings, one per visitor per film |
| `comments`, `comment_votes` | Comments and replies, with likes and dislikes |
| `messages` | The feedback form |
| `admin_sessions`, `sync_runs`, `meta` | Sign-ins, sync history, settings |

### API

Public:

| Method and path | Does |
| --- | --- |
| `GET /api/movies` | Every film (`?lang=Telugu` for one language) |
| `GET /api/movies/:id` | One film |
| `GET /api/movies/:id/credits` | Full cast and crew |
| `GET /api/movies/:id/reviews` | Audience reviews |
| `POST /api/movies/:id/reviews` | Rate a film: `{ name, stars, text }` |
| `GET /api/search?q=` | Films by anyone in the cast and crew |
| `GET /api/people/:id` | A person and their films |
| `GET` / `POST /api/movies/:id/comments` | Comments (`?sort=top` or `new`), post a comment or reply |
| `GET /api/comments/:id/replies` | A thread's replies |
| `PATCH` / `DELETE /api/comments/:id` | Edit or delete your own comment |
| `PUT /api/comments/:id/vote` | Like or dislike: `{ vote: 1, -1 or 0 }` |
| `POST /api/messages` | Feedback: `{ name, email, topic, movieId, message }` |
| `GET /api/health` | Server status |

Admin (needs the sign-in cookie):

| Method and path | Does |
| --- | --- |
| `POST /api/admin/login`, `/logout` | Sign in and out |
| `GET /api/admin/data` | Every film, review and message |
| `PUT` / `DELETE /api/admin/movies/:id` | Save or delete a film |
| `PATCH` / `DELETE /api/admin/reviews/:id` | Hide or delete a review |
| `PATCH` / `DELETE /api/admin/messages/:id` | Mark read or delete a message |
| `GET` / `POST /api/admin/comments` | Every comment; reply as MANA CINEMA |
| `PATCH` / `DELETE /api/admin/comments/:id` | Pin, heart, hide or delete a comment |
| `GET /api/admin/backup` | Films, reviews, messages and comments in one file |
| `POST /api/admin/restore`, `/reset/:what` | Restore a backup, reset data |
| `GET` / `POST /api/admin/sync` | Sync status, start a sync |

### How IMDb matching works

The sync matches each film to IMDb by title, year and runtime, then accepts close spellings such as "Pushpa: The Rule - Part 2". Where the catalogue has an IMDb snapshot, it must agree. Once the cast and crew are read, the catalogue's director or stars must be among them, or the match is undone. On 16 Oct 2026 this matched 216 of 220 films with no wrong matches. Add the other films' IMDb IDs in the film form.

### Checks

```bash
npm run check
```

This starts the app with a throwaway database and tries every API route. Your own database is not touched.

## About the numbers

Indian box office has no official, audited figures. The collections here are **trade estimates** collected on 14–15 Oct 2026: mostly Sacnilk (India net, ₹ crore), cross-checked against Wikipedia's language lists, Koimoi, Bollywood Hungama and Box Office India. Each film page lists its sources and notes, and each language list says how it was built. Makers' announced figures are shown separately and never ranked.

How every total is worked out (paid previews, 4-day Thursday weekends, Friday-to-Thursday trade weeks, verdicts) is documented in `js/boxoffice.js`.

## Good to know

- `.env` holds the admin password and keys. It is never served and never committed. The database in `data/` is not committed either.
- IMDb's datasets are for personal and non-commercial use. A commercial site needs IMDb's paid licence.
- TMDB's free licence is non-commercial too: ads, paid features or any revenue need a written agreement with TMDB. Its terms also ask for the TMDB logo next to the credit line, which isn't added yet.
- The admin password in `js/admin.js` only guards the browser-only demo. On the server, the password in `.env` is checked by the server.
- Audience ratings and comments use an anonymous cookie, so each visitor has one rating per film and can edit or delete only their own comments. Clearing cookies means losing that ability, not the comment. Only the admin can post as MANA CINEMA.
- Comments are plain text (no links or HTML), up to 1,500 characters, and rate-limited per visitor.

## Project layout

```
index.html        Home: cover, featured films, leaderboard, films, coming soon, feedback
lists.html        Language lists: all-time top grossers and biggest opening days
film.html         Film page (film.html?id=N)
admin.html        Admin portal
css/              style.css (design system + home), lists.css, film.css, admin.css
js/films-india.js Films in every language (loaded before data.js)
js/data.js        Telugu catalogue, API helper, saved-data helpers and data upgrades
js/boxoffice.js   Box office and ratings logic
js/ui.js          Themes, navbar, toasts, shared helpers
js/art.js         Drawn poster artwork
js/main.js · js/lists.js · js/film.js · js/admin.js   Page scripts
images/           Poster photos (see images/README.txt)
server/index.js   Starts the server
server/app.js     Express app: pages, assets and the API
server/db.js      SQLite schema, reading and writing films
server/seed.js    Fills the database from the catalogue
server/comments.js Comments: threads, likes, sorting, moderation
server/routes/    public.js (website API) and admin.js (admin API)
server/sync/      IMDb, TMDB and YouTube syncs; cli.js is npm run sync
server/check.js   npm run check
data/             The database and IMDb download cache (not committed)
```

## Credits

Poster and hero photos are free-licensed files from Wikimedia Commons, cropped to circles; every photo is credited in the Photo credits section on the home page. IMDb ratings and cast & crew: information courtesy of IMDb (https://www.imdb.com), used with permission. With a TMDB key, this website uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB. Visual style inspired by District's movie app; this project is not affiliated with District or Zomato. Synopses are our own short summaries.
