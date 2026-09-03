import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  AIProvider,
  AgentDecision,
  AgentDecisionSchema,
  RiskLevel,
} from "@ai-pc/contracts";

export class GeminiProvider implements AIProvider {
  private genAI: GoogleGenerativeAI;
  private modelName: string;

  constructor(apiKey?: string, modelName?: string) {
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY environment variable is required.");
    this.genAI = new GoogleGenerativeAI(key);
    this.modelName = modelName || process.env.GEMINI_MODEL || "gemini-3.6-flash";
  }

  async decide(input: {
    systemPolicy: string;
    availableTools: Array<{
      id: string;
      name: string;
      description: string;
      riskLevel: RiskLevel;
      inputSchema: Record<string, unknown> | string;
    }>;
    conversationContext: { role: string; content: string }[];
    userMessage: string;
  }): Promise<AgentDecision> {
    const model = this.genAI.getGenerativeModel({
      model: this.modelName,
      generationConfig: { responseMimeType: "application/json", temperature: 0 },
    });

    const toolList = input.availableTools
      .map((t) => `- ${t.id}: ${t.description} [risk: ${t.riskLevel}]`)
      .join("\n");

    const history = input.conversationContext
      .map((c) => `${c.role.toUpperCase()}: ${c.content}`)
      .join("\n");

    const prompt = `You are an AI PC Controller running on Windows. You execute actions ONLY through the declared tools below.

CORE RULES:
1. Never guess file paths — always use filesystem.list to discover structure first.
2. Before editing a file, ALWAYS read it first with filesystem.read to understand current content.
3. If you need information the user hasn't provided (e.g. which file to edit, what text to add), respond with ask_clarification — do NOT guess.
4. For multi-step tasks (read → edit → verify), use a plan with sequential steps.
5. Never construct raw shell commands. All execution goes through declared tools.
6. High/critical risk actions (delete, stop process) MUST use ask_confirmation.
7. For browser tasks: use browser.navigate first, then browser.read to see the page, then browser.click/type/fill_form to interact.

RESPONSE FORMATS (return valid JSON only — no markdown, no code blocks):

Execute tool actions:
{"type":"plan","plan":{"goal":"<short goal>","steps":[{"toolId":"<tool_id>","args":{<args>},"riskLevel":"<level>"}]}}

Just respond with text (no tools needed):
{"type":"respond","message":"<response>"}

High-risk action requiring user confirmation:
{"type":"ask_confirmation","reason":"<reason>","actions":[{"toolId":"<id>","args":{<args>},"riskLevel":"high"}]}

Need more info from the user:
{"type":"ask_clarification","question":"<specific question>"}

AVAILABLE TOOLS:
${toolList}

TOOL ARGUMENT FORMATS:
filesystem.list        → {"path": "<directory path or name>"}
filesystem.create_directory → {"path":"<parent>","name":"<new folder>"}
filesystem.read        → {"path":"<file path>","encoding":"utf8","maxBytes":100000}
filesystem.write       → {"path":"<file path>","content":"<full new content>","createIfMissing":true}
filesystem.copy        → {"source":"<src>","destination":"<dst>"}
filesystem.move        → {"source":"<src>","destination":"<dst>"}
filesystem.rename      → {"path":"<file path>","newName":"<new name>"}
filesystem.delete      → {"path":"<path>"} ← Risk: high, requires confirmation
process.list           → {"filter":"<optional name filter>"}
process.stop           → {"pid": <number>, "name":"<optional>"} ← Risk: high
application.open       → {"name":"<app name or path>"}
screen.capture         → {"filename":"<optional .png name>"}
clipboard.read         → {}
clipboard.write        → {"text":"<text to copy>"}
terminal.execute       → {"command":"<allowlisted cmd: git|npm|node|dir|echo|ipconfig|ping|whoami|pwd>"}
browser.open           → {"url":"<https url>"}
browser.navigate       → {"url":"<https url>","sessionId":"default"}
browser.read           → {"url":"<optional url>","sessionId":"default"}
browser.click          → {"selector":"<CSS or text= selector>","sessionId":"default"}
browser.type           → {"selector":"<CSS selector>","text":"<text>","clearFirst":true,"sessionId":"default"}
browser.fill_form      → {"fields":[{"selector":"<sel>","value":"<val>"}],"submitSelector":"<sel or null>","sessionId":"default"}
browser.screenshot     → {"filename":"<optional .png>","sessionId":"default"}
browser.search         → {"query":"<search query>","engine":"duckduckgo","sessionId":"default"}
browser.close          → {"sessionId":"default"}

FILE EDITING WORKFLOW:
When user wants to edit/modify a file:
1. Use filesystem.read to get current content
2. Mentally apply the required changes
3. Use filesystem.write to write the full new content
4. If any detail is unclear (which file, what exactly to change), use ask_clarification first

${history ? `CONVERSATION HISTORY:\n${history}\n` : ""}
USER: ${input.userMessage}

Respond with valid JSON only.`;

    try {
      const response = await model.generateContent(prompt);
      return this.parseAndValidate(response.response.text().trim());
    } catch (firstErr: any) {
      console.warn("Gemini first attempt failed:", firstErr?.message || firstErr);

      // Attempt 1: Check deterministic local intent fallback before AI retry
      const localDecision = this.tryLocalIntent(input.userMessage);
      if (localDecision) {
        console.log(`[ai] ⚡ Handled via Local Intent Engine: ${localDecision.type}`);
        return localDecision;
      }

      try {
        const retryResponse = await model.generateContent(
          prompt + "\n\nIMPORTANT: Return ONLY valid JSON. No markdown fences."
        );
        return this.parseAndValidate(retryResponse.response.text().trim());
      } catch (secondErr: any) {
        console.error("Both Gemini attempts failed:", secondErr?.message || secondErr);

        // Check if error is due to API key / Authentication / Service restrictions (e.g. 401 / 400 API_KEY_SERVICE_BLOCKED)
        const errStr = (firstErr?.message || "") + " " + (secondErr?.message || "");
        if (
          errStr.includes("API_KEY_SERVICE_BLOCKED") ||
          errStr.includes("API key not valid") ||
          errStr.includes("API_KEY_INVALID") ||
          errStr.includes("401") ||
          errStr.includes("UNAUTHENTICATED")
        ) {
          return {
            type: "respond",
            message:
              "⚠️ **Gemini API Key Service Restriction Error**\n\nYour API key is active, but the **Generative Language API** service (`generativelanguage.googleapis.com`) is blocked or restricted under this key's API restrictions in Google Cloud Console / AI Studio.\n\n**Quick Fix**:\n1. Visit [Google AI Studio (aistudio.google.com)](https://aistudio.google.com/)\n2. Click **Get API key** $\\rightarrow$ **Create API key** (unrestricted)\n3. Paste key into `.env`: `GEMINI_API_KEY=\"AIzaSy...\"` and save.",
          };
        }

        return {
          type: "ask_clarification",
          question: "I had trouble processing that request. Could you rephrase what you'd like me to do?",
        };
      }
    }
  }

