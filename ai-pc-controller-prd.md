# AI Local PC Controller — Execution PRD (v2.0)

**Purpose of this document:** This is a build-ready specification for an AI coding agent (Claude Code, Cursor, etc.) to implement without needing clarification loops. It locks every ambiguous decision from the original PRD, defines a realistic Day-1 vertical slice, and gives explicit phase-by-phase build instructions with acceptance criteria. Do not re-litigate architecture decisions marked **LOCKED** — implement as specified.

---

## 0. How the AI IDE should use this document

1. Read Section 1 (locked stack), Section 2 (non-negotiable security model), and Section 3 (Day-1 MVP) fully before writing any code.
2. Build strictly in the phase order in Section 8. Do not skip ahead to Phase 2+ features while Phase 0/1 is incomplete.
3. Every tool must conform to the `ToolDefinition` contract in Section 5 — no exceptions, no shortcuts "for now."
4. Never implement `LLM → shell` directly. All execution passes through the pipeline in Section 2.2.
5. When a decision isn't covered here, choose the simplest option that satisfies Section 2 (security) and ship it — do not stop to ask.

---

## 1. Locked Technology Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js (App Router) + TypeScript + Tailwind CSS | Single web app, desktop-first |
| Backend/API | Node.js + TypeScript, inside the same Next.js app (API routes) for MVP | Split into a standalone API service only in Phase 3+ if needed |
| Realtime | Server-Sent Events (SSE) for MVP | Upgrade to WebSocket only if SSE proves insufficient |
| Database | PostgreSQL | Run via Docker Compose. Use Prisma or Drizzle as ORM (Prisma recommended for speed) |
| AI Provider | Gemini (via `@google/generative-ai` SDK), abstracted behind an `AIProvider` interface | Never call Gemini SDK outside the provider abstraction |
| Host Agent | Standalone Node.js + TypeScript process, runs outside Docker on the host OS | Communicates with the API over authenticated local HTTP+SSE (localhost only for MVP) |
| Validation | Zod for all schemas (tool inputs, API bodies, AI structured output) | |
| Containerization | Docker Compose for web + api + postgres | Host Agent is NOT containerized |
| Target OS (Phase 1) | Windows 10/11 | Abstract OS calls behind interfaces from day one even though only Windows ships first |

**Do not** introduce Redis, message queues, microservices, or Kubernetes in the MVP. Add only when a specific bottleneck justifies it.

---

## 2. Non-Negotiable Security Model

### 2.1 Core principle
```
LLM ≠ Authority
LLM = Reasoning / Planning only

Policy Engine   = Authority (decides what's allowed)
Tool Registry   = Capability (defines what CAN be done)
Executor        = Controlled execution
Host Agent      = OS boundary
OS              = Final environment
```

### 2.2 Mandatory execution pipeline
Every action, with no exceptions, flows through:
```
LLM output (structured JSON, schema-validated)
  → Zod schema validation
  → Policy Engine (risk check + permission check)
  → User confirmation (if risk level requires it)
  → Execution Gateway
  → Host Agent
  → OS
  → Result verification
  → Structured result returned to LLM
```

### 2.3 Absolute rules
- The LLM **never** receives shell access directly. There is no code path where a model's raw text output is passed to `exec()`, `spawn()`, or any shell.
- Every tool call is schema-validated against its declared `inputSchema` before it reaches the Host Agent.
- The terminal tool (if implemented) uses a command **allowlist**, not a blocklist.
- Destructive/critical operations (delete, shutdown, format, kill process) always require explicit user confirmation — no config flag may disable this.
- Secrets (API keys, tokens, cookies, passwords) are never included in prompts, logs, or AI-visible tool results.
- The Host Agent authenticates every request from the backend using a short-lived signed token; it does not trust unauthenticated localhost traffic.
- All actions are logged to an append-only audit table before execution begins and updated with the result after.

### 2.4 Risk levels (fixed enum, used everywhere)
```
safe | low | medium | high | critical
```
- `safe`, `low`: execute without confirmation.
- `medium`: confirm if the action affects >1 file/process or a non-trivial scope; otherwise auto-approve.
- `high`, `critical`: always require explicit confirmation via the UI (`Allow Once` / `Allow for This Task` / `Deny`).

---

## 3. Day-1 MVP — What "working today" means

Build one complete **vertical slice**, end to end, before touching anything else:

**User story:** In the web UI, the user types "List the files in my Downloads folder" and "Create a folder called Test on my Desktop." The AI understands intent, calls the correct tool through the full pipeline, the Host Agent executes it on Windows, the result is verified, and the UI shows a natural-language confirmation plus an audit log entry.

