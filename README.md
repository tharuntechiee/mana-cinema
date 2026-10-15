# MANA CINEMA — Indian box office & ratings

Box office collections, verdicts and ratings for Indian films in nine languages: Hindi, Telugu, Tamil, Malayalam, Kannada, Marathi, Bengali, Punjabi and Gujarati.

**Live site:** https://tharuntechiee.github.io/mana-cinema/

## What's inside

- **Stars cover:** the MANA CINEMA title with Pawan Kalyan in the centre (in a red ring, opening the They Call Him OG page) and 21 heroes from all nine languages around him. Each hero opens their language's lists.
- **New this week:** this week's releases in every language, with release status, first critics' scores and Day 1 figures as they are reported.
- **Box office leaderboard:** rank films by opening day, opening weekend, first 7 days, lifetime India net, worldwide gross or rating. Filter by language and year, and include or leave out paid previews.
- **Lists** (`lists.html`): for every language, the all-time top grossers (top 25 for Hindi, Telugu, Tamil, Malayalam and Kannada; top 10 for Marathi, Bengali, Punjabi and Gujarati) and the biggest opening days.
- **Film pages:** for about 30 big recent releases, Day 1, Day 2 … every reported day, with a chart, weekend and trade-week totals, milestones (₹100 Cr on Day 2 …), how the run held up, Day 1 by language, budget, verdict and sources. Older and smaller films show their reported totals, opening day, verdict and rank in their language.
- **Ratings:** critics' scores and IMDb, plus audience star ratings and short reviews.
- **Coming soon:** upcoming releases with a countdown and a "Remind me" button.
- **Admin portal** (`admin.html`): edit films, paste day-wise collections, enter reported opening days, manage critics' scores, moderate reviews, read feedback, and back up or restore all data.
- **District Black** look by default, with more themes in the palette menu.

## Run it locally

Double-click `start-website.bat`, or run:

```bash
python -m http.server 8080
```

Then open http://localhost:8080. It's a static site: no build step and no server code.

## About the numbers

Indian box office has no official, audited figures. The collections here are **trade estimates** collected on 14–15 Oct 2026: mostly Sacnilk (India net, ₹ crore), cross-checked against Wikipedia's language lists, Koimoi, Bollywood Hungama and Box Office India. Each film page lists its sources and notes, and each language list says how it was built. Makers' announced figures are shown separately and never ranked.

How every total is worked out (paid previews, 4-day Thursday weekends, Friday-to-Thursday trade weeks, verdicts) is documented in `js/boxoffice.js`.

## Good to know

- Everything is stored in the browser (`localStorage`): admin edits, audience ratings and feedback stay on the device where they were made. A shared database would need a backend.
- The admin password in `js/admin.js` is a demo password, not real security.

## Project layout

```
index.html        Home: cover, featured films, leaderboard, films, coming soon, feedback
lists.html        Language lists: all-time top grossers and biggest opening days
film.html         Film page (film.html?id=N)
admin.html        Admin portal
css/              style.css (design system + home), lists.css, film.css, admin.css
js/films-india.js Films in every language (loaded before data.js)
js/data.js        Telugu catalogue, saved-data helpers and data upgrades
js/boxoffice.js   Box office and ratings logic
js/ui.js          Themes, navbar, toasts, shared helpers
js/art.js         Drawn poster artwork
js/main.js · js/lists.js · js/film.js · js/admin.js   Page scripts
images/           Poster photos (see images/README.txt)
```

## Credits

Poster and hero photos are free-licensed files from Wikimedia Commons, cropped to circles; every photo is credited in the Photo credits section on the home page. Visual style inspired by District's movie app; this project is not affiliated with District or Zomato. Synopses are our own short summaries.
