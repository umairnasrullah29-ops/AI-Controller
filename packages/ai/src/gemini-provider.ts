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
      console.warn("Gemini parse failed, retrying:", firstErr?.message || firstErr);
      try {
        const retryResponse = await model.generateContent(
          prompt + "\n\nIMPORTANT: Return ONLY valid JSON. No markdown fences."
        );
        return this.parseAndValidate(retryResponse.response.text().trim());
      } catch (secondErr: any) {
        console.error("Both Gemini attempts failed:", secondErr?.message || secondErr);
        return {
          type: "ask_clarification",
          question: "I had trouble processing that request. Could you rephrase what you'd like me to do?",
        };
      }
    }
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
