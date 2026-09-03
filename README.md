# AI Local PC Controller (v2.0 Enterprise Release)

> A production-grade, local-first AI assistant for operating system automation, intelligent file editing, Playwright browser interactions, Native C++ Windows OS hooks, task planning, process management, screen/clipboard capture, restricted terminal execution, and push-to-talk voice control built with Next.js 14, TypeScript, Google Gemini, Deepgram Voice AI, and a dedicated Host Agent execution gateway.

---

## ⚡ Zero-Dependency Automated Setup for Any Machine

If Node.js is **NOT installed** on a user's machine, double-clicking the **`AI Local PC Controller`** Desktop icon or running **`install-and-run.bat`** automatically:
1. Detects that Node.js is missing.
2. Automatically downloads and installs **Node.js LTS** via `winget` or direct official MSI download.
3. Automatically runs `npm run setup` to install all workspace dependencies, Prisma database tables, and Playwright Chromium binaries.
4. Generates the **`AI Local PC Controller`** shortcut icon on their Desktop.
5. Starts the Host Agent (port `8765`), Web UI (port `3001`), and opens the browser to `http://localhost:3001`.

---

## 🖥️ 1-Click Launch Options

```bash
# Option A: Double-Click "AI Local PC Controller" Desktop Icon
# (Automatically installs Node.js + dependencies if missing and launches app)

# Option B: Run via Windows Batch File
install-and-run.bat

# Option C: Run via Terminal (if Node.js is already installed)
npm start
```

---

## 📖 Complete Technical & Interview Guide

For an in-depth architecture deep dive, security model breakdown, and technical Q&A manual for developer interviews, see:  
👉 [INTERVIEW_AND_ARCHITECTURE_GUIDE.md](file:///c:/Users/DJ%20COMPUTER/OneDrive/Documents/Desktop/AI%20Controller/INTERVIEW_AND_ARCHITECTURE_GUIDE.md)

---

## 📋 Environment Configuration (`.env`)

Verify `.env` in the root folder contains:

```env
DATABASE_URL="file:./dev.db"
GEMINI_API_KEY="your-gemini-api-key"
GEMINI_MODEL="gemini-3.6-flash"
DEEPGRAM_API_KEY="your-deepgram-api-key"
DEEPGRAM_STT_MODEL="nova-2"
DEEPGRAM_TTS_VOICE="aura-asteria-en"
HOST_AGENT_URL="http://127.0.0.1:8765"
HOST_AGENT_PORT="8765"
HOST_AGENT_SECRET="super-secret-host-agent-key-change-in-prod-12345"
PORT="3001"
```

---

## 🛠️ Complete Suite of 24 OS & Automation Tools

| Tool ID | Risk Level | Requires Confirmation | Description | Status |
|---|---|---|---|---|
| `filesystem.list` | `safe` | No | Lists directory contents, sizes, and file types | ✅ Active |
| `filesystem.create_directory` | `low` | No | Creates directories with post-creation verification | ✅ Active |
| `filesystem.read` | `safe` | No | Reads file contents for AI context (up to 500KB) | ✅ Active |
| `filesystem.write` | `medium` | No | Overwrites/creates files with pre-write rollback snapshots | ✅ Active |
| `filesystem.copy` | `low` | No | Copies files/directories recursively | ✅ Active |
| `filesystem.move` | `medium` | No | Relocates files and verifies source removal | ✅ Active |
| `filesystem.rename` | `low` | No | Renames files and directories | ✅ Active |
| `filesystem.delete` | `high` | **Yes (UI Confirm)** | Permanently removes files/folders | ✅ Active |
| `process.list` | `safe` | No | Lists running processes (Native PSAPI with CLI fallback) | ✅ Active |
| `process.stop` | `high` | **Yes (UI Confirm)** | Terminates running processes by PID | ✅ Active |
| `application.open` | `low` | No | Launches desktop applications (Notepad, Calc, Chrome) | ✅ Active |
| `screen.capture` | `safe` | No | Desktop screenshot (Native GDI with PowerShell fallback) | ✅ Active |
| `clipboard.read` | `safe` | No | Reads text content from host OS clipboard | ✅ Active |
| `clipboard.write` | `low` | No | Writes text to host OS clipboard with verification | ✅ Active |
| `terminal.execute` | `medium` | No | Executes allowlisted CLI binaries (git, npm, dir, etc.) | ✅ Active |
| `browser.open` | `safe` | No | Opens URL in host default web browser | ✅ Active |
| `browser.navigate` | `safe` | No | Navigates headless Chromium browser to URL | ✅ Active |
| `browser.read` | `safe` | No | Extracts page text with automatic secret scrubbing | ✅ Active |
| `browser.click` | `low` | No | Clicks DOM elements using CSS or text selectors | ✅ Active |
| `browser.type` | `low` | No | Types text into input elements | ✅ Active |
| `browser.fill_form` | `medium` | No | Fills multiple form fields and submits forms | ✅ Active |
| `browser.screenshot` | `safe` | No | Captures screenshot of headless browser page | ✅ Active |
| `browser.search` | `safe` | No | Submits queries to DuckDuckGo/Bing with secret scrubbing | ✅ Active |
| `browser.close` | `safe` | No | Closes named browser session and frees memory | ✅ Active |

---

## 🧪 Verified Automated Test Suite (`npm test`)

Running `npm test` executes **20 automated tests** covering Zod contracts, policy regressions, backend APIs, tool verification, and E2E chat gates:

```
==========================================================
📊 TEST SUITE SUMMARY: 20 PASSED, 0 FAILED
==========================================================
```