**Scope for today:**
- Next.js app with a single chat page (no auth yet — local-only, single-user mode).
- One API route: `POST /api/chat` that takes a message, calls Gemini via the `AIProvider` abstraction, gets back a structured `AgentDecision`.
- Two real tools only: `filesystem.list` and `filesystem.create_directory`. Both `safe`/`low` risk — no confirmation UI needed yet, but log every call.
- Host Agent: a minimal Express (or plain Node http) server on `localhost:8765` that accepts signed requests and executes the two filesystem tools using Node's `fs` module.
- Postgres running in Docker Compose, with a single `audit_logs` table, actually written to on every tool call.
- No voice, no browser automation, no terminal, no undo, no plugins, no auth system yet — explicitly deferred to later phases below.

**Definition of done for today:** running `docker compose up` + starting the host agent + `npm run dev` lets you type the two example commands above and see real results from your real filesystem, with a row appearing in `audit_logs` for each.

---

## 4. Database Schema (MVP, extend later)

```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id),
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id),
  goal TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','running','awaiting_approval','completed','failed','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tool_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id),
  tool_id TEXT NOT NULL,
  args JSONB NOT NULL,
  risk_level TEXT NOT NULL,
  approved BOOLEAN,
  status TEXT NOT NULL CHECK (status IN ('pending','success','failed')),
  result JSONB,
  error TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID,
  tool_id TEXT NOT NULL,
  args JSONB,
  risk_level TEXT NOT NULL,
  approved BOOLEAN,
  result_status TEXT,
  duration_ms INTEGER,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
Add `users`, `permissions`, `plugins`, `automation_rules` etc. only when the phase that needs them starts (Section 8).

---

## 5. Core Type Contracts

```typescript
// packages/contracts/tool.ts
export type RiskLevel = "safe" | "low" | "medium" | "high" | "critical";
export type Platform = "windows" | "linux" | "macos";

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  verified: boolean; // true only after an independent check confirms the effect happened
}

export interface ToolDefinition<TInput = unknown> {
  id: string;                    // e.g. "filesystem.create_directory"
  name: string;
  description: string;
  inputSchema: import("zod").ZodType<TInput>;
  riskLevel: RiskLevel;
  requiresConfirmation: boolean;
  reversible: boolean;
  supportedPlatforms: Platform[];
  timeoutMs: number;
  execute(input: TInput): Promise<ToolResult>;
  verify?(input: TInput, result: ToolResult): Promise<boolean>;
}

// packages/contracts/agent.ts
export type AgentDecision =
  | { type: "respond"; message: string }
  | { type: "plan"; plan: TaskPlan }
  | { type: "ask_confirmation"; reason: string; actions: PlannedAction[] }
  | { type: "ask_clarification"; question: string };

export interface PlannedAction {
  toolId: string;
  args: unknown;
  riskLevel: RiskLevel;
}

export interface TaskPlan {
  goal: string;
  steps: PlannedAction[];
}

