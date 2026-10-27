# Free hosting for MANA CINEMA

Research for MANA CINEMA (Node 24, Express 5, one long-running process, `node:sqlite` file in `data/`, image cache on disk, Gmail SMTP for sign-in codes, a daily IMDb + TMDB sync inside the process, users mostly in India). Every page was accessed on 2026-10-27. [S#] points to Section 9. "Inference" marks my own reading, not a source's statement. Prices are as published on that date and exclude tax unless stated.

## 1. Bottom line

- **Best free option: Oracle Cloud Always Free, Ampere A1 VM, home region Mumbai or Hyderabad.** Always free (not a trial): 2 OCPU + 12 GB RAM total for A1, 200 GB block storage, 10 TB outbound a month [S1]. A real Linux VM, so the app runs **unchanged** with a persistent disk, no sleeping, and India regions exist (`ap-mumbai-1`, `ap-hyderabad-1`) [S3]. Oracle only blocks outbound **port 25** (tenancies made after 23 June 2021) [S4]; Gmail on 465/587 is not named as blocked. Card and phone needed at sign-up, not charged [S2]. Risks: the **idle reclamation** rule (CPU 95th percentile, network and memory all under 20% for 7 days) [S1], "out of host capacity" errors when creating A1 VMs [S1], and the home region can't be changed later [S2].
- **Runner-up: Google Cloud e2-micro, always free.** 1 GB RAM, 2 fractional vCPUs (25% sustained, short bursts) [S7], 30 GB standard disk, but **only in us-west1, us-central1, us-east1** and only **1 GB outbound a month** [S6]. Ports 465/587 are not restricted [S8]. It runs the app unchanged, but it's far from India (inference: about 200-300 ms round trip) and the 1 GB egress is small for a poster-heavy site, so put Cloudflare's free CDN in front (inference) or expect small bills.
- **Free, but needs code changes: Render free web service (Singapore) + Turso free (libSQL) + an HTTPS email API.** Render free sleeps after 15 minutes idle with about 1 minute to wake, has no persistent disk, and **blocks ports 25, 465 and 587** [S12]. So the DB must move to Turso (5 GB, 500 M reads / 10 M writes a month free, no card) [S30], email must go over HTTPS instead of SMTP, and the daily IMDb job must run somewhere else. Worse than Oracle on every point except setup effort.
- **Trials, not free hosting:** AWS (new accounts since 15 July 2025: $100 + up to $100 credit, Free plan **closes the account after 6 months** [S9, S10]); Azure (12 months of B1s / B2pts v2 / B2ats v2, 750 h a month, $200 for 30 days, card required [S13]); Railway ($5 for 30 days, then $1 a month; **SMTP blocked on Free, Trial and Hobby** [S17, S18]); Fly.io (2 machine-hours or 7 days, no free tier for new orgs [S20]).
- **Cheapest paid fallback** (inference from the prices below): Hetzner CPX02 in Singapore at €7.99 a month (1 vCPU, 1 GB, 20 GB, IPv4 included; 465 blocked but **587 open**) [S34, S36], or Lightsail Mumbai at $5 (0.5 GB, 20 GB, 0.5 TB) [S38]. Avoid DigitalOcean for this app: it blocks **25, 465 and 587** on all Droplets [S40], so Gmail SMTP would not work.
- **RAM:** the IMDb sync streams and filters line by line (`server/sync/download.js` reads through `createGunzip`; only `title.ratings` is cached to disk) and keeps only the wanted IDs in `Map`/`Set`s (`server/sync/imdb.js`). Inference: 512 MB should be enough but is tight with Caddy and the OS; 1 GB is comfortable. I didn't measure peak RSS; run `node --max-old-space-size=384 server/index.js` once with a forced sync to check.

## 2. What this app needs, and who meets it

| Need | Why | Breaks on |
|---|---|---|
| Persistent disk | SQLite file + WAL, poster cache | Render free, Koyeb free, HF Spaces, Vercel, Netlify, Workers, Deno Deploy, Replit published apps |
| Long-running process | Daily sync `setInterval` inside the process (`server/sync/jobs.js`) | All serverless (Vercel 300 s max, Netlify scheduled 30 s, Workers 10 ms CPU) |
| Outbound 465/587 | Gmail SMTP | Render free, Railway Free/Trial/Hobby, DigitalOcean, Zeabur Free (no email quota), HF Spaces (only 80/443/8080) |
| No sleep | Sign-in codes; 30-60 s cold start hurts | Render free (15 min), Koyeb free (1 h), HF Spaces (48 h) |
| India or nearby region | Latency | Google free (US only), Koyeb free (Frankfurt, Washington), Back4App free (USA only) |
| ~1 GB downloads a day | IMDb datasets (inbound) | Inbound is free on most clouds; I checked Fly only [S20] |

## 3. Comparison table (always-free or free-plan offers)

| Provider | Free for how long | CPU / RAM | Persistent disk on free | Sleep | Limits | SMTP | Near India | Domain + HTTPS | Card | Sources |
|---|---|---|---|---|---|---|---|---|---|---|
| **Oracle Always Free A1** | Always | Up to 2 OCPU / 12 GB total (Arm), up to 2 instances | Yes, 200 GB total block+boot (boot min 47 or 50 GB, page disagrees); 5 backups | No, but idle reclamation | 10 TB egress/month | Port 25 blocked (post-2021 tenancies); 465/587 not named | Mumbai, Hyderabad, Singapore (1 AD each) | Your own (Caddy) | Yes, not charged | [S1-S4] |
| **Oracle E2.1.Micro** | Always | 1/8 OCPU (burst), 1 GB, 50 Mbps | Same 200 GB pool | Same | Same | Same | Same | Same | Yes | [S1] |
| **Google e2-micro** | Always | 2 shared vCPU at 25% / 1 GB | 30 GB-month standard PD | No | 1 GB egress/month (NA source) | 25 blocked; 465/587 allowed | No: US regions only | Your own | Yes | [S6-S8] |
| **AWS Free plan** | 6 months or credits used | t3.micro, t3.small, t4g.micro, t4g.small, c7i-flex.large, m7i-flex.large eligible | EBS gp2/gp3 eligible (paid from credits) | No | Credits $100 + up to $100 | 25 blocked by default, can request removal | Mumbai (inference: any region) | Your own | Not checked | [S9-S11] |
| **Azure free account** | 12 months (VM); 30 days ($200) | B1s, B2pts v2, B2ats v2, 750 h/month each | Disk allowance not shown on page | No | - | 25 blocked; 587 "isn't restricted" | Not checked (inference: Central India) | Your own | Yes | [S13-S16] |
| **Azure App Service free** | Always | Shared; "1 hour per day" CPU, 1 GB storage, 10 apps | Not suitable | Yes (CPU quota) | 1 h/day | 587 allowed | - | Custom DNS needs a higher tier | Yes | [S13, S15] |
| **Render free** | Always | Not stated on the page | No (ephemeral) | 15 min idle, ~1 min wake | 750 h/month | **25, 465, 587 blocked** | Singapore | Yes | No (inference) | [S12, S19] |
| **Railway** | $5 for 30 days, then $1/month | Free: 0.5 GB, 1 vCPU per service; Trial 1 GB | Free: 0.5 GB volume; trial volumes deleted 30 days after expiry | Not stated | - | **Blocked** on Free, Trial, Hobby | Singapore | Not checked | Not to start | [S17, S18, S21] |
| **Fly.io** | 2 h runtime or 7 days | shared-cpu-1x 512 MB = $3.69/month | Volumes $0.15/GB/month (paid) | No | - | Not blocked per staff (forum) | Singapore only (no Mumbai) | 10 certs free | After trial | [S20, S22, S23] |
| **Koyeb free** | Always, 1 per org | 0.1 vCPU / 512 MB / 2 GB SSD | **No**, volumes not allowed on free | Scale to zero after 1 h | - | Not stated | Frankfurt or Washington only | Not checked for free | Not stated | [S24, S25] |
| **Northflank Sandbox** | Always | "Limited", up to $20/month of resources | "Volumes" listed, size not stated | "Always on" | 2 services, 2 jobs, 1 addon | Not stated | Not stated | Not checked | "No card needed" | [S26, S27] |
| **Zeabur Free** | Always | Not stated | Not stated | Not stated | 0 domains, 0 email quota | Email quota 0 | Not stated | **No custom domains** | Not stated | [S28] |
| **Back4App containers** | Always | 0.25 CPU / 256 MB | Not stated | Not stated | 100 GB transfer | Not stated | USA only | Not stated | No | [S29] |
| **Hugging Face Spaces** | Docker Spaces need a paid plan | CPU Basic 2 vCPU / 16 GB | No (50 GB not persistent) | 48 h idle | - | Only ports 80, 443, 8080 outbound | - | Custom domain supported | PRO plan | [S31, S32] |
| **Glitch** | Shut down | - | - | - | - | - | - | - | - | [S33] |
| **Replit** | Starter can publish (badge) | Not stated | "Avoid saving and relying on data written to a published app's filesystem" | Not stated | - | Not stated | Not stated | Not checked | Payment method may be asked | [S41, S42] |

## 4. Provider notes

### Oracle Cloud Always Free (top pick)

| Item | Detail | Source |
|---|---|---|
| A1 (Arm) | 1,500 OCPU-hours and 9,000 GB-hours a month = 2 OCPU + 12 GB, as one VM or split | [S1] |
| E2.1.Micro | Up to 2, each 1/8 OCPU, 1 GB, 50 Mbps | [S1] |
| Storage | 200 GB combined boot + block in the home region, 5 backups. Boot volume minimum given as 47 GB in one place and 50 GB in another | [S1] |
| Egress | 10 TB a month | [S1] |
| Idle reclamation | May reclaim if over 7 days: CPU 95th percentile < 20%, network < 20%, **and** memory < 20% (memory only for A1) | [S1] |
| Home region | Always Free compute and volumes only in the home region; chosen at sign-up | [S1, S2] |
| India regions | India West (Mumbai) `ap-mumbai-1`, India South (Hyderabad) `ap-hyderabad-1`, Singapore x2; 1 availability domain each | [S3] |
| After the 30-day $300 trial | Always Free keeps running; paid trial resources are reclaimed unless you upgrade; if you have more A1 than the free limit, all A1 VMs are disabled then deleted after 30 days | [S2] |
| Card | Most users need a mobile number and a card; not charged unless you upgrade | [S2] |
| SMTP | "Tenancies made after June 23, 2021 are by default not allowed to send e-mail via outbound TCP port 25"; only port 25 is named | [S4] |
| Firewall | Two layers: the subnet security list / NSG **and** the OS iptables. Oracle's Ubuntu tutorials insert an iptables ACCEPT rule and save it with `netfilter-persistent`; "Do not use ... UFW ... on an Ubuntu image" | [S5, S5b] |
| Capacity | "out of host capacity": try another availability domain or retry later | [S1] |

**Running this app there:** unchanged. Ubuntu on A1 is arm64; `node:sqlite` is built into Node, and the app has no native npm modules as far as I know (inference: check `package.json` for any `sharp`-like native module before choosing Arm; if there is one, it needs an arm64 build).

**Idle reclamation in practice (inference):** all three must be under 20% for Oracle to reclaim. A small site will often be under 20% CPU and network. The memory test is the one you control: give the VM less RAM (for example 1 OCPU / 2 GB) so Node + Caddy + OS sit above 20%, or run the full 2 OCPU / 12 GB and accept the risk. Many users report that upgrading to Pay As You Go (still free inside the limits) stops reclamation; I found no Oracle page saying so (see Section 8). Keep backups off the VM either way.

### Google Cloud free tier

| Item | Detail | Source |
|---|---|---|
| VM | One non-preemptible e2-micro per month, hours equal to the month, combined across us-west1 (Oregon), us-central1 (Iowa), us-east1 (South Carolina) | [S6] |
| Specs | 2 vCPUs at 12.5% each (25% total), bursts to 100% for about 30 s; 1 GB memory | [S7] |
| Disk | 30 GB-months standard persistent disk | [S6] |
| Egress | 1 GB from North America to all destinations a month (excluding China and Australia) | [S6] |
| Trial | $300 for 90 days, separate from the always-free tier | [S6] |
| Card | Required; temporary hold of $0 to $1 | [S6] |
| SMTP | Port 25 blocked to external destinations; Google "does not place any restrictions" on 587 and 465 | [S8] |

**Running this app there:** unchanged, same steps as Oracle (Section 7). Add 1-2 GB of swap (inference) for the sync. Watch the 1 GB egress: posters at 30-80 KB each run out after roughly 15,000-30,000 poster views a month (inference).

### AWS (changed 15 July 2025)

| Item | Detail | Source |
|---|---|---|
| New accounts | $100 credit at sign-up, up to $100 more for activities; Free plan or Paid plan | [S9, S10] |
| Free plan end | After 6 months or when credits run out: account closes, data kept 90 days, then deleted unless you upgrade | [S10, S10b] |
| Eligible EC2 (accounts since 15 July 2025) | t3.micro, t3.small, t4g.micro, t4g.small, c7i-flex.large, m7i-flex.large | [S11] |
| Old accounts | t2.micro / t3.micro, 12 months | [S11] |
| SMTP | Port 25 to public addresses blocked by default; removal on request | [S11b] |

**Verdict:** fine for a 6-month trial in Mumbai (`ap-south-1`), not a free home. The FAQ also gives credit expiry as 6 months in one place and 12 in another [S10b].

### Microsoft Azure

| Item | Detail | Source |
|---|---|---|
| Credit | $200 for 30 days; move to pay-as-you-go within 30 days to keep the 12-month services | [S13] |
| VMs, 12 months | 750 hours each of B1s, B2pts v2 (Arm), B2ats v2 (AMD) | [S13] |
| Always free | App Service: up to 10 web apps, 1 GB storage, "1 hour per day"; Functions 1 M requests; Container Apps; Static Web Apps | [S13] |
| App Service Free | Shared VM, CPU minutes quota, can't scale out; to add a custom DNS name "scale up your plan to a higher tier" | [S15] |
| Card | Phone, non-prepaid credit or debit card, Microsoft or GitHub account | [S13] |
| SMTP | Port 25 blocked for non-Enterprise subscriptions; authenticated SMTP on 587 "isn't restricted ... regardless of the subscription type" | [S16] |

**Verdict:** a B2ats v2 (2 vCPU, 1 GB, inference from the size name, not checked) runs the app unchanged for 12 months, then bills. App Service Free (1 CPU-hour a day, no custom domain) can't run a daily sync or stay up.

### Render

Free web services spin down after 15 minutes without inbound traffic and take about one minute to start; 750 instance hours per workspace a month; filesystem lost on redeploy, restart or spin-down; no disks; outbound 25, 465 and 587 blocked; custom domains supported; Render says "Do not use them for production applications" [S12]. Regions: Oregon, Ohio, Virginia, Frankfurt, Singapore [S19]. Free Postgres expires after 30 days [S12].

### Railway

Trial: one-time $5, 30 days, 1 GB RAM; then the Free plan with $1 credit a month [S17]. Free plan per service: 0.5 GB RAM, 1 vCPU, 0.5 GB volume [S18]. "SMTP is only available on the Pro plan and above" [S21]. Hobby is $5 a month including $5 of usage [S18]. Singapore region `asia-southeast1-eqsg3a` [S22b]. Trial volumes are deleted 30 days after the credits expire [S17].

### Fly.io

"New organizations don't have a free tier or a monthly free usage allowance"; trial of 2 machine-hours or 7 days; shared-cpu-1x 256 MB $2.19, 512 MB $3.69, 1 GB $6.70 a month; volumes $0.15/GB/month; India egress $0.12/GB [S20]. Singapore (`sin`) is the only nearby region; Mumbai isn't listed [S22]. A Fly staff member says there's no per-account block on outbound port 25 [S23] (forum, not docs). Inference: 512 MB + 1 GB volume in Singapore is about $3.84 a month plus egress.

### Koyeb

Free instance: 0.1 vCPU, 512 MB, 2 GB SSD, one per org, Frankfurt or Washington only, scales to zero after 1 hour without traffic, can't use Volumes [S24]. Volumes exist only in Washington and Frankfurt and can't attach to free or eco instances [S25].

### Northflank

Sandbox: 2 services, 2 jobs, 1 addon, "Always on", "No card needed", resources up to $20 a month, compute "Limited" [S26]. The docs say the sandbox "should not be used for production applications" [S27]. I couldn't find free-tier regions, volume size or SMTP policy (Section 8). Worth a test if Oracle sign-up fails.

### Zeabur, Back4App, Hugging Face, Glitch, Replit

- **Zeabur Free:** 0 custom domains, 0 email quota; Dev plan $5 a month with 14 days free [S28]. No good.
- **Back4App containers free:** 0.25 shared CPU, 256 MB, 100 GB transfer, USA only, no card; paid from $5 a container [S29]. Too little RAM, no disk stated.
- **Hugging Face Spaces:** not for this. Docker Spaces "require a paid plan to create"; disk is "not persistent"; free hardware sleeps after 48 hours idle; outbound only on ports 80, 443 and 8080, so Gmail SMTP can't connect [S31, S32]. It's built for ML demos.
- **Glitch:** project hosting ended 8 July 2025 [S33].
- **Replit:** Starter apps can be published (with a badge); Autoscale, Static, Reserved VM, Scheduled types; Replit says to avoid relying on data written to a published app's filesystem [S41]. Prices weren't on the pricing page [S42].

## 5. Serverless platforms: why they don't fit, and what would change

| Platform | Free limits that matter | Source |
|---|---|---|
| Vercel Hobby | Functions max 300 s, 2 GB / 1 vCPU, 4.5 MB request/response body, single region by default (`iad1`) | [S43] |
| Netlify | Functions run in an "ephemeral runtime"; scheduled functions limited to 30 s; use Blobs or Netlify Database for durable data | [S44, S45] |
| Cloudflare Workers Free | 100,000 requests a day, **10 ms CPU** per request and per cron run, 128 MB, 50 subrequests, 5 cron triggers; outbound port 25 blocked | [S46, S47] |
| Cloudflare D1 Free | 5 M rows read and 100,000 rows written a day, 5 GB total | [S48] |
| Deno Deploy Free | 1 M requests, 20 GiB egress, 10 h active CPU a month, 512 MB, 5 custom domains | [S49, S50] |
| Turso Free | 100 databases, 5 GB, 500 M rows read and 10 M written a month, 3 GB syncs, no card | [S30] |

**The mismatch (inference):** these platforms run short-lived function instances with no shared, lasting disk, so (1) a `data/mana-cinema.db` file written by one request is not there for the next, and WAL needs one process owning the file; (2) the daily IMDb job streams ~900 MB compressed for minutes, far past 10 ms (Workers), 30 s (Netlify scheduled) or 300 s (Vercel); (3) the poster cache has nowhere to live.

**What a port would need (inference):**
1. Replace `node:sqlite` calls with a remote client: Turso's libSQL (SQLite dialect, so most SQL carries over; calls become async over HTTP) or D1 bindings (Workers only, also async).
2. Move the IMDb + TMDB sync out of the web process to a scheduled runner that can run for minutes (for example a GitHub Actions cron or a home PC) that writes results into Turso/D1. I did not research GitHub Actions limits.
3. Serve posters straight from TMDB's image CDN or store them in object storage (R2 / Blobs) instead of `data/`.
4. Swap Gmail SMTP for an HTTPS email API, since Workers block port 25 and serverless SMTP is unreliable (Workers' docs don't mention 465/587 [S47]).
5. Express 5 runs on Vercel/Netlify Node functions; on Workers it would need a rewrite or a compatibility layer (not checked).

## 6. Cheapest paid fallback

| Option | Price | Specs | Region | SMTP | Source |
|---|---|---|---|---|---|
| Hetzner CPX02 | €7.99/month (Singapore, 0.5 TB); €6.49 in EU (20 TB) | 1 vCPU, 1 GB, 20 GB NVMe, IPv4 included | Singapore SIN1 | 25 and 465 blocked; **587 allowed**; unblock after 1 month + paid invoice | [S34, S36] |
| Hetzner CX23 | €5.99/month | 2 vCPU, 4 GB, 40 GB, 20 TB | EU only | Same | [S35] |
| AWS Lightsail | $5/month IPv4, $3.50 IPv6-only | 0.5 GB, 2 vCPU, 20 GB; Mumbai gets half the transfer (0.5 TB) | Mumbai | Not checked for Lightsail | [S38] |
| Fly.io | about $3.84/month (inference) | 512 MB + 1 GB volume | Singapore | No account block per staff | [S20, S23] |
| DigitalOcean Basic | $4/month | 1 vCPU, 512 MiB, 10 GiB, 500 GiB | Bangalore BLR1 available | **25, 465, 587 all blocked** | [S39, S39b, S40] |
| Railway Hobby | $5/month incl. $5 usage | - | Singapore | **SMTP blocked** (Pro only) | [S18, S21] |

On 27 October 2026 every Hetzner create button showed "currently unavailable" on the plan pages [S34, S35]. In rupees (inference, at about ₹90 to the euro and ₹85 to the dollar, my assumed rates): Hetzner Singapore about ₹720, Lightsail about ₹425, plus 18% GST where it applies.

## 7. Recommendation and setup

**Ranking for MANA CINEMA:**
1. **Oracle Cloud Always Free, A1 in Mumbai (or Hyderabad).** Runs unchanged, India region, real disk, 465/587 open, no sleep. Watch idle reclamation and keep off-VM backups.
2. **Google Cloud e2-micro (us-central1).** Runs unchanged and is always free, but 1 GB RAM, US-only and 1 GB egress a month. Put Cloudflare's free proxy in front to save egress (inference).
3. **Free but needs code changes: Render free (Singapore) + Turso + HTTPS email API + sync job elsewhere.** Sleeps after 15 minutes; only worth it if both VMs are refused.
4. If nothing free works: **Hetzner CPX02 Singapore (€7.99)** or **Lightsail Mumbai ($5)**.

**Oracle setup, step by step** (commands are standard Ubuntu; Oracle-specific points cite sources, the rest is inference):

1. **Sign up** at cloud.oracle.com. Choose home region **India West (Mumbai)** or **India South (Hyderabad)**; it is permanent for Always Free [S2, S3]. Card and phone needed [S2].
2. **Create the VM:** Compute > Instances > Create. Image: Canonical Ubuntu 24.04 (aarch64). Shape: VM.Standard.A1.Flex, for example 1 OCPU / 6 GB (or 2 / 12), keeping the total within 2 OCPU / 12 GB [S1]. Boot volume about 50 GB (counts toward the 200 GB) [S1]. Paste your SSH public key. Note the public IP. If you get "out of host capacity", retry later or try another shape size [S1].
3. **Open the cloud firewall:** Networking > your VCN > subnet > Security List > Add ingress rules: TCP 80 and 443 from `0.0.0.0/0` (SSH 22 is there by default) [S5].
4. **Open the OS firewall** (Oracle images use iptables; don't use UFW [S5, S5b]):
   ```sh
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
   sudo netfilter-persistent save
   ```
5. **Install Node 24** (NodeSource's setup script, or download the official `linux-arm64` tarball from nodejs.org):
   ```sh
   curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
   sudo apt-get install -y nodejs git sqlite3
   node -v   # expect v24.x
   ```
6. **Get the code and secrets:**
   ```sh
   sudo useradd -m -s /bin/bash mana
   sudo -iu mana git clone <your repo> /home/mana/app
   cd /home/mana/app && npm ci --omit=dev
   nano /home/mana/app/.env       # PORT=3000, SMTP_USER, SMTP_PASS (Gmail app password), TMDB key, etc.
   chmod 600 /home/mana/app/.env
   ```
   Never commit `.env`; keep a copy in a password manager.
7. **Run with systemd** (`/etc/systemd/system/mana-cinema.service`):
   ```ini
   [Unit]
   Description=MANA CINEMA
   After=network-online.target
   [Service]
   User=mana
   WorkingDirectory=/home/mana/app
   EnvironmentFile=/home/mana/app/.env
   ExecStart=/usr/bin/node server/index.js
   Restart=always
   [Install]
   WantedBy=multi-user.target
   ```
   `sudo systemctl daemon-reload && sudo systemctl enable --now mana-cinema`, logs with `journalctl -u mana-cinema -f`. (pm2 works too; systemd needs nothing extra.)
8. **Domain:** add an `A` record for `manacinema.example` (and `www`) pointing at the VM's public IP. No domain yet: a free subdomain from a dynamic-DNS service (e.g. DuckDNS) works for Caddy's certificate too (not researched).
9. **Caddy for automatic HTTPS:** install from Caddy's apt repo, then `/etc/caddy/Caddyfile`:
   ```
   manacinema.example, www.manacinema.example {
       encode zstd gzip
       reverse_proxy 127.0.0.1:3000
   }
   ```
   `sudo systemctl reload caddy`. Caddy gets certificates from Let's Encrypt (ZeroSSL fallback) once DNS points at the server and ports 80/443 are open [S51]. Bind Node to 127.0.0.1 if the app allows it, so only Caddy is public.
10. **Back up the SQLite file** (WAL mode, so don't just copy the file while it's being written):
    ```sh
    sqlite3 /home/mana/app/data/mana-cinema.db ".backup '/home/mana/backup/mana-$(date +%F).db'"
    ```
    Run it daily from cron, keep about 14 copies, and copy them **off the VM** (Oracle Object Storage, your PC via `scp`, or a private cloud drive), because a reclaimed VM takes its disks with it. Oracle also allows 5 free volume backups [S1].
11. **Avoid idle reclamation:** check the instance's CPU and memory metrics after a week. If all are under 20%, shrink the RAM so memory use rises above 20%, or upgrade to Pay As You Go and set a budget alert (inference; see Section 8).
12. **Gmail SMTP:** use port 465 (TLS) or 587 (STARTTLS) with an app password; port 25 is the only one Oracle names as blocked [S4]. Send a test sign-in code first thing.

## 8. Not verified

- **Oracle and ports 465/587:** Oracle's note names only port 25; no page says 465/587 are open. Test with `openssl s_client -connect smtp.gmail.com:465` on the VM.
- **Oracle idle reclamation and Pay As You Go:** the claim that upgrading to PAYG exempts Always Free VMs from reclamation is widely repeated but I found no Oracle page saying so. Oracle's Free Tier FAQ returned HTTP 403.
- **Oracle A1 capacity in Mumbai/Hyderabad:** availability changes daily; nothing to cite.
- **Oracle boot volume minimum:** the page gives both 47 GB and 50 GB [S1].
- **Google ingress pricing:** not checked; inbound is free on most clouds, but the IMDb downloads are ~30 GB a month inbound.
- **AWS credit expiry:** the FAQ says 6 months in one place and 12 in another [S10b]. Card requirement for the Free plan not checked.
- **Azure:** managed disk allowance, bandwidth allowance, B2ats v2 RAM and India-region availability for free sizes were not on the pages I read. A community answer says B1s is being retired in many regions (forum, not used as a source).
- **Render free RAM/CPU and bandwidth:** not on the docs page; pricing page didn't render figures.
- **Northflank Sandbox:** regions, volume size, SMTP policy, per-service RAM.
- **Koyeb, Back4App, Zeabur, Replit SMTP policies:** not stated on the pages read.
- **Fly.io SMTP:** only a staff forum reply [S23], not docs.
- **Lightsail SMTP and free trial length:** not on the pricing page.
- **Hetzner availability:** all create buttons said "currently unavailable" on 27 October 2026; USD prices not shown.
- **NodeSource script and DuckDNS:** not checked; standard community tools.
- **Peak RAM of the IMDb sync:** not measured; inferred from the code.
- **Node 24 support window:** the Node releases page shows v24 as LTS but didn't render its end-of-life date [S52].

## 9. Sources (all accessed 2026-10-27)

- S1 https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- S2 https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm
- S3 https://docs.oracle.com/en-us/iaas/Content/General/Concepts/regions.htm
- S4 https://docs.oracle.com/en-us/iaas/releasenotes/changes/f7e95770-9844-43db-916c-6ccbaf2cfe24/index.htm (24 June 2021)
- S5 https://docs.oracle.com/en-us/iaas/Content/developer/apache-on-ubuntu/01oci-ubuntu-apache-summary.htm ; https://docs.oracle.com/en-us/iaas/Content/Compute/References/images.htm
- S5b https://docs.oracle.com/en-us/iaas/Content/Compute/References/bestpracticescompute.htm
- S6 https://docs.cloud.google.com/free/docs/free-cloud-features (last updated 2026-10-26)
- S7 https://docs.cloud.google.com/compute/docs/general-purpose-machines (E2 shared-core; last updated 2026-10-26)
- S8 https://docs.cloud.google.com/compute/docs/tutorials/sending-mail (last updated 2026-10-26)
- S9 https://aws.amazon.com/free/
- S10 https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier.html ; https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html
- S10b https://aws.amazon.com/free/free-tier-faqs/
- S11 https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-free-tier-usage.html
- S11b https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-resource-limits.html (port 25 section)
- S12 https://render.com/docs/free
- S13 https://azure.microsoft.com/en-us/pricing/purchase-options/azure-account ; https://azure.microsoft.com/en-us/pricing/free-services/
- S14 https://learn.microsoft.com/en-us/azure/cost-management-billing/manage/create-free-services (search excerpt only)
- S15 https://learn.microsoft.com/en-us/azure/app-service/overview-hosting-plans (updated 2026-08-31)
- S16 https://learn.microsoft.com/en-us/azure/virtual-network/troubleshoot-outbound-smtp-connectivity (updated 2026-07-16)
- S17 https://docs.railway.com/reference/pricing/free-trial
- S18 https://docs.railway.com/reference/pricing/plans
- S19 https://render.com/docs/regions
- S20 https://docs.fly.io/about/pricing
- S21 https://docs.railway.com/reference/outbound-networking
- S22 https://docs.fly.io/reference/regions
- S22b https://docs.railway.com/reference/regions
- S23 https://community.fly.io/t/outbound-port-25-direct-to-mx-smtp-blocked-by-default-on-new-accounts/28537 (Fly staff reply on the forum; secondary)
- S24 https://www.koyeb.com/docs/reference/instances (updated 2026-05-27) ; https://www.koyeb.com/pricing
- S25 https://www.koyeb.com/docs/reference/volumes (updated 2026-05-27)
- S26 https://northflank.com/pricing
- S27 https://northflank.com/docs/v1/application/billing/pricing-on-northflank ; https://northflank.com/docs/v1/application/billing/resource-plans-and-quotas
- S28 https://zeabur.com/pricing
- S29 https://www.back4app.com/pricing/container-as-a-service
- S30 https://turso.tech/pricing ; https://docs.turso.tech/help/usage-and-billing
- S31 https://huggingface.co/docs/hub/spaces-overview
- S32 https://huggingface.co/docs/hub/spaces-gpus (sleep time: 48 hours)
- S33 https://blog.glitch.com/post/changes-are-coming-to-glitch/
- S34 https://www.hetzner.com/cloud/regular-performance
- S35 https://www.hetzner.com/cloud/cost-optimized ; https://www.hetzner.com/cloud
- S36 https://docs.hetzner.com/cloud/servers/faq/ (last changed 2024-09-12)
- S38 https://aws.amazon.com/lightsail/pricing/
- S39 https://www.digitalocean.com/pricing/droplets
- S39b https://docs.digitalocean.com/platform/regional-availability/
- S40 https://docs.digitalocean.com/support/why-is-smtp-blocked/ (verified 13 July 2026)
- S41 https://docs.replit.com/cloud-services/deployments/about-deployments
- S42 https://replit.com/pricing
- S43 https://vercel.com/docs/functions/limitations (last updated 2026-08-24)
- S44 https://docs.netlify.com/build/functions/overview/ (updated 2026-10-26)
- S45 https://docs.netlify.com/build/functions/scheduled-functions/ (updated 2026-10-03)
- S46 https://developers.cloudflare.com/workers/platform/limits/ (updated 2026-10-12)
- S47 https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/ (updated 2026-10-13)
- S48 https://developers.cloudflare.com/d1/platform/pricing/ (updated 2026-04-21)
- S49 https://deno.com/deploy/pricing
- S50 https://docs.deno.com/deploy/pricing_and_limits/ (updated 2025-10-07)
- S51 https://caddyserver.com/docs/automatic-https
- S52 https://nodejs.org/en/about/previous-releases
