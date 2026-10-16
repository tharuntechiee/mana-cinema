@echo off
title MANA CINEMA website
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get it from https://nodejs.org ^(version 22.13 or newer^), then run this again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing the server's packages, one time only...
  call npm install --omit=dev
)
if not exist .env (
  copy .env.example .env >nul
  echo Created .env. Open it and set ADMIN_PASSWORD to use the admin portal.
)
echo Starting MANA CINEMA at http://localhost:8080
echo Keep this window open while you use the website. Close it to stop.
start "" "http://localhost:8080/"
node server/index.js
pause
