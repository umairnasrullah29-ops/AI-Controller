# AI Local PC Controller — System Architecture & Interview Preparation Guide (v2.0)

> A comprehensive, technical reference for developers, software architects, and candidates preparing for engineering interviews on local AI agent architectures, security pipelines, OS automation gateways, and full-stack TypeScript design patterns.

---

## 🎯 Executive Summary & Purpose

The **AI Local PC Controller** is an autonomous, local-first system designed to allow users to control their desktop OS (Windows/macOS/Linux) via natural language voice or text commands. It bridges high-level Reasoning LLMs (Google Gemini 1.5 / 2.0 Flash) with low-level System OS Operations without giving the LLM raw shell access.

### Core Philosophy
> **"LLM ≠ Authority"**  
> The Large Language Model is strictly a **Reasoning & Planning Engine**. It proposes structured tool calls in JSON. The **Policy Engine** is the sole security authority that enforces risk rules, and the **Execution Gateway** ensures zero unauthenticated or unvalidated execution ever reaches the OS.

---

## 🏛️ System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CLIENT / UI LAYER                             │
│  Next.js 14 Web UI (React, Tailwind CSS, Lucide Icons)                  │
│  - Push-to-Talk Voice Recording (MediaRecorder API -> Deepgram Nova-2)  │
│  - Speech Audio Playback (HTML5 Audio -> Deepgram Aura TTS)             │
│  - Security Authorization Cards (Allow & Execute / Deny)                │
│  - Real-Time System Health Indicator & Mid-Execution Stop Button         │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           WEB API GATEWAY                               │
│  Next.js App Router API Routes (`apps/web/src/app/api/`)                │
│  - `POST /api/chat`       : Primary reasoning, planning & recovery      │
│  - `POST /api/voice/stt`  : Deepgram Nova-2 speech transcription          │
│  - `POST /api/voice/tts`  : Deepgram Aura text-to-speech generation     │
│  - `POST /api/tasks/*`    : Task approve, cancel, and stop endpoints    │
│  - `GET  /api/undo`       : UndoEngine pre-mutation rollback restoration │
│  - `GET  /api/audit`      : Append-only audit log data provider         │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       REASONING & POLICY LAYER                          │
│  - AI Provider (`@ai-pc/ai`)        : GeminiProvider (JSON mode)        │
│  - Contract Validation (`@ai-pc/contracts`): Zod Schema Type Check       │
│  - Policy Engine (`@ai-pc/executor`): Risk Evaluation (5 Levels)        │
│  - Audit Logger (`@ai-pc/database`) : Database Audit Log Writer          │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ HMAC-SHA256 Signed HTTP
                                     ▼ (x-host-agent-signature)
┌─────────────────────────────────────────────────────────────────────────┐
│                        HOST AGENT OS GATEWAY                            │
│  Standalone Node.js Server (`apps/host-agent` on port 8765)              │
│  - HMAC Middleware Verification (rejects unsigned local calls)          │
│  - Tool Registry Execution (`@ai-pc/tools` — 24 Tools)                 │
│  - Native N-API C++ Hooks (`@ai-pc/native` — BitBlt & PSAPI)            │
│  - Playwright Browser Session Pool (`session-manager.ts`)               │
│  - Post-Execution Result Verification (`tool.verify()`)                 │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                             HOST OS & DEPOSIT                           │
│  Windows 10/11 Operating System                                         │
│  - Filesystem (Read/Write/Copy/Move/Rename/Delete)                      │
│  - Processes & Desktop Applications                                     │
│  - Screen Display & Clipboard                                           │
│  - Restricted Terminal Allowlist                                        │
│  - Headless Chromium Browser                                            │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 📚 Key Concepts & Definitions

### 1. Monorepo Workspaces (`package.json` workspaces)
- **What it is**: A repository structure holding multiple packages and applications in a single codebase.
- **How it's used here**: `apps/web`, `apps/host-agent`, `@ai-pc/contracts`, `@ai-pc/ai`, `@ai-pc/tools`, `@ai-pc/executor`, `@ai-pc/database`, `@ai-pc/native`.
- **Why it matters**: Shared types (`contracts`) and tools (`tools`) are written once and shared seamlessly without publishing to npm.

### 2. Risk Levels & Policy Engine (`PolicyEngine`)
- **What it is**: A security gatekeeper that categorizes operations into 5 risk tiers:
  1. `safe`: Read-only actions (`filesystem.list`, `process.list`, `screen.capture`, `clipboard.read`, `browser.read`). Auto-approved.
  2. `low`: Reversible creation/launch (`create_directory`, `copy`, `rename`, `application.open`, `clipboard.write`). Auto-approved.
  3. `medium`: Mutations requiring state updates (`filesystem.write`, `filesystem.move`, `terminal.execute`, `browser.fill_form`). Auto-approved with undo snapshot.
  4. `high`: Destructive operations (`filesystem.delete`, `process.stop`). **Always blocked for explicit UI confirmation**.
  5. `critical`: OS shutdown, formatting, partition changes. **Always blocked**.

