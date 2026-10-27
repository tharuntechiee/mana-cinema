#!/usr/bin/env bash
# First-time setup of MANA CINEMA on a fresh Ubuntu 24.04 server (Oracle Cloud Always Free, Ampere A1).
# Run once as the ubuntu user, after opening ports 80 and 443 in Oracle's Security List
# (docs/deploy-oracle.md, step 3):
#
#   curl -fsSL https://raw.githubusercontent.com/tharuntechiee/mana-cinema/main/deploy/setup.sh -o setup.sh
#   bash setup.sh your-domain.com
#
# It installs Node 24, Caddy and git; makes a "mana" user that runs the site; opens ports 80/443 in the
# server's own firewall; gets the code; and installs the services. It does NOT create .env: you write that
# (step 7 of the guide), then start the site.
set -euo pipefail
DOMAIN="${1:-}"
REPO="${REPO:-https://github.com/tharuntechiee/mana-cinema.git}"
APP=/home/mana/app
if [ -z "$DOMAIN" ]; then echo "Usage: bash setup.sh your-domain.com" >&2; exit 1; fi

echo "== Updating Ubuntu and installing tools"
sudo apt-get update
sudo apt-get -y upgrade
sudo apt-get install -y git curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https sqlite3 netfilter-persistent iptables-persistent

echo "== Installing Node.js 24"
if ! node -v 2>/dev/null | grep -q '^v24\.'; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v

echo "== Installing Caddy (automatic HTTPS)"
if ! command -v caddy > /dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list > /dev/null
  sudo apt-get update
  sudo apt-get install -y caddy
fi

echo "== Opening ports 80 and 443 in the server's firewall (Oracle images use iptables, not ufw)"
for port in 80 443; do
  if ! sudo iptables -C INPUT -m state --state NEW -p tcp --dport "$port" -j ACCEPT 2> /dev/null; then
    sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport "$port" -j ACCEPT
  fi
done
sudo netfilter-persistent save

echo "== Making the mana user and getting the code"
id mana > /dev/null 2>&1 || sudo useradd -m -s /bin/bash mana
if [ ! -d "$APP/.git" ]; then sudo -u mana -H git clone "$REPO" "$APP"; fi
sudo -u mana -H bash -c "cd $APP && npm ci --omit=dev && mkdir -p data"

echo "== Installing the services"
sudo cp "$APP"/deploy/mana-cinema.service "$APP"/deploy/mana-cinema-backup.service "$APP"/deploy/mana-cinema-backup.timer /etc/systemd/system/
sudo sed "s/manacinema\.example/$DOMAIN/g" "$APP"/deploy/Caddyfile | sudo tee /etc/caddy/Caddyfile > /dev/null
sudo mkdir -p /var/log/caddy && sudo chown caddy:caddy /var/log/caddy
sudo systemctl daemon-reload
sudo systemctl enable mana-cinema mana-cinema-backup.timer
sudo systemctl reload caddy || sudo systemctl restart caddy

echo
echo "Setup done. Next:"
echo "  1. Write the settings:  sudo -u mana nano $APP/.env   (see docs/deploy-oracle.md, step 7)"
echo "     then:                sudo chmod 600 $APP/.env"
echo "  2. Start the site:      sudo systemctl start mana-cinema mana-cinema-backup.timer"
echo "  3. Check it:            curl -s http://127.0.0.1:8080/api/health   and open https://$DOMAIN"
