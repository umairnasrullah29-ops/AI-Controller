@echo off
title AI Local PC Controller - Auto Installer & Launcher
cd /d "%~dp0"

echo ============================================================
echo  AI LOCAL PC CONTROLLER - FIRST-TIME SETUP & LAUNCHER
echo ============================================================
echo.
echo  This will automatically:
echo    1. Detect and install Node.js if missing
echo    2. Install all dependencies
echo    3. Set up the database
echo    4. Install Playwright browser
echo    5. Create your desktop shortcut
echo    6. Start the application
echo.
echo  Please wait - this may take a few minutes on first run...
echo ============================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-prerequisites.ps1"

if %ERRORLEVEL% NEQ 0 (
  echo.
  echo  [ERROR] Setup failed. Please check the messages above.
  echo  If Node.js was just installed, please RESTART this launcher.
  pause
  exit /b 1
)