### 3. HMAC-SHA256 Payload Signing (`ExecutionGateway`)
- **What it is**: Hash-based Message Authentication Code.
- **How it's used**: The Web API creates a signature using `timestamp + stringified_body` and a shared `HOST_AGENT_SECRET`. The Host Agent computes the same hash upon receiving the request.
- **Why it matters**: Prevents unauthorized local scripts or malicious browser tabs from making unauthenticated HTTP calls directly to the Host Agent on port `8765`.

### 4. Zod Schema Validation & Structured Output Parsing
- **What it is**: A TypeScript-first schema validation library.
- **How it's used**: Gemini is prompted to return strict JSON matching `AgentDecisionSchema`. Every tool argument is parsed against its Zod `inputSchema` before execution.
- **Why it matters**: Ensures malicious or malformed LLM outputs are caught and rejected before reaching system functions.

### 5. Undo Engine & Pre-Mutation Rollback Snapshots (`UndoEngine`)
- **What it is**: A rollback engine that creates backups prior to modifying state.
- **How it's used**: Before `filesystem.write`, `filesystem.move`, `filesystem.rename`, or `filesystem.delete` runs, `UndoEngine.createSnapshot()` copies the target file to a temporary backup directory.
- **Why it matters**: Allows the user to restore overwritten or deleted files via `POST /api/undo`.

### 6. Playwright Headless Browser Session Manager (`session-manager.ts`)
- **What it is**: A singleton Chromium browser pool.
- **How it's used**: Maintains named page contexts, supports interactive click, type, search, and form-filling, auto-closes idle pages after 5 minutes, and scrubs sensitive secrets (Bearer tokens, API keys, passwords) before returning text to the AI.

### 7. Native N-API C++ OS Hooks (`@ai-pc/native`)
- **What it is**: Node.js N-API C++ C-bindings compiled via `node-gyp`.
- **How it's used**: Windows GDI `BitBlt` screen capture (<10ms) and `TlHelp32`/`PSAPI` process enumeration. Includes graceful fallback to CLI scripts when C++ build tools are absent.

### 9. One-Shot Error Auto-Recovery (`executePlanWithRecovery`)
- **What it is**: An automated resilience mechanism that handles step execution failures mid-task.
- **How it's used**: When a multi-step plan step fails (e.g. file lock or invalid path), `POST /api/chat` passes the error message back to Gemini in a recovery context. Gemini generates an alternative plan step (e.g., using a fallback tool) which is executed automatically without breaking the user session.

### 10. Mid-Execution Task Cancellation (`cancelledTasks`)
- **What it is**: A signal-based cancellation engine for multi-step task execution.
- **How it's used**: When a user clicks **Stop Task** in the UI, `POST /api/tasks/cancel` registers the task ID in a global `cancelledTasks` Set. `executePlanWithRecovery` checks this set before executing each step and halts execution cleanly if flagged.

### 11. Speech AI Pipeline (Deepgram STT & TTS)
- **Speech-to-Text (STT)**: User holds mic -> Browser `MediaRecorder` encodes WebM audio -> `POST /api/voice/stt` sends buffer to Deepgram **Nova-2** -> Transcribed text returned to input box.
- **Text-to-Speech (TTS)**: Assistant message rendered -> User clicks **Listen** -> `POST /api/voice/tts` requests audio stream from Deepgram **Aura** (`aura-asteria-en`) -> HTML5 Audio plays binary stream.

---

## 🛠️ Monorepo Package Breakdown

| Package | Path | Responsibility |
|---|---|---|
| `apps/web` | `apps/web` | Next.js 14 Web UI, Push-to-Talk Mic, Confirmation Cards, API Routes (`/api/chat`, `/api/tasks/*`, `/api/voice/*`, `/api/undo`, `/api/audit`, `/api/health`). |
| `apps/host-agent` | `apps/host-agent` | Standalone Node.js process listening on `http://127.0.0.1:8765`. Validates HMAC signatures and executes OS tools natively. |
| `@ai-pc/contracts` | `packages/contracts` | Shared TypeScript types, Zod schemas (`AgentDecisionSchema`, `TaskPlanSchema`, `RiskLevel`, `ToolDefinition`). |
| `@ai-pc/ai` | `packages/ai` | `GeminiProvider` implementing `AIProvider` interface. Enforces structured JSON output and file editing workflow. |
| `@ai-pc/tools` | `packages/tools` | Complete 24-tool registry across Filesystem, Process, Screen, Clipboard, Terminal, Browser, and Undo. |
| `@ai-pc/executor` | `packages/executor` | Security hierarchy: `PolicyEngine` (risk classification), `AuditLogger` (DB logger), `ExecutionGateway` (HMAC signer). |
| `@ai-pc/database` | `packages/database` | Prisma schema and database client (`conversations`, `messages`, `tasks`, `tool_executions`, `audit_logs`). |
| `@ai-pc/native` | `packages/native` | C++ N-API Windows hooks (GDI screen capture, PSAPI process listing) with fallback logic. |

