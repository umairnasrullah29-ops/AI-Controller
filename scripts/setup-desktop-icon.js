/**
 * Dynamic Cross-Platform Desktop Shortcut Generator
 * Works for any user on Windows 10/11 regardless of OneDrive or custom Desktop folder paths.
 */

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

function setupDesktopIcon() {
  console.log("==========================================================");
  console.log("🖥️  SETTING UP DESKTOP SHORTCUT FOR CURRENT USER");
  console.log("==========================================================\n");

  const projectDir = path.resolve(__dirname, "..");
  const batPath = path.join(projectDir, "start-ai-pc.bat");

  // Ensure start-ai-pc.bat exists in project root
  const batContent = `@echo off
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
`;
  fs.writeFileSync(batPath, batContent);
  console.log(`  ✅ Created launcher script at: ${batPath}`);

  if (process.platform === "win32") {
    try {
      // Query Windows for the current user's actual Desktop path
      const userDesktopPath = execSync(
        `powershell -NoProfile -Command "[Environment]::GetFolderPath('Desktop')"`
      )
        .toString()
        .trim();

      if (!userDesktopPath || !fs.existsSync(userDesktopPath)) {
        throw new Error("Could not locate Desktop directory");
      }

      const shortcutPath = path.join(userDesktopPath, "AI Local PC Controller.lnk");

      const psScript = `
$ws = New-Object -ComObject WScript.Shell
$s = $ws.CreateShortcut('${shortcutPath.replace(/'/g, "''")}')
$s.TargetPath = '${batPath.replace(/'/g, "''")}'
$s.WorkingDirectory = '${projectDir.replace(/'/g, "''")}'
$s.Description = 'Launch AI Local PC Controller'
$s.IconLocation = 'C:\\Windows\\System32\\shell32.dll, 15'
$s.Save()
`.trim();

      const tmpPs = path.join(projectDir, "_temp_shortcut.ps1");
      fs.writeFileSync(tmpPs, psScript);

      execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpPs}"`);
      if (fs.existsSync(tmpPs)) fs.unlinkSync(tmpPs);

      console.log(`  ✅ Desktop Icon created on your Desktop:`);
      console.log(`     📍 ${shortcutPath}\n`);
    } catch (err) {
      console.warn("  ⚠️  Could not create Windows desktop shortcut automatically:", err.message);
    }
  } else {
    console.log("  ℹ️  Desktop shortcut creation is automated for Windows host systems.");
  }
}

if (require.main === module) {
  setupDesktopIcon();
}

module.exports = { setupDesktopIcon };
