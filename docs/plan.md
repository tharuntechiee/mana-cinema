# MANA CINEMA plan

Status: final, 2026-10-27. Reviewed by three subagents; decisions recorded in B11. Nothing in Part B is built yet. Nothing in this document is built yet unless Part A says so.

How to read it: **Part A** summarises the plan as built so far (it lived only in our conversation and the README until now). **Part B is new**: fetching movie data and every image for each film, including cast and crew photos. Every new section is marked **[New]**.

---

## Part A: the plan so far (built)

| Area | What exists |
|---|---|
| Server | Node.js with Express 5 in `server/`. Serves the pages, a public API and an admin API (36 routes). Admin sign-in is a password in `.env` plus an HttpOnly session cookie. |
| Database | SQLite, one file: `data/mana-cinema.db`, 14 tables. Seeded from `js/films-india.js` and `js/data.js`. |
| Two modes | With the server, pages load `api/bootstrap.js` and read the database. Without it (GitHub Pages), they fall back to the built-in catalogue and browser storage. |
| Data syncs | IMDb datasets: title match, daily ratings, principal cast and crew. TMDB: full cast and crew for 219 of 220 films, plus IMDb IDs it found. YouTube: trailers and views, waiting for a key. |
| Visitor features | Ratings, YouTube-style comments, feedback, search by title, actor and director. |
| Checks | `npm run check`: 68 automated checks on a throwaway database. |

Open items carried forward: YouTube key; TMDB logo beside its credit line; approval before TMDB photos are shown; your yes before any push; hosting with a persistent disk; HTTPS and `TRUST_PROXY`; scheduled database backups; licences if the site ever earns money.

What the site shows today, image-wise:
- Posters are CSS backgrounds (`posterStyle()` in `js/data.js`, `posterHTML()` in `js/ui.js`) on the film's colour gradient, with drawn hero artwork (`js/art.js`) as the usual fallback. Only 4 films have a local photo in `images/posters/`.
- The film page header uses the poster again as a blurred backdrop (`#filmBackdrop`, `css/film.css`).
- Cast and crew avatars are initials only (`personHTML()` in `js/film.js`). TMDB profile paths are stored for 2,751 of 7,740 people but deliberately not shown.

---

## Part B [New]: movie data and every image, with cast and crew photos

### B1 [New] What the data source provides

"That data" is **TMDB**, already used by `server/sync/tmdb.js`, which calls `/movie/{id}?append_to_response=credits,external_ids` and stores each person's `profile_path`. The facts below were checked with the project's own key on 2026-10-23 and 2026-10-27, not assumed. TMDB policy points come from TMDB's documentation, terms and staff forum replies, read through search extracts (their pages would not open from this machine).

**Image types.** For a movie, `/movie/{id}/images` returns **posters, backdrops and logos**. TMDB "stills" exist only for TV episodes, so the plan does not promise stills for films. People have **profile photos**. The `profile_path` comes with every credit, so cast and crew photos need **no extra API calls**.

**Sizes** (from `/configuration`) and measured file sizes, JPEG unless noted:

| Kind | Sizes offered | Measured bytes |
|---|---|---|
| Poster | w92, w154, w185, w342, w500, w780, original | w92 5 KB, w185 16 KB, w342 51 KB (WebP 28 KB), w500 80 KB, w780 240 KB, original 1.4 MB |
| Backdrop | w300, w780, w1280, original | w300 13 KB, w780 63 KB, w1280 147 KB, original 501 KB |
| Logo (PNG) | w45 to w500, original | w92 9 KB, w300 65 KB, w500 154 KB, original 2.1 MB |
| Profile | w45, w185, h632, original | w45 2 KB, w185 10 KB, h632 38 KB |

**How many images a film has** (unfiltered `/images`):

| Film | Posters | Backdrops | Logos | Notes |
|---|---|---|---|---|
| They Call Him OG | 22 | 74 | 6 | Posters mostly English-tagged |
| Kalki 2898 AD | 90 | 60 | 14 | 72 posters tagged Telugu; some ru, ja, he |
| Pushpa 2 | 53 | 29 | 13 | |
| Chhaava | 22 | 12 | 3 | |
| Dangal | 33 | 25 | 7 | Many foreign-release posters (zh, tr, ko) |
| Jailer 2 | 51 | 20 | 15 | Upcoming film, already well covered |

