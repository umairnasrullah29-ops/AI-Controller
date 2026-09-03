@echo off
title AI Local PC Controller
cd /d "%~dp0"

echo ============================================================
echo 🚀 Launching AI Local PC Controller (v2.0)
echo ============================================================
echo.
echo  - Host Agent Gateway: http://127.0.0.1:8765
echo  - Web Application UI: http://localhost:3001
echo.
echo Opening Web Interface in default browser...
echo ============================================================
echo.

start "" powershell -NoProfile -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:3001'"

npm start
