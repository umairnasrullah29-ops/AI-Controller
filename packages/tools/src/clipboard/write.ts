import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import { ToolDefinition, ToolResult } from "@ai-pc/contracts";

const execAsync = promisify(exec);

export const ClipboardWriteInputSchema = z.object({
  text: z.string().describe("Text content to write to system clipboard"),
});

export type ClipboardWriteInput = z.infer<typeof ClipboardWriteInputSchema>;

export const clipboardWriteTool: ToolDefinition<ClipboardWriteInput> = {
  id: "clipboard.write",
  name: "Write Clipboard Text",
  description: "Writes specified text to the host OS system clipboard",
  inputSchema: ClipboardWriteInputSchema,
  riskLevel: "low",
  requiresConfirmation: false,
  reversible: true,
  supportedPlatforms: ["windows", "linux", "macos"],
  timeoutMs: 5000,
  async execute(input: ClipboardWriteInput): Promise<ToolResult> {
    try {
      if (process.platform === "win32") {
        const escaped = input.text.replace(/"/g, '`"').replace(/\$/g, '`$');
        await execAsync(`powershell -NoProfile -Command "Set-Clipboard -Value \\"${escaped}\\""`, { windowsHide: true });
      } else if (process.platform === "darwin") {
        await execAsync(`echo "${input.text.replace(/"/g, '\\"')}" | pbcopy`);
      } else {
        await execAsync(`echo "${input.text.replace(/"/g, '\\"')}" | xclip -selection clipboard`);
      }

      const isVerified = await clipboardWriteTool.verify!(input, { success: true, verified: false });

      return {
        success: true,
        data: { text: input.text, copied: true },
        verified: isVerified,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || String(err),
        verified: false,
      };
    }
  },
  async verify(input: ClipboardWriteInput, _result: ToolResult): Promise<boolean> {
    try {
      let current = "";
      if (process.platform === "win32") {
        const { stdout } = await execAsync("powershell -NoProfile -Command \"Get-Clipboard\"", { windowsHide: true });
        current = stdout.trim();
      } else if (process.platform === "darwin") {
        const { stdout } = await execAsync("pbpaste");
        current = stdout.trim();
      }
      return current === input.text.trim();
    } catch {
      return false;
    }
  },
};