Each image record has `file_path, width, height, aspect_ratio, iso_639_1` (text language, null for no text), `iso_3166_1`, `vote_average, vote_count`. All sample logos were PNG. One call cannot return every image any other way: an appended `images` block is filtered by language, and `include_image_language` has no "all" value.

**Image server** (`image.tmdb.org`, served by BunnyCDN): `Cache-Control: public, max-age` about one year; WebP when the request accepts it; 404 for a missing file, 400 for an unsupported size. From this machine, IPv4 answered in about 55 ms and IPv6 timed out on every try.

**Network finding (checked 2026-10-27).** This machine's default DNS answers `api.themoviedb.org` with `49.44.79.236`, a Jio address. The public resolver 1.1.1.1 gives TMDB's real CloudFront addresses. `image.tmdb.org` resolves normally to BunnyCDN. TMDB staff say Indian ISPs, mainly Jio and sometimes Airtel, block TMDB domains on and off. This explains the earlier "fetch failed" errors.

**Limits and terms** (secondary extracts; exact wording not confirmed):
- API: about 40 requests a second per IP. The image server allows about 20 open connections per IP and does not count towards the API limit.
- Caching TMDB data for more than 6 months is not allowed. Older versions of the terms said "reasonable periods".
- Both caching image files on our server and linking straight to `image.tmdb.org` are allowed.
- Attribution needs the notice plus an approved TMDB logo, less prominent than our own branding, for example in an About or Credits section.
- The free licence is non-commercial.

**Other movie data** available in the existing call: `overview`, `tagline`, `runtime`, `genres`, `release_dates` (certificates per country and release type), `production_companies` and `videos`. With the default language, TMDB listed a YouTube trailer for Kalki, Chhaava and Dangal but not for OG, Pushpa 2 or Jailer 2. Telugu and Tamil trailers may simply have been filtered out (see B4).

### B2 [New] Decisions needed before building (answered in B11)

1. **Image policy.** An earlier rule says you approve exact images before they go on the site, and that we never download film stills or posters. This plan fetches posters and backdrops, so it needs your go-ahead. Proposed: you review every film's images in the admin portal. The suggested set is pre-ticked, and nothing you haven't looked at goes live (B6.6).
2. **How images are served.** Recommended: through our own server with a disk cache (B5). Linking straight to TMDB is allowed too, but visitors on Jio may hit the same DNS block this machine has.
3. **Where posters appear.** Recommended: the film page first, then cards across the site after you see a mock-up.
4. **TMDB text.** The site's synopses are our own summaries. Proposed: store TMDB's overview and tagline for reference, and don't show them.
5. **Cast and crew photos.** Proposed: one switch for all profile photos, plus hiding a single person.
6. **Circle rule.** Your rule that people are always shown in circles covers **profile photos only**. Posters and backdrops show actors too, but they stay rectangular. A profile photo is never shown enlarged.
7. **Logos.** Proposed: keep logo data, but leave logos out of the page. White logos vanish on light themes, and an image title would weaken the text heading.

### B3 [New] Data layer

New table **`movie_images`**:

| Column | Purpose |
|---|---|
| `id`, `movie_id` (foreign key, cascade) | |
| `tmdb_id` | The TMDB film the image came from. If a film's TMDB ID changes, rows from the old ID are retired. |
| `kind` | `poster`, `backdrop` or `logo` |
| `file_path` | TMDB path, unique per film and kind |
| `width`, `height`, `aspect_ratio`, `lang`, `country` | Layout and language filtering |
| `vote_average`, `vote_count`, `rank` | Used to suggest the best ones |
| `status` | `pending`, `approved` or `hidden`. A sync never changes it. |
| `role` | `poster` or `hero` when chosen as the film's main image. A partial unique index allows one of each per film. |
| `focal_x`, `focal_y` | Focal point the admin sets for the hero crop |
| `first_seen`, `last_seen`, `gone_at`, `upstream_404_at` | Track images TMDB removes (B4) |

Indexes on `(movie_id, kind, status, rank)` and `(file_path)`. Expected size: about 20,000 rows at most. The six best-covered films average 92 images each.

