import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import { ToolDefinition, ToolResult } from "@ai-pc/contracts";

const execAsync = promisify(exec);

export const ClipboardReadInputSchema = z.object({});

export type ClipboardReadInput = z.infer<typeof ClipboardReadInputSchema>;

export const clipboardReadTool: ToolDefinition<ClipboardReadInput> = {
  id: "clipboard.read",
  name: "Read Clipboard Text",
  description: "Reads the current text content from the host OS clipboard",
  inputSchema: ClipboardReadInputSchema,
  riskLevel: "safe",
  requiresConfirmation: false,
  reversible: false,
  supportedPlatforms: ["windows", "linux", "macos"],
  timeoutMs: 5000,
  async execute(): Promise<ToolResult> {
    try {
      let text = "";
      if (process.platform === "win32") {
        const { stdout } = await execAsync("powershell -NoProfile -Command \"Get-Clipboard\"", { windowsHide: true });
        text = stdout.trim();
      } else if (process.platform === "darwin") {
        const { stdout } = await execAsync("pbpaste");
        text = stdout.trim();
      } else {
        const { stdout } = await execAsync("xclip -selection clipboard -o");
        text = stdout.trim();
      }

      return {
        success: true,
        data: { text },
        verified: true,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || String(err),
        verified: false,
      };
    }
  },
};
