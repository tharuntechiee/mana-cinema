# Putting MANA CINEMA online: Render free + Turso + Brevo

Three free services. Turso and Brevo say no card is needed; Render's docs don't say either way.

| Service | What it does | Free limit |
|---|---|---|
| **Render** | Runs the website (Singapore, the nearest region to India) | 512 MB RAM, 750 hours a month (enough for one site all month) |
| **Turso** | Keeps the database safe (Mumbai) | 5 GB, 10 million row writes a month |
| **Brevo** | Sends the sign-in code emails | 300 emails a day |

**How it works.** Render's free disk is wiped every time the site restarts, so the database can't live only
there. The site still runs on its own SQLite file, but `server/snapshot.js` keeps a compressed copy in Turso:
it downloads the newest copy when the site starts, uploads a new one a few seconds after any change, and
uploads a last one when Render stops the site. Render also blocks the usual email ports on free, so sign-in
codes go through Brevo's API over HTTPS.

**What to expect on the free plan:**
- **The site sleeps** after 15 minutes with no visitors. The next visitor waits about a minute while it wakes
  (and restores the database). After that it's fast again.
- **A change could be lost only** if Render crashed in the few seconds between it and its upload.
- **Posters are fetched again from TMDB** after each wake (the image cache is on the wiped disk). That's
  automatic; the first visitors after a wake may see posters appear a moment later.
- **The daily IMDb ratings refresh** runs whenever the site is awake and it's due.
- During a deploy, Render runs the old and new site together for about a minute. A rating posted on the old
  one in that minute can be lost. Deploy when it's quiet.

Why Render, and what else was considered: [research/free-hosting.md](research/free-hosting.md).

---

## 1. Turso: the database copy

1. Sign up at <https://turso.tech> (GitHub sign-in works). Free plan, no card.
2. **Create a database:** name `mana-cinema`, location **Mumbai (aws-ap-south-1)**.
3. Open the database and copy its **URL**. It starts with `libsql://`.
4. **Create a token** for that database (Read & Write) and copy it. Keep it secret.
5. **Upload your current data** so the live site starts with your films, posters and edits. On your PC,
   in the project folder, in PowerShell (paste your own URL and token):
   ```powershell
   $env:TURSO_DATABASE_URL = "libsql://mana-cinema-yourname.aws-ap-south-1.turso.io"
   $env:TURSO_AUTH_TOKEN = "your-token"
   npm run turso:push
   npm run turso:list
   ```
   You should see one copy listed. (Skip this and the site starts with the original catalogue, without
   your edits or posters.) Close PowerShell afterwards so the token isn't left in it.

Don't run `turso:push` again after the site is live: it replaces what the live site has saved.

## 2. Brevo: sign-in emails

1. Sign up at <https://www.brevo.com> (free plan). Brevo checks new accounts before they can send; it can
   take a little while.
2. **Senders, Domains & Dedicated IPs > Senders > Add a sender:** name `MANA CINEMA`, and the email address
   the codes should come from (for example a Gmail you made for the site). Confirm it from that inbox.
3. **SMTP & API > API keys > Generate a new API key.** Copy it (it's shown once). It starts with `xkeysib-`.
   Not the SMTP key on the SMTP tab (`xsmtpsib-...`): the API refuses that one with "Key not found".

About Gmail as the sender: Brevo can't prove a gmail.com address is allowed to send through it, so it may
send from a Brevo address on your behalf, and some codes may land in spam. When you buy a domain, add it in
Brevo (**Domains**, with the DKIM and DMARC records it shows) and send from `codes@yourdomain`: codes then
reach the inbox reliably. Until then, the sign-in window already tells people to check their spam folder.

## 3. Google sign-in (optional but recommended)

In Google Cloud console > Google Auth Platform > Clients > your Web client, add the Render address as an
**Authorised JavaScript origin**: `https://mana-cinema.onrender.com` (use the name Render gives you in step 4,
and your own domain later). Use `https://mana-cinema.onrender.com/privacy.html` as the privacy policy link
under Branding. Copy the **Client ID**.

## 4. Render: the website

1. Sign up at <https://render.com> with GitHub, and allow it to see the `mana-cinema` repository.
2. **New > Blueprint**, pick `tharuntechiee/mana-cinema`. Render reads `render.yaml` from the repository.
3. It asks for the secret values once:

   | Name | Value |
   |---|---|
   | `TURSO_DATABASE_URL` | the `libsql://...` URL from step 1 |
   | `TURSO_AUTH_TOKEN` | the token from step 1 |
   | `ADMIN_PASSWORD` | a long random password for admin.html |
   | `TMDB_API_KEY` | your TMDB key (from your `.env`) |
   | `GOOGLE_CLIENT_ID` | from step 3 (leave empty to offer email codes only) |
   | `BREVO_API_KEY` | from step 2 |
   | `MAIL_FROM` | the sender address you confirmed in Brevo |

4. **Apply.** The first build takes a few minutes. When it's live, Render shows the address, like
   `https://mana-cinema.onrender.com`.

## 5. Check it

- Open the address. The first load can take a minute (it's waking up).
- **Logs** (in the Render dashboard) should show `Database copy: restored the one saved ...` and then
  `MANA CINEMA is running`.
- Sign in at `/admin.html` with `ADMIN_PASSWORD`.
- Sign in as a viewer with your email: the code should arrive (check spam), and after you rate a film the
  logs show `Database copy saved (... after changes)`.

## 6. Later

- **New code goes live by itself:** every push to `main` on GitHub redeploys the site.
- **Change a setting:** Render dashboard > the service > Environment, then save (it restarts).
- **Your own domain:** Render > Settings > Custom Domains, add it, and create the DNS record Render shows.
  HTTPS is free. Add the new address to Google's Authorised JavaScript origins too.
- **Backups:** Turso keeps the newest 3 copies, and the free plan has 1 day of point-in-time restore. For a
  copy on your PC, run `npm run turso:list` with the Turso settings set (as in step 1), and ask for a
  download command if you want one.
- **If it outgrows free:** Render's paid plans don't sleep and can have a real disk; then the Turso copy is
  optional. Check Render's pricing page for the current price.
