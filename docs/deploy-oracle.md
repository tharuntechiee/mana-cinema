# Putting MANA CINEMA online: Oracle Cloud Always Free

This guide puts the site on a free Oracle Cloud server in India. The website, the database and the
image cache stay as they are; nothing about the app changes. Why Oracle, and what the other hosts offer:
[research/free-hosting.md](research/free-hosting.md).

**What you get for free, always:** an Ampere A1 Linux server (up to 2 CPUs and 12 GB RAM in total), 200 GB
of disk and 10 TB of traffic a month, in Mumbai or Hyderabad. The site never sleeps.

**What you need:** a card and a phone number to sign up (the card isn't charged on Always Free), about an
hour, and ideally a domain name (₹100–900 a year at any registrar). Without one, see step 5.

**Files in `deploy/`:**

| File | What it does |
|---|---|
| `setup.sh` | First-time setup on the server: Node 24, Caddy, firewall, the `mana` user, the code, the services |
| `mana-cinema.service` | Runs the site at boot and restarts it if it stops |
| `Caddyfile` | Caddy, the front door: free HTTPS certificates and passes visitors to the site |
| `mana-cinema-backup.service` and `.timer` | Backs up the database every night at 02:30 India time |
| `update.sh` | Puts new code from GitHub live (backs up first, then checks, then restarts) |

`npm run backup` (`server/backup.js`) makes a safe copy of the database while the site runs and keeps the
newest 14 in `data/backups/`.

---

## 1. Sign up

1. Go to <https://www.oracle.com/cloud/free/> and choose **Start for free**.
2. Pick the home region **India West (Mumbai)** or **India South (Hyderabad)**. You can't change it later,
   and Always Free servers can only be made in the home region.
3. Finish the card and phone checks. Stay on the free account; don't upgrade unless you decide to (see
   "Keeping the server" at the end).

## 2. Make the server

1. Make an SSH key on your PC if you don't have one (PowerShell):
   ```powershell
   ssh-keygen -t ed25519 -f $HOME\.ssh\oracle_mana
   ```
   Press Enter for no passphrase, or set one. The public key is `$HOME\.ssh\oracle_mana.pub`.
2. In the Oracle console: **Compute > Instances > Create instance**.
   - **Image:** Canonical Ubuntu 24.04 (the aarch64 / ARM build).
   - **Shape:** Ampere, **VM.Standard.A1.Flex**, 2 OCPUs and 12 GB (or 1 and 6 to leave room for a second server).
   - **Networking:** keep "Assign a public IPv4 address" on.
   - **SSH keys:** paste the contents of `oracle_mana.pub`.
   - **Boot volume:** 50 GB is plenty.
3. Create it. If you see **"Out of host capacity"**, try again later (early morning India time often works)
   or with a smaller shape.
4. Note the **public IP address** on the instance page.

## 3. Open ports 80 and 443 in Oracle's firewall

Oracle has a cloud firewall in front of the server. **Networking > Virtual cloud networks >** your network
**> Subnets >** the subnet **> Security Lists > Default Security List > Add Ingress Rules**, twice:

| Source CIDR | IP protocol | Destination port |
|---|---|---|
| `0.0.0.0/0` | TCP | 80 |
| `0.0.0.0/0` | TCP | 443 |