**People's photos.** Approval decisions go in a new table, **`person_photos`** (`tmdb_person_id`, `file_path`, `status`), not on `people` rows. People rows are deleted when no longer credited, and a new TMDB `profile_path` would otherwise slip through unreviewed. A photo shows only when its exact path is allowed and the global switch (stored in `meta`) is on. `replaceCredits` stops using `COALESCE(?, photo)`, so a photo TMDB removed is cleared.

Other changes:
- New table **`tmdb_details`** (`movie_id`, overview, tagline, runtime, genres, Indian certificate as raw text, companies, `fetched_at`). It is kept apart from the catalogue, so TMDB never overwrites researched or admin-edited fields. Certificate rule: the `IN` release of type 3 (theatrical), else 2, else 1, with a non-empty value; null if none.
- `trailers`: filled from TMDB `videos` only when the film has no trailer yet, and never replacing one the admin set (`source = 'tmdb'`). `writeTrailer` must keep `tmdb` as the source on restore instead of turning it into `admin`. The YouTube sync then mainly refreshes view counts, which saves most of its daily quota.
- Film objects gain a small `images` summary in `readFilms()`: the chosen poster and hero paths, the hero focal point, and counts, approved only. `images` is added to `OWN_FIELDS` in `server/db.js` and removed in `tidyFilm` (`server/validate.js`), like `credits`. Otherwise a stale copy could come back through an admin save or a restore and show an image you hid.
- Backups store image decisions keyed by `(tmdb_id, kind, file_path)` and person decisions by `tmdb_person_id`, never by row ID. Decisions that don't match yet are kept for the next sync. Older backups without these fields leave current decisions alone, and `backupProblem` validates the new fields. Image files are not backed up; they can be fetched again.

### B4 [New] Fetching

