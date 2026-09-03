import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import { ToolDefinition, ToolResult } from "@ai-pc/contracts";
import { nativeListProcesses } from "@ai-pc/native";

const execAsync = promisify(exec);

export const ListProcessesInputSchema = z.object({
  filter: z.string().optional().describe("Optional filter keyword for process name"),
});

export type ListProcessesInput = z.infer<typeof ListProcessesInputSchema>;

export const listProcessesTool: ToolDefinition<ListProcessesInput> = {
  id: "process.list",
  name: "List Running Processes",
  description: "Lists active running processes with PID, Name, memory and thread count. Uses native PSAPI for ultra-low latency when the native addon is compiled.",
  inputSchema: ListProcessesInputSchema,
  riskLevel: "safe",
  requiresConfirmation: false,
  reversible: false,
  supportedPlatforms: ["windows", "linux", "macos"],
  timeoutMs: 8000,

  async execute(input: ListProcessesInput): Promise<ToolResult> {
    try {
      // ─── Try Native PSAPI/TlHelp32 First (< 10ms) ───────────────────────
      if (process.platform === "win32") {
        const nativeProcs = nativeListProcesses(input.filter);
        if (nativeProcs) {
          return {
            success: true,
            data: {
              total: nativeProcs.length,
              processes: nativeProcs.slice(0, 100),
              backend: "native-psapi",
            },
            verified: true,
          };
        }

        // ─── Fallback: tasklist CLI ──────────────────────────────────────
        const { stdout } = await execAsync("tasklist /FO CSV /NH", { windowsHide: true });
        const lines = stdout.trim().split("\n");
        let processes = lines.map((line) => {
          const parts = line.replace(/\r/g, "").split('","').map((p) => p.replace(/^"|"$/g, ""));
          return { name: parts[0] || "", pid: parseInt(parts[1], 10) || 0, memUsage: parts[4] || "" };
        });
        if (input.filter) {
          const lower = input.filter.toLowerCase();
          processes = processes.filter((p) => p.name.toLowerCase().includes(lower));
        }
        return {
          success: true,
          data: { total: processes.length, processes: processes.slice(0, 100), backend: "tasklist-fallback" },
          verified: true,
        };
      }

      // ─── Linux / macOS ───────────────────────────────────────────────────
      const { stdout } = await execAsync(
        process.platform === "darwin"
          ? "ps -eo pid,comm,%mem"
          : "ps -eo pid,comm,%mem --sort=-%mem 2>/dev/null || ps -eo pid,comm,%mem"
      );
      const lines = stdout.trim().split("\n").slice(1); // skip header
      let processes = lines
        .map((line) => {
          const parts = line.trim().split(/\s+/);
          const pid = parseInt(parts[0], 10) || 0;
          const memUsage = (parts[parts.length - 1] || "0") + " %";
          const name = parts.slice(1, parts.length - 1).join(" ") || "process";
          return { name, pid, memUsage };
        })
        .filter((p) => p.name && p.pid > 0);

      if (input.filter) {
        const lower = input.filter.toLowerCase();
        processes = processes.filter((p) => p.name.toLowerCase().includes(lower));
      }

      return {
        success: true,
        data: {
          total: processes.length,
          processes: processes.slice(0, 100),
          backend: process.platform === "darwin" ? "ps-darwin" : "ps-linux",
        },
        verified: true,
      };

    } catch (err: any) {
      return { success: false, error: err?.message || String(err), verified: false };
    }
  },
};
