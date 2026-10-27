#!/usr/bin/env bash
# Puts the newest code from GitHub live: backs up the database, pulls, installs packages, checks, restarts.
# Run on the server as the ubuntu user (it uses sudo):  bash /home/mana/app/deploy/update.sh
set -euo pipefail
APP=/home/mana/app
as_mana() { sudo -u mana -H bash -c "cd $APP && $*"; }

echo "Backing up the database first..."
as_mana "node server/backup.js"

echo "Getting the newest code..."
as_mana "git pull --ff-only"

echo "Installing packages..."
as_mana "npm ci --omit=dev"

echo "Checking the code..."
as_mana "npm run check"

echo "Updating the service files and restarting..."
sudo cp "$APP"/deploy/mana-cinema.service "$APP"/deploy/mana-cinema-backup.service "$APP"/deploy/mana-cinema-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl restart mana-cinema
sleep 3
if curl -fsS http://127.0.0.1:8080/api/health > /dev/null; then
  echo "Done: the site is up."
else
  echo "The site didn't answer. See: journalctl -u mana-cinema -n 50" >&2
  exit 1
fi
