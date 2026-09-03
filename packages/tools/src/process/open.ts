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
      const nameClean = input.name.trim();
      const sanitizedName = nameClean.replace(/[^a-zA-Z0-9._\-]/g, "");

      if (process.platform === "win32") {
        // App alias mappings for common Windows apps & UWP protocols
        const aliasMap: Record<string, string[]> = {
          whatsapp: ["whatsapp:", "whatsapp.exe", "WhatsApp"],
          spotify: ["spotify:", "spotify.exe"],
          calculator: ["calc.exe", "calculator:"],
          calc: ["calc.exe"],
          notepad: ["notepad.exe"],
          chrome: ["chrome.exe", "googlechrome"],
          edge: ["msedge.exe", "msedge:"],
          launchpad: ["shell:AppsFolder", "explorer.exe"],
          settings: ["ms-settings:"],
          paint: ["mspaint.exe"],
          "control panel": ["control.exe"],
          control: ["control.exe"],
          "task manager": ["taskmgr.exe"],
          taskmgr: ["taskmgr.exe"],
          cmd: ["cmd.exe"],
          terminal: ["wt.exe", "cmd.exe", "powershell.exe"],
          "command prompt": ["cmd.exe"],
          explorer: ["explorer.exe"],
          "file explorer": ["explorer.exe"],
          "device manager": ["devmgmt.msc"],
          services: ["services.msc"],
        };

        const lower = nameClean.toLowerCase();
        const candidates = aliasMap[lower] || [sanitizedName, `${sanitizedName}.exe`, `${sanitizedName}:`];

        let lastErr: Error | null = null;
        for (const candidate of candidates) {
          try {
            const cmd = input.args
              ? `start "" "${candidate}" ${input.args}`
              : `start "" "${candidate}"`;
            await execAsync(cmd, { windowsHide: false });
            return {
              success: true,
              data: { application: sanitizedName, target: candidate, launched: true },
              verified: true,
            };
          } catch (err: any) {
            lastErr = err;
          }
        }

        // Final Fallback: Try PowerShell Start-Process
        try {
          await execAsync(
            `powershell -NoProfile -Command "Start-Process '${sanitizedName}' -ErrorAction Stop"`,
            { windowsHide: false }
          );
          return {
            success: true,
            data: { application: sanitizedName, method: "powershell", launched: true },
            verified: true,
          };
        } catch {
          // If all attempts fail, surface lastErr
          throw lastErr || new Error(`Could not locate or launch application '${sanitizedName}'`);
        }
      }

      // macOS
      if (process.platform === "darwin") {
        await execAsync(`open -a "${sanitizedName}"`);
        return { success: true, data: { application: sanitizedName, launched: true }, verified: true };
      }

      // Linux
      await execAsync(`gtk-launch "${sanitizedName}" || "${sanitizedName}"`);
      return { success: true, data: { application: sanitizedName, launched: true }, verified: true };

    } catch (err: any) {
      return {
        success: false,
        error: err?.message || String(err),
        verified: false,
      };
    }
  },
};
