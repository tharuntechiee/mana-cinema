@echo off
title MANA CINEMA website
cd /d "%~dp0"
echo Starting MANA CINEMA at http://localhost:8080
echo Keep this window open while you use the website. Close it to stop.
start "" "http://localhost:8080/"
python -m http.server 8080