// packages/contracts/ai-provider.ts
export interface AIProvider {
  decide(input: {
    systemPolicy: string;
    availableTools: ToolDefinition[];
    conversationContext: { role: string; content: string }[];
    userMessage: string;
  }): Promise<AgentDecision>;
}
```

Implement `GeminiProvider implements AIProvider` in `packages/ai/gemini-provider.ts`. Prompt Gemini to return **JSON only**, matching `AgentDecision`, and parse/validate with Zod before trusting it. If parsing fails, retry once with an error-correction message; if it fails again, surface `ask_clarification`.

---

## 6. Monorepo Structure

```
ai-pc-controller/
├── apps/
│   ├── web/            # Next.js UI + API routes
│   └── host-agent/     # Standalone Node process, runs on host OS
├── packages/
│   ├── contracts/      # Shared TS types + Zod schemas (Section 5)
│   ├── ai/             # AIProvider + GeminiProvider
│   ├── tools/           # Tool definitions (filesystem, process, etc.)
│   ├── executor/        # Policy engine + execution pipeline
│   └── database/        # Prisma schema + client
├── infrastructure/
│   └── docker/
├── docker-compose.yml
└── package.json
```
Use npm/pnpm workspaces. Host Agent imports `contracts` and `tools` but is built/run independently of Docker.

---

## 7. API Surface (MVP, extend in later phases)

```
POST /api/chat                 { conversationId?, message } -> AgentDecision + SSE stream of task events
POST /api/tasks/:id/approve    -> resumes an awaiting_approval task
POST /api/tasks/:id/cancel
GET  /api/tasks/:id/events     -> SSE stream (progress, tool activity, result)
GET  /api/audit                -> paginated audit log
```

---

## 8. Build Phases — execute in this exact order

### Phase 0 — Scaffolding (today, ~1 hr)
- Monorepo + workspaces, Docker Compose (`web`, `postgres`), `.env.example` with `GEMINI_API_KEY`, `DATABASE_URL`, `HOST_AGENT_SECRET`.
- Prisma schema from Section 4, run initial migration.
- **Done when:** `docker compose up` starts Next.js + Postgres cleanly.

### Phase 1 — Vertical slice (today, ~2–4 hrs)
- Implement `contracts`, `ai/GeminiProvider`, `tools/filesystem.list`, `tools/filesystem.create_directory`.
- Implement Host Agent: HTTP server, HMAC-signed request verification using `HOST_AGENT_SECRET`, executes the two tools, returns `ToolResult`.
- Implement Policy Engine (minimal): safe/low → auto-approve; log every call to `audit_logs`.
- Implement `/api/chat` wiring: message → Gemini → AgentDecision → (if plan) execute each step via Executor → Host Agent → verify → respond.
- Build minimal chat UI (message list + input, no fancy plan visualization yet).
- **Done when:** Section 3's two example commands work against your real filesystem and produce audit rows.

### Phase 2 — Planning, risk, confirmation UI
- Add `filesystem.copy`, `filesystem.move`, `filesystem.rename`, `filesystem.delete` (delete = `high` risk).
- Add `process.list`, `process.stop` (`medium`/`high`).
- Add `application.open`.
- Build confirmation modal (`Allow Once` / `Allow for This Task` / `Deny`) wired to `POST /api/tasks/:id/approve`.
- Add plan preview UI (steps checklist as in original mock).
- **Done when:** a destructive command (e.g., delete files) is blocked until the user explicitly confirms, and denial is honored.

### Phase 3 — Verification, recovery, cancellation
- Add `verify()` implementations for every tool (e.g., move = check source gone + destination exists).
- Implement one retry-with-alternative-strategy path on failure; otherwise surface a clarification question — no infinite retries.
- Implement task cancellation propagation (UI → task manager → executor → Host Agent) and a visible "Stop" control.
- **Done when:** a forced failure (e.g., target file locked) is caught, reported in plain language, and doesn't hang the task.

### Phase 4 — Screenshot, clipboard, basic terminal
- Add `screen.capture`, `clipboard.read/write`.
- Add `terminal.execute` with a strict command allowlist, working-directory restriction, timeout, and output size limit; risk = `medium`/`high` depending on command.
- **Done when:** allowlisted commands run with output limits; non-allowlisted commands are rejected before reaching the Host Agent.

### Phase 5 — Voice (push-to-talk only)
- Add push-to-talk mic button, streaming STT (e.g., Web Speech API for MVP, swap later if quality insufficient), TTS for responses.
- **Done when:** a spoken command produces the same result as its typed equivalent.

### Phase 6 — Browser automation
- Integrate Playwright as the browser automation backend, exposed as `browser.open/navigate/search/click/type/read`.
- Enforce domain allowlist/credential isolation — never pass cookies/tokens into AI-visible tool results.
- **Done when:** "open chrome and search X" works and page content returned to the model is scrubbed of secrets.

### Phase 7 — Undo, automation engine, plugins
- Only start once Phases 0–6 are stable. Follow the original architecture sections on Undo (per-action before/after state), Automation Engine (trigger → condition → workflow), and Plugin SDK (manifest + permissions + lifecycle).

---

## 9. Explicit "Do Not" List for the coding agent
- Do not let any model output reach `child_process.exec`/`spawn` without passing through Zod validation + the allowlist.
- Do not skip the `verify()` step and report success based solely on "the function didn't throw."
- Do not persist secrets, passwords, cookies, or full file contents into `audit_logs` or AI-visible context.
- Do not add authentication/multi-user support in the MVP — single local user, defer to a later phase.
- Do not introduce Kubernetes, gRPC, or a separate microservice mesh — this is a local single-machine product.
- Do not silently downgrade a `high`/`critical` action to auto-approved for convenience.

---

## 10. Acceptance Criteria Summary (what "perfect result" means here)
- Phase 1 vertical slice runs end-to-end against the real filesystem today.
- Every tool call, regardless of risk, produces an `audit_logs` row.
- No code path allows raw LLM text to become a shell command.
- Destructive actions are unreachable without explicit user confirmation once Phase 2 lands.
- The system is restartable: Postgres persists task/audit state across `docker compose down && up`.