---

## 🎓 Interview Questions & Model Answers

### Q1: Why split the system into a Next.js Web App and a separate Host Agent process?
> **Answer**:  
> "Separating the API server from the Host Agent isolates execution privileges. The Web API handles user interaction, authentication, and LLM orchestration, while the Host Agent operates directly on the OS. Placing the Host Agent behind an HMAC-authenticated HTTP boundary on `127.0.0.1:8765` ensures that even if an attacker injects code into the web application or browser session, they cannot execute arbitrary OS commands without a valid HMAC signature and schema-validated tool payload."

### Q2: How does the system prevent Prompt Injection and arbitrary code execution?
> **Answer**:  
> "We enforce the principle of **'LLM ≠ Authority'**. The LLM never receives raw shell access (`exec` or `eval`). Instead, the LLM is constrained to returning structured JSON matching `AgentDecisionSchema`. Every tool call argument is parsed against its Zod `inputSchema`. The `PolicyEngine` checks the declared risk level, and `terminal.execute` uses a strict command allowlist (`git`, `npm`, `node`, `dir`, etc.) rather than an arbitrary shell parser."

### Q3: How does the Policy Engine handle high-risk vs low-risk actions?
> **Answer**:  
> "Operations classified as `safe`, `low`, or `medium` (like reading a directory or taking a screenshot) are auto-approved. Destructive operations classified as `high` (like deleting files or killing processes) are intercepted by the `PolicyEngine`. The server creates a task with status `awaiting_approval` and prompts the user in the UI via an interactive Authorization Card (`Allow & Execute` / `Deny`). Execution only proceeds after explicit user confirmation."

### Q4: How does the AI edit existing files without losing content or context?
> **Answer**:  
> "The system prompt dictates a 4-step file editing protocol:  
> 1. Use `filesystem.read` to fetch the file's current content.  
> 2. Apply modifications to the text in memory.  
> 3. Create a pre-mutation `UndoEngine` snapshot of the target file.  
> 4. Use `filesystem.write` to commit the changes.  
> If the user's prompt lacks necessary details (e.g., target file path or specific edit instructions), the model responds with `type: 'ask_clarification'` to request the missing information before taking action."

### Q5: How does secret scrubbing work in browser automation?
> **Answer**:  
> "In `session-manager.ts`, after Playwright extracts inner text from a rendered page, the text passes through a regular expression scrubber (`scrubSecrets()`). Regex patterns match Bearer tokens, API keys, basic authentication headers, passwords, and session cookies, replacing them with `[REDACTED]` before the content is passed back into the LLM context or written to audit logs."

### Q6: How does the system handle errors during multi-step execution without crashing?
> **Answer**:  
> "We implement a **One-Shot Error Auto-Recovery** engine (`executePlanWithRecovery()`). If a plan step fails during execution, the system captures the specific error output and makes a high-priority sub-query to Gemini with the error context. Gemini formulates a replacement step using an alternative tool or path. If the recovery step succeeds, execution resumes automatically without prompting the user. If recovery fails, execution stops safely and reports the exact failure state."

### Q7: How does mid-execution task cancellation work in an asynchronous server environment?
> **Answer**:  
> "When the user clicks the **Stop Task** button in the Web UI, an HTTP call is dispatched to `POST /api/tasks/cancel`. The backend adds the `taskId` to an in-memory `cancelledTasks` Set. The `executePlanWithRecovery()` loop checks this set prior to executing every individual tool step. If a cancellation flag is detected, the loop immediately terminates, marks the task as cancelled in the database, removes the task ID from the set, and returns a clean `🛑 Stopped by user` message to the UI."

---

## ⚡ Setup & Verification Commands

```bash
# 1. Single-Command Startup (Host Agent + Web UI):
npm start

# 2. Comprehensive Automated Test Suite (20/20 Tests Passing):
npm test

# 3. Optional Native C++ Addon Build:
npm run build:addon
```