  private tryLocalIntent(userMessage: string): AgentDecision | null {
    const msg = userMessage.toLowerCase().replace(/[.?!,]+$/g, "").trim();

    // 1. Open Application Intent ("open launchpad", "open notepad", "open chrome", "open calc")
    const openMatch = msg.match(/(?:can you\s+)?(?:open|launch|run|start)\s+(?:the\s+)?([a-z0-9_\-.]+)(?:\s+app|\s+for me|\s+please|\s+now)?$/i);
    if (openMatch && openMatch[1]) {
      const appName = openMatch[1].trim();
      const lowerApp = appName.toLowerCase();
      if (appName && !lowerApp.includes("folder") && !lowerApp.includes("file") && lowerApp !== "downloads" && lowerApp !== "desktop" && lowerApp !== "documents") {
        return {
          type: "plan",
          plan: {
            goal: `Launch application '${appName}'`,
            steps: [{ toolId: "application.open", args: { name: appName }, riskLevel: "low" }],
          },
        };
      }
    }

    // 2. List Downloads Folder Intent ("see my downloads folder", "list files in downloads", etc.)
    if (msg.includes("download") && (msg.includes("list") || msg.includes("see") || msg.includes("show") || msg.includes("file") || msg.includes("folder"))) {
      return {
        type: "plan",
        plan: {
          goal: "List contents of Downloads folder",
          steps: [{ toolId: "filesystem.list", args: { path: "Downloads" }, riskLevel: "safe" }],
        },
      };
    }

    // 3. List Desktop Folder Intent ("see my desktop folder", "list files on desktop")
    if (msg.includes("desktop") && (msg.includes("list") || msg.includes("see") || msg.includes("show") || msg.includes("file") || msg.includes("folder"))) {
      return {
        type: "plan",
        plan: {
          goal: "List contents of Desktop folder",
          steps: [{ toolId: "filesystem.list", args: { path: "Desktop" }, riskLevel: "safe" }],
        },
      };
    }

    // 4. List Documents Folder Intent ("see my documents folder", "list files in documents")
    if (msg.includes("document") && (msg.includes("list") || msg.includes("see") || msg.includes("show") || msg.includes("file") || msg.includes("folder"))) {
      return {
        type: "plan",
        plan: {
          goal: "List contents of Documents folder",
          steps: [{ toolId: "filesystem.list", args: { path: "Documents" }, riskLevel: "safe" }],
        },
      };
    }

    // 5. Screenshot / Capture Screen Intent
    if (msg.includes("screenshot") || msg.includes("capture screen") || msg.includes("take screen")) {
      return {
        type: "plan",
        plan: {
          goal: "Capture screen display",
          steps: [{ toolId: "screen.capture", args: {}, riskLevel: "safe" }],
        },
      };
    }

    // 6. List Processes Intent
    if (msg.includes("process") || msg.includes("running app") || msg.includes("task manager")) {
      return {
        type: "plan",
        plan: {
          goal: "List running processes",
          steps: [{ toolId: "process.list", args: {}, riskLevel: "safe" }],
        },
      };
    }

    // 7. Clipboard Read Intent
    if (msg.includes("clipboard") || msg.includes("copied text")) {
      return {
        type: "plan",
        plan: {
          goal: "Read clipboard contents",
          steps: [{ toolId: "clipboard.read", args: {}, riskLevel: "safe" }],
        },
      };
    }

    return null;
  }

  private parseAndValidate(rawJson: string): AgentDecision {
    const clean = rawJson
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const parsed = JSON.parse(clean);
    const result = AgentDecisionSchema.safeParse(parsed);
    if (!result.success) throw new Error(`Zod validation: ${result.error.message}`);
    return result.data;
  }
}
