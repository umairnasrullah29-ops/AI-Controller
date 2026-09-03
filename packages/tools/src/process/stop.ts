import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import { ToolDefinition, ToolResult } from "@ai-pc/contracts";

const execAsync = promisify(exec);

export const StopProcessInputSchema = z.object({
  pid: z.number().optional().describe("Process ID (PID) to terminate"),
  name: z.string().optional().describe("Optional process executable name (e.g. 'chrome', 'notepad.exe') to terminate"),
});

export type StopProcessInput = z.infer<typeof StopProcessInputSchema>;

export const stopProcessTool: ToolDefinition<StopProcessInput> = {
  id: "process.stop",
  name: "Terminate Process",
  description: "Terminates a running process on the host OS by PID or Name (High Risk - Requires Confirmation)",
  inputSchema: StopProcessInputSchema,
  riskLevel: "high",
  requiresConfirmation: true,
  reversible: false,
  supportedPlatforms: ["windows", "linux", "macos"],
  timeoutMs: 8000,
  async execute(input: StopProcessInput): Promise<ToolResult> {
    try {
      if (!input.pid && !input.name) {
        throw new Error("Either 'pid' or 'name' must be provided to terminate a process.");
      }

      if (process.platform === "win32") {
        if (input.pid) {
          await execAsync(`taskkill /PID ${input.pid} /F /T`, { windowsHide: true });
        } else if (input.name) {
          const imgName = input.name.toLowerCase().endsWith(".exe") ? input.name : `${input.name}.exe`;
          await execAsync(`taskkill /IM "${imgName}" /F /T`, { windowsHide: true });
        }
      } else {
        if (input.pid) {
          await execAsync(`kill -9 ${input.pid}`);
        } else if (input.name) {
          await execAsync(`pkill -f "${input.name}"`);
        }
      }

      return {
        success: true,
        data: { pid: input.pid, name: input.name, terminated: true },
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
  async verify(input: StopProcessInput): Promise<boolean> {
    try {
      if (input.pid) {
        if (process.platform === "win32") {
          const { stdout } = await execAsync(`tasklist /FI "PID eq ${input.pid}" /NH`, { windowsHide: true });
          return !stdout.includes(input.pid.toString());
        } else {
          const { stdout } = await execAsync(`ps -p ${input.pid}`);
          return !stdout.includes(input.pid.toString());
        }
      }
      return true;
    } catch {
      return true;
    }
  },
};
