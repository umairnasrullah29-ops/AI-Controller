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
              "⚠️ **AI Service Connection Issue**\n\nYour Gemini API key needs to be updated. The current key doesn't have permission to use the AI service.\n\n**How to fix this:**\n1. Go to [Google AI Studio](https://aistudio.google.com/)\n2. Click **Get API key** → **Create API key**\n3. Copy the new key and paste it into the `.env` file in your project folder\n4. Replace the value next to `GEMINI_API_KEY=` with your new key\n5. Restart the app",
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
    const rawMsg = userMessage.trim();
    const msg = rawMsg.toLowerCase().replace(/[.?!,]+$/g, "").trim();

    // 1. Web URLs & Browser Navigation Intent ("go to gocaliber.app", "open https://...", "register me on gocaliber.app")
    const urlMatch = rawMsg.match(/(?:https?:\/\/)?([a-zA-Z0-9\-]+(?:\.[a-zA-Z0-9\-]+)+(?:\/[^\s]*)?)/i);
    if (urlMatch && urlMatch[1] && (msg.includes("go to") || msg.includes("open") || msg.includes("visit") || msg.includes("register") || msg.includes("navigate") || msg.includes("browse") || msg.startsWith("http"))) {
      let targetUrl = urlMatch[1];
      if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
        targetUrl = `https://${targetUrl}`;
      }
      return {
        type: "plan",
        plan: {
          goal: `Open website '${targetUrl}'`,
          steps: [
            { toolId: "browser.open", args: { url: targetUrl }, riskLevel: "safe" },
            { toolId: "browser.navigate", args: { url: targetUrl }, riskLevel: "safe" },
            { toolId: "browser.read", args: { url: targetUrl }, riskLevel: "safe" },
          ],
        },
      };
    }

    // 2. Terminate / Close / Kill Process Intent ("close chrome", "kill notepad", "stop process")
    const closeMatch = msg.match(/(?:can you\s+)?(?:close|kill|terminate|stop|end task)\s+(?:the\s+)?([a-z0-9_\-.\s]+?)(?:\s+process|\s+app|\s+please|\s+now)?$/i);
    if (closeMatch && closeMatch[1]) {
      const procName = closeMatch[1].trim();
      if (procName && procName !== "yourself" && procName !== "this" && procName !== "task") {
        return {
          type: "ask_confirmation",
          reason: `Terminate process '${procName}' on host OS`,
          actions: [{ toolId: "process.stop", args: { name: procName }, riskLevel: "high" }],
        };
      }
    }

    // 3. Stop Yourself / Cancel Intent ("stop yourself", "cancel", "stop", "abort")
    if (msg === "stop yourself" || msg === "stop" || msg === "cancel" || msg === "abort") {
      return {
        type: "respond",
        message: "🛑 Stopped. Standing by for your next command.",
      };
    }

    // 4. Open Application Intent ("open control panel", "open whatsapp and text...", "open notepad", "open chrome")
    const openMatch = msg.match(/(?:can you\s+)?(?:open|launch|run|start)\s+(?:the\s+)?([a-z0-9_\-.\s]+?)(?:\s+and\s+.*|\s+app|\s+for me|\s+please|\s+now)?$/i);
    if (openMatch && openMatch[1]) {
      const appName = openMatch[1].trim();
      const lowerApp = appName.toLowerCase();
      if (
        appName &&
        !lowerApp.includes("folder") &&
        !lowerApp.includes("file") &&
        lowerApp !== "downloads" &&
        lowerApp !== "desktop" &&
        lowerApp !== "documents"
      ) {
        return {
          type: "plan",
          plan: {
            goal: `Launch application '${appName}'`,
            steps: [{ toolId: "application.open", args: { name: appName }, riskLevel: "low" }],
          },
        };
      }
    }

    // 5. Delete / Remove File or Folder Intent ("delete docs folder from desktop", "delkete don folder", "remove test")
    const deleteMatch = msg.match(/(?:can you\s+)?(?:delete|delkete|remove|erase|destroy)\s+(?:the\s+)?([a-z0-9_\-.\s]+?)(?:\s+folder|\s+file)?(?:\s+from\s+(?:my\s+)?(desktop|downloads|documents))?$/i);
    if (deleteMatch && deleteMatch[1]) {
      const itemName = deleteMatch[1].trim();
      const location = deleteMatch[2] ? deleteMatch[2].trim() : "Desktop";
      if (itemName && itemName !== "all" && itemName !== "everything") {
        const targetPath = `${location}/${itemName}`;
        return {
          type: "ask_confirmation",
          reason: `Permanently delete '${targetPath}'`,
          actions: [{ toolId: "filesystem.delete", args: { path: targetPath }, riskLevel: "high" }],
        };
      }
    }

    // 6. List Downloads Folder Intent ("see my downloads folder", "list files in downloads", etc.)
    if (msg.includes("download") && (msg.includes("list") || msg.includes("see") || msg.includes("show") || msg.includes("file") || msg.includes("folder") || msg.includes("content"))) {
      return {
        type: "plan",
        plan: {
          goal: "List contents of Downloads folder",
          steps: [{ toolId: "filesystem.list", args: { path: "Downloads" }, riskLevel: "safe" }],
        },
      };
    }

    // 7. List Desktop Folder Intent ("see my desktop folder", "list files on desktop", "content present in my desktop")
    if (msg.includes("desktop") && (msg.includes("list") || msg.includes("see") || msg.includes("show") || msg.includes("file") || msg.includes("folder") || msg.includes("content") || msg.includes("give me"))) {
      return {
        type: "plan",
        plan: {
          goal: "List contents of Desktop folder",
          steps: [{ toolId: "filesystem.list", args: { path: "Desktop" }, riskLevel: "safe" }],
        },
      };
    }

    // 8. List Documents Folder Intent ("see my documents folder", "list files in documents")
    if (msg.includes("document") && (msg.includes("list") || msg.includes("see") || msg.includes("show") || msg.includes("file") || msg.includes("folder") || msg.includes("content"))) {
      return {
        type: "plan",
        plan: {
          goal: "List contents of Documents folder",
          steps: [{ toolId: "filesystem.list", args: { path: "Documents" }, riskLevel: "safe" }],
        },
      };
    }

    // 9. Screenshot / Capture Screen Intent ("take ss", "screenshot", "take a screenshot", "capture screen")
    if (
      msg.includes("screenshot") ||
      msg.includes("capture screen") ||
      msg.includes("take screen") ||
      /\b(ss|snapshot|screen shot|take ss|desktop ss)\b/i.test(msg)
    ) {
      return {
        type: "plan",
        plan: {
          goal: "Capture desktop screenshot",
          steps: [{ toolId: "screen.capture", args: {}, riskLevel: "safe" }],
        },
      };
    }

    // 10. List Processes Intent ("ongoing processes", "list processes", "running apps", "task manager")
    if (msg.includes("process") || msg.includes("running app") || msg.includes("task manager") || msg.includes("ongoing")) {
      return {
        type: "plan",
        plan: {
          goal: "List running processes",
          steps: [{ toolId: "process.list", args: {}, riskLevel: "safe" }],
        },
      };
    }

    // 11. Clipboard Read Intent ("see my clipboard", "read clipboard", "clipboard content")
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
