import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import { ToolDefinition, ToolResult } from "@ai-pc/contracts";

const execAsync = promisify(exec);

// Approved command binaries for restricted execution
const ALLOWED_COMMANDS = new Set([
  "git",
  "npm",
  "node",
  "dir",
  "echo",
  "ipconfig",
  "ping",
  "systeminfo",
  "whoami",
  "pwd",
  "ls",
  "type",
  "cat",
  "hostname",
  "ver",
]);

export const TerminalExecuteInputSchema = z.object({
  command: z.string().describe("Terminal command to run (must be an allowlisted utility like git, npm, node, dir, echo, ipconfig, etc.)"),
  cwd: z.string().optional().describe("Optional working directory path"),
});

export type TerminalExecuteInput = z.infer<typeof TerminalExecuteInputSchema>;

export const terminalExecuteTool: ToolDefinition<TerminalExecuteInput> = {
  id: "terminal.execute",
  name: "Restricted Terminal Execution",
  description: "Executes an allowlisted terminal command (git, npm, node, dir, ipconfig, etc.) safely on the host OS",
  inputSchema: TerminalExecuteInputSchema,
  riskLevel: "medium",
  requiresConfirmation: false,
  reversible: false,
  supportedPlatforms: ["windows", "linux", "macos"],
  timeoutMs: 10000,
  async execute(input: TerminalExecuteInput): Promise<ToolResult> {
    try {
      const trimmed = input.command.trim();
      const firstWord = trimmed.split(/\s+/)[0].toLowerCase();

      // Check allowlist
      if (!ALLOWED_COMMANDS.has(firstWord)) {
        return {
          success: false,
          error: `Command '${firstWord}' is not on the security allowlist. Allowed commands: ${Array.from(ALLOWED_COMMANDS).join(", ")}`,
          verified: false,
        };
      }

      // Reject dangerous shell piping / chaining patterns — no exceptions
      if (/[;&|<>`$]/.test(trimmed)) {
        return {
          success: false,
          error: "Command chaining or redirection operators (;&|<>`) are restricted for security.",
          verified: false,
        };
      }

      const { stdout, stderr } = await execAsync(trimmed, {
        cwd: input.cwd || process.cwd(),
        timeout: 10000,
        maxBuffer: 50 * 1024, // 50KB max output
        windowsHide: true,
      });

      const output = (stdout || stderr || "").trim();

      return {
        success: true,
        data: {
          command: trimmed,
          output: output.slice(0, 4000), // Cap returned string length for UI
          truncated: output.length > 4000,
        },
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
