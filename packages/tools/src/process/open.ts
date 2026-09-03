import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import { ToolDefinition, ToolResult } from "@ai-pc/contracts";

const execAsync = promisify(exec);

export const OpenApplicationInputSchema = z.object({
  name: z.string().describe("Name of the application or executable (e.g. 'notepad', 'calc', 'explorer', 'chrome')"),
  args: z.string().optional().describe("Optional command-line arguments to pass to the application"),
});

export type OpenApplicationInput = z.infer<typeof OpenApplicationInputSchema>;

export const openApplicationTool: ToolDefinition<OpenApplicationInput> = {
  id: "application.open",
  name: "Launch Application",
  description: "Launches an application or desktop tool on the host OS",
  inputSchema: OpenApplicationInputSchema,
  riskLevel: "low",
  requiresConfirmation: false,
  reversible: false,
  supportedPlatforms: ["windows", "linux", "macos"],
  timeoutMs: 5000,
  async execute(input: OpenApplicationInput): Promise<ToolResult> {
    try {
      const sanitizedName = input.name.replace(/[^a-zA-Z0-9._\-]/g, "");
      const fullCommand = input.args ? `start "" "${sanitizedName}" ${input.args}` : `start "" "${sanitizedName}"`;

      await execAsync(fullCommand, { windowsHide: false });

      return {
        success: true,
        data: { application: sanitizedName, launched: true },
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