(SSH on port 22 is already open. The server's own firewall is opened by `setup.sh`.)

## 4. Run the setup script

Connect from your PC:
```powershell
ssh -i $HOME\.ssh\oracle_mana ubuntu@YOUR.SERVER.IP
```
Then on the server (replace the domain with yours):
```bash
curl -fsSL https://raw.githubusercontent.com/tharuntechiee/mana-cinema/main/deploy/setup.sh -o setup.sh
bash setup.sh manacinema.in
```
This needs the repository to be public. If it's private, clone it first with a GitHub token, or copy
`setup.sh` up with `scp` and set `REPO=` to a URL that includes the token.

Check that Gmail's mail ports are reachable from Oracle (they should be; only port 25 is blocked):
```bash
timeout 5 openssl s_client -connect smtp.gmail.com:465 -brief < /dev/null
```
You want to see `CONNECTION ESTABLISHED`.

## 5. Point your domain at the server

At your domain registrar, add two **A records**:

| Name | Value |
|---|---|
| `@` (the domain itself) | the server's public IP |
| `www` | the server's public IP |

It usually works within minutes, up to a few hours. Caddy then fetches the HTTPS certificate by itself.

**No domain yet?** A free name from a dynamic-DNS service such as DuckDNS (`yourname.duckdns.org`) works
too: point it at the IP and use that name in `bash setup.sh yourname.duckdns.org`. Google sign-in needs a
real domain or this kind of name; it doesn't work on a bare IP address.

## 6. Bring your current data (optional)

To keep the films, ratings, comments and admin edits from your PC, copy your database up. On your PC, in
the project folder:
```powershell
npm run backup
$newest = Get-ChildItem data\backups\mana-cinema-*.db | Sort-Object Name | Select-Object -Last 1
scp -i $HOME\.ssh\oracle_mana $newest.FullName ubuntu@YOUR.SERVER.IP:/tmp/mana-cinema.db
```
Then on the server:
```bash
sudo install -o mana -g mana -m 600 /tmp/mana-cinema.db /home/mana/app/data/mana-cinema.db && rm /tmp/mana-cinema.db
```
Skip this and the server starts with the original catalogue and fills in IMDb ratings on its own.

## 7. Write the settings (.env)

```bash
sudo -u mana nano /home/mana/app/.env
```
Paste and fill in (the same names as `.env.example`; never commit this file):
```ini
PORT=8080
ADMIN_PASSWORD=a-long-random-password
TMDB_API_KEY=your-tmdb-key

# Sign-in
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
EMAIL_SENDER=smtp
SMTP_USER=your.site.gmail@gmail.com
SMTP_PASS=your-16-letter-app-password
```
Save (Ctrl+O, Enter, Ctrl+X), then lock it so only the site can read it:
```bash
sudo chmod 600 /home/mana/app/.env
```
`NODE_ENV=production`, `HOST=127.0.0.1` and `TRUST_PROXY=1` are set by the service file, so you don't
need them here.

**Google sign-in:** in Google Cloud console > Google Auth Platform > Clients > your Web client, add
`https://manacinema.in` (your domain) to **Authorised JavaScript origins**, and use
`https://manacinema.in/privacy.html` as the privacy policy link under Branding.

## 8. Start it

```bash
sudo systemctl start mana-cinema mana-cinema-backup.timer
curl -s http://127.0.0.1:8080/api/health
```
You should see `{"ok":true,...}`. Open `https://your-domain` in a browser. Then:

- Sign in at `https://your-domain/admin.html` with `ADMIN_PASSWORD`.
- Sign in as a viewer with your email: the code should arrive from your Gmail within a minute.
- Run one backup by hand: `sudo systemctl start mana-cinema-backup && journalctl -u mana-cinema-backup -n 5`.

## 9. Everyday commands

| To | Run on the server |
|---|---|
| See the site's log, live | `journalctl -u mana-cinema -f` |
| Restart the site | `sudo systemctl restart mana-cinema` |
| Put new code from GitHub live | `bash /home/mana/app/deploy/update.sh` |
| Back up now | `sudo systemctl start mana-cinema-backup` |
| See when the next backup runs | `systemctl list-timers mana-cinema-backup` |
| Check Caddy and HTTPS | `sudo systemctl status caddy` and `sudo tail /var/log/caddy/mana-cinema.log` |
| Change settings | `sudo -u mana nano /home/mana/app/.env`, then restart the site |

## 10. Copy backups off the server

The nightly backups live on the server's own disk. If the server is lost, they go with it, so copy one to
your PC now and then (weekly is good). From PowerShell on your PC:
```powershell
ssh -i $HOME\.ssh\oracle_mana ubuntu@YOUR.SERVER.IP "sudo sh -c 'cp `$(ls -1t /home/mana/app/data/backups/*.db | head -1) /tmp/latest.db && chown ubuntu /tmp/latest.db'"
scp -i $HOME\.ssh\oracle_mana ubuntu@YOUR.SERVER.IP:/tmp/latest.db "$HOME\Documents\mana-cinema-$(Get-Date -Format yyyy-MM-dd).db"
```
To restore one: stop the site (`sudo systemctl stop mana-cinema`), put the file at
`/home/mana/app/data/mana-cinema.db` (owner `mana`), delete any `mana-cinema.db-wal` and `-shm` files next
to it, and start the site again.

## Keeping the server

- **Idle servers can be reclaimed.** Oracle may take back an Always Free server if, over 7 days, its CPU,
  network and memory use all stay under 20%. A quiet site can look idle. After the first week, look at the
  instance's **Metrics** in the console. If everything is low, you can make the server smaller (1 OCPU, 6 GB)
  so memory use counts for more, or upgrade the account to Pay As You Go with a budget alert. Many people
  say a Pay As You Go account isn't reclaimed, but Oracle's own pages don't say so. Either way, keep
  copying backups off the server (step 10).
- **Updates:** Ubuntu installs security updates by itself. Once a month, run `sudo apt-get update &&
  sudo apt-get -y upgrade` and restart if it asks.
- **Secrets:** `.env` stays on the server and in your password manager, never in GitHub.
