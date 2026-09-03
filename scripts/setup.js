/**
 * Universal Automated Setup Script (`npm run setup`)
 * Automatically detects and installs all prerequisites, database schema,
 * Playwright browser binaries, and Desktop shortcut for any user.
 */

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const { setupDesktopIcon } = require("./setup-desktop-icon");

function runCommand(cmd, label) {
  console.log(`\n⏳ ${label}...`);
  try {
    execSync(cmd, { stdio: "inherit", cwd: path.resolve(__dirname, "..") });
    console.log(`✅ ${label} completed successfully.`);
  } catch (err) {
    console.error(`❌ ${label} failed:`, err.message);
  }
}

function main() {
  console.log("==========================================================");
  console.log("🚀 AUTOMATED UNIVERSAL SETUP FOR AI LOCAL PC CONTROLLER");
  console.log("==========================================================\n");

  const rootDir = path.resolve(__dirname, "..");
  const envPath = path.join(rootDir, ".env");
  const envExamplePath = path.join(rootDir, ".env.example");

  // 1. Create .env from .env.example if missing
  if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
    console.log("📄 Creating default .env file from .env.example...");
    fs.copyFileSync(envExamplePath, envPath);
    console.log("✅ .env created successfully.");
  }

  // 2. Install workspace dependencies
  runCommand("npm install", "Installing all npm workspace dependencies");

  // 3. Push Prisma Database Schema
  runCommand("npm run db:push", "Pushing database tables (SQLite / Prisma)");

  // 4. Install Playwright Headless Chromium
  runCommand("npx playwright install chromium", "Installing Playwright Chromium browser binaries");

  // 5. Generate Desktop Shortcut for current user
  setupDesktopIcon();

  console.log("==========================================================");
  console.log("🎉 SETUP COMPLETE! YOU ARE READY TO GO.");
  console.log("==========================================================");
  console.log("\nTo start the application anytime, choose ONE of these options:");
  console.log("  1️⃣  Double-click the 'AI Local PC Controller' icon on your Desktop");
  console.log("  2️⃣  Run `npm start` in your terminal\n");
}

main();