- **Movie details:** add `videos,release_dates` to the existing `/movie/{id}` call in the `tmdb` task (4 of TMDB's 20 allowed appends) and write `tmdb_details` there. No second details call.
- **Images:** a new sync task **`images`**, placed right after `tmdb`. It makes one unfiltered `/movie/{id}/images` call per film, so 220 calls in all. It runs from the admin Settings panel or `npm run sync -- images`.
- **Trailer languages:** pass `include_video_language=en,te,hi,ta,ml,kn,mr,bn,pa,gu,null`. It is documented only for TV, so test it once first. Prefer `site=YouTube`, `type=Trailer` and `official`, which isn't always reliable.
- **Every image is stored.** The default view shows text-free images plus English, the film's original language and its release languages. Other languages stay stored.
- **Removed images:** only a successful sync answer sets `gone_at`, for images missing from it. A failed call, a 404 or an empty answer never does. `gone_at` clears if the image comes back. A gone image loses its `role`.
- **Freshness:** to stay within TMDB's 6-month rule, every film's TMDB data is fetched again at least every 90 days. Today the `tmdb` task never re-fetches films that already have TMDB credits, so that changes.
- **Before each sync:** a quick `/configuration` check. If DNS is blocked, the sync stops at once with a clear message instead of retrying 8 times for 20 seconds per call.
- **Pacing:** add a pause between calls, not only between films, staying under about 20 calls a second. Keep the retries on network errors and 429 answers.
- **`keySet`** in `server/sync/jobs.js` hard-codes `tmdb` and `youtube`. It must use each task's own `key`, so `images` needs the TMDB key and is skipped without it.
- **Image files:** never downloaded in bulk. The server fetches each size the first time someone needs it (B5). After approval, it can pre-fetch each film's hero and poster.

### B5 [New] Serving images through our server

Route **`GET /img/:size/:file`**:
- **Check the name first.** Before anything else, check the name against `^[A-Za-z0-9]{8,64}\.(jpg|png)$`. Express decodes `%2F`, so this comes before any path use. Serve with `sendFile(name, { root })`.
- **Allowed files.** Serve only files approved for a film, or allowed person photos. Use an in-memory allowlist, rebuilt when the films version changes like `filmsJSON()`. The kind found there decides the allowed sizes, and `original` is never allowed. Anything else is a 404 with no upstream request, so the server can't be used as an open proxy.
- **WebP only.** Always ask TMDB for WebP and store it as `w342/abc.webp`, with our own `Content-Type: image/webp`. One format per URL means no `Vary: Accept` is needed.
- **Fetching.** First requests fetch from `image.tmdb.org` with `redirect: "error"`, an 8-second timeout and a 2 MB cap counted while streaming, and only `image/*` answers are accepted. Write to a uniquely named `.part` file, then rename it. Check the allowlist again before saving, so a hide during a download doesn't bring the file back.
- **Headers.** Good answers send `Cache-Control: public, max-age=2592000` (30 days). A hidden image then leaves visitors' caches within a month, instead of a year. 404 and 502 answers send `no-store`.
- **Network.** Call `dns.setDefaultResultOrder("ipv4first")` in `server/env.js`, because Node's default order loses up to 250 ms per connection to the dead IPv6 route. Host the server with a DNS resolver that isn't the ISP's.
- **Load.** At most 6 upstream fetches at once. Join duplicate requests for the same file. Cap the queue and answer 503 beyond it. Serve the hero and poster first. After 5 failures in a row, fail fast for 60 seconds.
- **Missing upstream.** A TMDB 404 sets `upstream_404_at` only; the sync decides whether an image is gone.
- **Disk.** The cache folder is set by `IMAGE_CACHE_DIR`, because the repo is inside OneDrive. It is capped by `IMAGE_CACHE_MB` (default 2 GB) and files older than 90 days are dropped. An in-memory map, filled by a start-up scan, tracks last use; eviction goes down to 90% of the cap. If a cached file vanishes, fetch it again. If the disk is full, serve without saving. Realistic size is about 0.5 GB; the worst case at every allowed size is about 6 GB.
- **Admin previews.** A signed-in admin can see pending images at w185 and w300, with `Cache-Control: private, no-store`.
- **Fallback.** `IMAGE_MODE=direct` switches to plain TMDB links, for a host with little bandwidth.

Routes that already hand out raw TMDB photo links must be gated: `readCredits` (`server/db.js`) and `/api/people/:id` (`server/routes/public.js`). They return a photo only when it is allowed, as an `/img` path.

New API routes:
- `GET /api/movies/:id/images?kind=backdrop&limit=24&offset=0` returns approved images only, with sizes for layout. Its 5-minute cache is keyed on the films version, so a hidden image disappears at once.
- Admin: `GET /api/admin/movies/:id/images` (every status), `PATCH /api/admin/images/:id` (status, role, focal point), `POST /api/admin/movies/:id/images/approve` (the ticked set), `GET`/`PATCH` people photo decisions per film, and the global photo switch.

### B6 [New] Showing images: recommended approach

**Recommendation: a sharp hero backdrop, a Photos section that is a swipeable strip on phones and a two-row grid on desktop, a lightbox, and real photos in the existing round cast avatars.**

1. **Hero backdrop.** Put a real `<img alt="" srcset sizes fetchpriority="high">` inside `#filmBackdrop`, positioned by the admin's focal point. On dark themes, drop today's `blur()` and `scale(1.12)`, use `brightness(.6)`, and widen the solid part of the left fade to about 38%. On the Light and Popcorn themes, keep today's blurred wash. Heroes must be text-free and at least 1280 px wide. Before launch, check 4.5:1 contrast for the muted text over the six sample films.
2. **Phone header.** Today the poster card and back link cover most of the 340 px backdrop. Instead: a full-width 16:9 image that fades only at its bottom, the poster card overlapping its lower-left edge, the title below the image, and "All films" as a translucent pill.
3. **Poster card.** An `<img>` on top of today's gradient, with the darkening `::before` overlays turned off over real posters. Order: your choice per film among the approved TMDB poster, the local photo and the drawn art. The default is TMDB, then local, then drawn.
4. **Photos section.** Placed after Reviews, with its own tab, which `renderPage` builds from the `film.images` counts.
   - One kind at a time, Backdrops or Posters, with pill filters only when both exist.
   - Fixed row height of about 180 px, with width from the aspect ratio, so jumping to a section or switching filters doesn't move the page.
   - Phones get a swipeable strip, and desktop gets two rows ending in a "+N more" tile. No "See all" with 1 to 3 images. The section is hidden when its only image is the hero.
   - Each thumbnail is a button named "Backdrop 3 of 74", with `alt=""` on the image.
5. **Lightbox.** A native `<dialog>` with a heading, reusing the search box's scroll lock and reduced-motion rule.
   - "See all" opens it as a grid, 24 at a time, and a thumbnail opens it on that image. The large image's alt text is "{title}, backdrop 3 of 74", also read out by a polite status message.
   - Previous and next buttons are 48 px, disabled at the ends, and sit in a bottom bar on phones. Arrow keys and swipe work, with `touch-action: pan-y pinch-zoom` so zoom still works.
   - Opening it adds a history step, so the Android back button closes it instead of leaving the page. It is dark in every theme and loads only the image shown and the next one.
6. **Admin review** (new "Images" view, server only, like Comments):
   - Left: a film queue sorted by gross, with chips such as "Not reviewed", "3 new" and "2 gone".
   - Right: a live preview of the film header in District, Light and phone width; the hero row, where a click sets the focal point; a grid of checkboxes with the suggestions pre-ticked.
   - Suggestions: allowed languages only, ranked by votes then width, with near-duplicates collapsed. One button, "Approve these N", then "Save and next film". The rest stay pending.
   - Each film's public set is capped at 1 hero, 1 poster, 16 backdrops and 6 posters.
   - People get a grid of circles per film, plus the global switch.
7. **Cast and crew photos.**
   - The row avatars use `<img alt="" loading="lazy" width="88" height="88">` with `object-position: 50% 20%`, inside the existing hidden-from-readers avatar and over the initials. A load error removes the image, so the initials show. Billing order and the ring stay the same for photos and initials.
   - In the full list, only the Cast column gets photos, because only 35% of crew credits have one. Photos load only when the list is first opened.
8. **Attribution.** A Credits line with TMDB's notice and an approved TMDB logo, less prominent than MANA CINEMA's branding.

Why this one:
- **It reuses what the page already has.** The backdrop layer, poster card, round avatars and the dialog from search all stay. The tab bar, section order and phone header do change, and you see those in mock-ups first.
- **It loads little up front.** About 120 KB of images sit above the fold on a phone.
- **It works for every input.** Phones swipe, desktop uses a grid a mouse can reach, keyboard and screen reader users get named buttons and a real dialog, and nothing moves by itself.

Considered and not chosen:
- **Auto-advancing carousel:** it hides images, moves on its own, and is hard to use with a keyboard.
- **Manual carousel on desktop:** a mouse can't easily scroll a sideways strip.
- **Grid of every image on the page:** up to 160 images is heavy on phones.
- **Separate gallery page:** it adds navigation. It could come later for films with huge sets.

Later, after a second mock-up: posters on home cards, lists and search, as `<img>` elements on top of today's gradient.

### B7 [New] Performance

Image sizes per place (all WebP):

| Place | Shown at | Sizes offered | Notes |
|---|---|---|---|
| Hero, phone | about 360 to 680 px | w780 only | A `<picture>` source for phones, so a high-density phone doesn't pick w1280 |
| Hero, desktop | `min(68vw, 980px)` | w780, w1280 | |
| Poster card | 132 px phone, 280 px desktop | w185, w342, w500 | `sizes="(max-width:760px) 132px, 280px"` |
| Photos thumbnail | 160 × 90 px | w300 only | About 85 KB for 12 |
| Poster thumbnail | about 120 px wide | w185 | |
| Lightbox | screen | w1280 backdrop, w780 poster | |
| Cast row avatar | 88 px | w185 | About 10 KB each |
| Full list avatar | 32 px | w45 | |
| Search | 40 px | w92 | |

- **Budget:** at most 120 KB of images above the fold on a phone, and at most 300 KB before the lightbox or full list opens.
- **Markup:** posters and the hero become `<img>` elements. Today they are CSS backgrounds, and `markPhotos()` loads every one at once with `new Image()`. `markPhotos` changes to listen to each image's own load and error events.
- **Lazy loading:** `loading="lazy"` and `decoding="async"` below the fold, with `width` and `height` from the stored details, so nothing jumps.
- **Preload the hero:** the `/film.html` route sends a `Link: <…>; rel=preload; as=image; fetchpriority=high` header for the hero, one for phones and one for desktop with `media`. Today the hero URL is only known after `api/bootstrap.js` (305 KB raw, 60 KB gzipped) and `film.js` have run. The preload must match the `<img>` exactly, or the browser downloads it twice.
- **Data saver:** when `navigator.connection.saveData` is on, use 1x sizes only.
- **Caching:** server disk cache plus 30-day browser caching. Image-list API answers are cached for 5 minutes, keyed on the films version. `api/bootstrap.js` carries only the main paths.
- **Limits:** the API defaults to 24 images per page, with a maximum of 60. Upstream fetches follow B5's limits.

### B8 [New] Edge cases

| Case | Handling |
|---|---|
| Film with no images | Today's gradient, drawn art or title poster. The Photos section is hidden. |
| Person with no photo | Initials avatar, as now. 3,710 of 5,604 cast credits and 2,530 of 7,308 crew credits have a photo. |
| Broken or removed image | One capturing `error` listener removes the failed `<img>` so the fallback shows. It never swaps to another URL, which could loop. A TMDB 404 sets `upstream_404_at`; only the sync marks an image gone. |
| Very large cast and crew | Jawan has 568 credits across 11 groups. The full list is built when first opened and shows 24 per group with "Show all". |
| Slow networks | Space is reserved at the right size, and the film's own colour shows while loading. The lightbox keeps the thumbnail until the large image arrives. |
| Jio DNS block | The proxy fetches server-side, the server uses a non-ISP DNS resolver, and visitors only contact our site. The sync checks `/configuration` first. |
| IPv6 dead on the server's network | `ipv4first` DNS order and an 8-second timeout. |
| TMDB down or slow | Circuit breaker, queue cap with 503, and the page falls back. |
| Foreign-language posters | Stored, not suggested, not shown by default. |
| Film without a TMDB ID (Garividi Lakshmi) | No images until the admin adds the ID. |
| Takedown request | Hiding an image removes it from the allowlist at once and deletes its cached files. Browsers drop it within 30 days. |
| Static mode (GitHub Pages) | Without the server there is no `film.images`, so no image URLs are emitted and today's fallbacks stay. |
| Security | Name checked before any path use, allowed sizes per kind, no `original`, no SVG, 2 MB cap, image content types only, no redirects, no user-supplied URLs. |

### B9 [New] Where it fits, and the order of work

New settings: `IMAGE_MODE`, `IMAGE_UPSTREAM`, `IMAGE_CACHE_DIR`, `IMAGE_CACHE_MB`, `IMAGE_TIMEOUT_MS`.

| Phase | Work | Files |
|---|---|---|
| 0 | Your decisions (B2) and mock-ups: film header in dark, light and noir themes on phone and desktop; Photos with 0, 1, 3 and 150 images; the lightbox; the admin Images screen | none |
| 1 | `movie_images`, `person_photos`, `tmdb_details`; `images` field rules; extended `tmdb` call; `images` task; `keySet` fix; `/configuration` check; 90-day refresh; backup and restore of decisions | `server/db.js`, `server/validate.js`, `server/sync/tmdb.js`, `server/sync/jobs.js`, `server/routes/admin.js` |
| 2 | `/img` proxy and disk cache; gating `readCredits` and `/api/people/:id`; images API; admin images API; `ipv4first` | new `server/images.js`, `server/app.js`, `server/env.js`, `server/routes/public.js`, `server/routes/admin.js` |
| 3 | Admin Images view: film queue, preview, focal point, pre-ticked suggestions, people circles, global switch | `admin.html`, `js/admin.js`, `css/admin.css` |
| 4 | Film page: hero `<img>` and preload, phone header, poster card, cast photos, Photos section and tab, lightbox, TMDB credit | `film.html`, `js/film.js`, `css/film.css`, `js/ui.js`, `server/app.js` |
| 5 | Posters on cards, lists and search, after a second mock-up | `js/main.js`, `js/lists.js`, `js/ui.js`, `css/style.css` |
| 6 | Cache clean-up, README, and the TMDB logo | `server/images.js`, `README.md` |

**Checks.** `server/check.js` starts a small local server that stands in for TMDB, with a tiny WebP, a 404, an oversized file, an HTML page, a slow answer, a redirect and a hit counter. It asserts:
- a second request is served from disk;
- 10 parallel requests cause 1 upstream hit;
- unapproved files, `original` and `%2F` give 404 with no upstream hit;
- bad upstream answers give 502 and leave no file;
- eviction works with a tiny cap;
- approvals survive a re-sync and a backup restore.

Each phase ends with `npm run check` passing and a browser check, as before.

### B10 [New] What the review changed

Three subagents reviewed the first draft: data fetching and API, UI and UX, and performance and edge cases.

- **Network cause found.** Jio's DNS blocks `themoviedb.org` on this machine, which I confirmed. That changed B1, B5 and B8: a non-ISP resolver, a quick `/configuration` check, and `ipv4first`.
- **TMDB rules added.** No caching longer than 6 months, attribution with TMDB's logo, about 40 calls a second, and about 20 connections to the image server.
- **Fewer calls.** Movie details join the existing `tmdb` call, so the image sync makes 220 calls instead of 440.
- **Approval made real.** "Approve suggested set" approved images nobody had seen. Now suggestions are pre-ticked on a review screen with a live preview, and each film's public set is capped.
- **Decisions that last.** People's photo decisions moved to their own table keyed by TMDB person ID, and backups key image decisions by TMDB IDs. Syncs never change a decision, and an empty or failed answer never marks images gone.
- **Leaks closed.** Two routes already hand out raw TMDB photo links, and the `images` summary could have come back through admin saves.
- **Proxy hardened.** WebP only with no `Vary`, the name checked before decoding, a 2 MB cap, no redirects, a circuit breaker, a queue cap, safe writes, 30-day caching instead of a year so hides take effect, and a cache folder outside OneDrive.
- **Sizes corrected.** A high-density phone would have loaded the 147 KB desktop hero; phones now get w780 only. Thumbnails shrink to w300. The budget is now 120 KB above the fold.
- **Hero made real.** It becomes an `<img>` with a preload header, so lazy loading, `srcset` and priority actually work.
- **Layout refined.** Photos sits after Reviews with its own tab, and shows one kind at a time. Desktop gets a two-row grid instead of a sideways strip, and the phone header is redesigned.
- **Rules clarified.** The circle rule covers profile photos only, and logos stay out of the UI.
- **Test plan added.** A stand-in TMDB server in `check.js`.

### B11 [New] Decisions (recommended answers, 2026-10-27)

You asked me to answer the open questions. These are the decisions the build follows; change any of them before Phase 1 starts.

| # | Question | Decision | Why |
|---|---|---|---|
| 1 | Lift the "never download posters or stills" rule? | **Yes, for TMDB images only**, and only through the admin review. Nothing goes live until you tick it. Wikimedia photos and the home cover keep their old rules. | Your real concern was control over what appears. The review screen keeps that control. |
| 2 | Proxy or direct TMDB links? | **Proxy through our server** (B5). `IMAGE_MODE=direct` stays as a fallback. | Jio blocks TMDB's main domain for some visitors. With a proxy, visitors only reach our site, and only approved images can be served. |
| 3 | How are profile photos approved? | **One global switch, plus hiding any person.** The switch starts off; you turn it on after checking a few films. | Approving 7,740 people film by film is not practical. |
| 4 | Do TMDB posters replace drawn art and local photos? | **Only where you approve a poster.** The 4 local photos stay until you choose otherwise. Films with no approved poster keep the drawn art. | Nothing changes on a film until you decide it. |
| 5 | Logos and TMDB overviews? | **Both stay off the page.** Their data is stored. | Logos fail on light themes, and the synopses are our own writing. |
| 6 | Change this computer's DNS? | **Yes, to 1.1.1.1 (backup 8.8.8.8).** You must do it yourself, because I don't change system settings. On Windows: Settings > Network & internet > your connection > Hardware properties > DNS server assignment > Edit > Manual > IPv4 on > preferred 1.1.1.1, alternate 8.8.8.8 > Save. | It removes the Jio block behind the "fetch failed" errors. |
| 7 | Where to host? | **A small Linux VPS** with a persistent disk of at least 10 GB, the server set to a public DNS resolver, HTTPS through a reverse proxy, and `TRUST_PROXY=1`. Render or Railway with a persistent volume also work. | SQLite and the image cache both need a disk that survives restarts, and we need control of the DNS resolver. |

**Change on 2026-10-27:** you asked for images everywhere now. So the image sync picks each film's best TMDB poster automatically and shows it at once, and cast and crew photos are on. The admin review screen (Phase 3) becomes the way to hide or swap a poster, not a gate before it shows. Built so far: `movie_images`, the `images` sync task, the `/img` server with disk cache, posters on every page, and photos in the cast row.

With these answers the plan is complete. The next step is Phase 0: mock-ups for you to approve. No code is written before that.
