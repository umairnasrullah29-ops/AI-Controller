# AI Local PC Controller (v2.0 Enterprise Release)

> A production-grade, local-first AI assistant for operating system automation, intelligent file editing, Playwright browser interactions, Native C++ Windows OS hooks, task planning, process management, screen/clipboard capture, restricted terminal execution, and push-to-talk voice control built with Next.js 14, TypeScript, Google Gemini, Deepgram Voice AI, and a dedicated Host Agent execution gateway.

---

## 📖 Complete Technical & Interview Guide

For an in-depth architecture deep dive, security model breakdown, and technical Q&A manual for developer interviews, see:  
👉 [INTERVIEW_AND_ARCHITECTURE_GUIDE.md](file:///c:/Users/DJ%20COMPUTER/OneDrive/Documents/Desktop/AI%20Controller/INTERVIEW_AND_ARCHITECTURE_GUIDE.md)

---

## 🚀 Native C++ Hooks & Advanced Capabilities (v2.0)

### 1. ⚡ Native C++ N-API OS Hooks (`packages/native`)
- **Ultra-Low Latency Screen Capture**: Native GDI `BitBlt` capture targeting **< 10ms** execution time for primary desktop displays.
- **Native Process Enumeration**: Native `TlHelp32` + `PSAPI` process snapshot enumeration for instant process listing.
- **Graceful Fallback**: Automatically falls back to PowerShell GDI / `tasklist` CLI if C++ build tools are not present on the host OS.

### 2. 🌐 Playwright Browser Session Manager (`packages/tools/src/browser`)
- **Interactive DOM Control**: `browser.navigate`, `browser.click`, `browser.type`, `browser.fill_form`, `browser.screenshot`, `browser.search`, and `browser.close`.
- **Singleton Session Pool**: Manages headless Chromium browser pages with a 5-minute auto-cleanup timer.
- **Secret & Credential Scrubbing**: Automatically redacts API keys, Bearer tokens, passwords, and sensitive cookies before page text is exposed to the AI model context.

### 3. 📝 AI File Reading & Editing Suite (`filesystem.read` & `filesystem.write`)
- **Context-Aware File Editing**: The AI reads existing file content via `filesystem.read` to understand context before applying targeted modifications with `filesystem.write`.
- **Pre-Mutation Rollback Snapshots**: Automatically creates an `UndoEngine` snapshot before overwriting any existing file, enabling 1-click restore via `/api/undo`.
- **Context-Driven Clarification**: If essential parameters (target path, edit specifications) are missing or incomplete, the AI gracefully yields an `ask_clarification` response to clarify user intent.

---

## 🏗️ Security Pipeline & Architecture

The system enforces a non-negotiable security hierarchy where **the LLM is a reasoning engine only, never an execution authority**:

```
User Voice / Text (Web UI)
  │ (Push-to-Talk via Deepgram Nova-2 STT)
  ▼
API Gateway (`POST /api/chat`)
  │
  ▼
AI Provider (`@ai-pc/ai` -> Gemini 3.6 Flash)
  │ (Returns structured JSON `AgentDecision`)
  ▼
Schema Validation (Zod Type Check)
  │
  ▼
Policy Engine (`@ai-pc/executor`)
  │ (Evaluates risk: safe | low | medium | high | critical)
  │ ─── If High Risk ───► Awaiting Approval (User Authorization Card)
  ▼
Execution Gateway
  │ (Signs payload with HMAC-SHA256 & Timestamp)
  ▼
Host Agent (`apps/host-agent` on `http://127.0.0.1:8765`)
  │ (Runs natively on Windows Host OS)
  ▼
OS Execution (`@ai-pc/tools`)
  │ (Executes declared tool, runs independent verification logic)
  ▼
Audit Logger & Undo Engine (`@ai-pc/database`)
  │ (Persists before/after state & pre-mutation rollback snapshots)
  ▼
Natural Language Result + Deepgram Aura TTS Audio Stream
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

---

## ⚡ Quick Start

```bash
# 1. Start Host Agent AND Web UI concurrently:
npm start

# 2. Run the 20-test automated verification suite:
npm test

# 3. Optional: Compile Native C++ Addon (requires Visual Studio C++ Build Tools):
npm run build:addon
```

- **Web Interface**: `http://localhost:3001`
- **Host Agent Gateway**: `http://127.0.0.1:8765`
