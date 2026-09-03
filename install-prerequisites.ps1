# Windows Zero-Dependency Auto-Installer for Node.js and AI Local PC Controller
# Runs natively in PowerShell 5.1+ without requiring Node.js pre-installed.

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " AI LOCAL PC CONTROLLER - AUTOMATED CHECK AND LAUNCHER" -ForegroundColor Cyan
Write-Host "==========================================================`n" -ForegroundColor Cyan

# 1. Check if Node.js is installed
$nodeInstalled = $false
try {
    $nodeVersion = & node -v 2>$null
    if ($nodeVersion) {
        $nodeInstalled = $true
        Write-Host "   [+] Node.js is ready ($nodeVersion)" -ForegroundColor Green
    }
} catch {
    $nodeInstalled = $false
}

if (-not $nodeInstalled) {
    Write-Host "   [!] Node.js was not detected on your system." -ForegroundColor Yellow
    Write-Host "   [*] Automatically downloading and installing Node.js LTS..." -ForegroundColor Cyan

    $installedViaWinget = $false
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        try {
            Write-Host "   [*] Installing Node.js LTS via winget..." -ForegroundColor Gray
            & winget install --id OpenJS.NodeJS.LTS -e --silent --accept-source-agreements --accept-package-agreements | Out-Null
            $installedViaWinget = $true
            Write-Host "   [+] Node.js installed successfully via winget." -ForegroundColor Green
        } catch {
            $installedViaWinget = $false
        }
    }

    if (-not $installedViaWinget) {
        $msiUrl = "https://nodejs.org/dist/v20.12.2/node-v20.12.2-x64.msi"
        $tempMsi = "$env:TEMP\node-v20.12.2-x64.msi"

        Write-Host "   [*] Downloading Node.js LTS installer from nodejs.org..." -ForegroundColor Gray
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $msiUrl -OutFile $tempMsi

        Write-Host "   [*] Running silent Node.js installation..." -ForegroundColor Gray
        Start-Process msiexec.exe -ArgumentList "/i `"$tempMsi`" /qn /norestart" -Wait
        Remove-Item -Path $tempMsi -Force -ErrorAction SilentlyContinue
        Write-Host "   [+] Node.js installed successfully." -ForegroundColor Green
    }

    $nodePath = "C:\Program Files\nodejs"
    if (Test-Path $nodePath) {
        $env:PATH = "$nodePath;$env:PATH"
    }
}

# 2. Verify Node.js availability
try {
    $finalVersion = & node -v
    Write-Host "   [+] Node.js runtime active: $finalVersion" -ForegroundColor Green
} catch {
    Write-Host "   [-] Failed to locate Node.js path. Please restart your terminal or PC." -ForegroundColor Red
    exit 1
}

# 3. Check workspace setup
$projectDir = Split-Path -Path $MyInvocation.MyCommand.Definition -Parent
Set-Location $projectDir

$nodeModulesExist = Test-Path "$projectDir\node_modules"
$dbExists = Test-Path "$projectDir\dev.db"

if ((-not $nodeModulesExist) -or (-not $dbExists)) {
    Write-Host "`n   [*] Initial setup required - installing workspace packages and database..." -ForegroundColor Cyan
    & npm run setup
} else {
    Write-Host "   [+] Environment and dependencies verified." -ForegroundColor Green
    try {
        & node scripts/setup-desktop-icon.js 2>$null
    } catch {}
}

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host " STARTING APPLICATION..." -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
