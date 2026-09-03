import { z } from "zod";
import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";
import { ToolDefinition, ToolResult } from "@ai-pc/contracts";
import { nativeCaptureScreen } from "@ai-pc/native";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const ScreenCaptureInputSchema = z.object({
  filename: z.string().optional().describe("Optional filename for the screenshot (default: screenshot-<timestamp>.png)"),
});

export type ScreenCaptureInput = z.infer<typeof ScreenCaptureInputSchema>;

export const screenCaptureTool: ToolDefinition<ScreenCaptureInput> = {
  id: "screen.capture",
  name: "Capture Screen",
  description: "Takes a desktop screenshot of the host OS and saves it locally. Uses native Windows GDI for ultra-low latency when the native addon is compiled, falls back to PowerShell otherwise.",
  inputSchema: ScreenCaptureInputSchema,
  riskLevel: "safe",
  requiresConfirmation: false,
  reversible: false,
  supportedPlatforms: ["windows", "linux", "macos"],
  timeoutMs: 10000,

  async execute(input: ScreenCaptureInput): Promise<ToolResult> {
    try {
      const fileName = input.filename || `screenshot-${Date.now()}.png`;
      const tempDir = path.join(os.tmpdir(), "ai-pc-screenshots");
      await fs.mkdir(tempDir, { recursive: true });
      const outputPath = path.join(tempDir, fileName);

      // ─── Try Native N-API Addon First (< 10ms on Windows) ───────────────
      if (process.platform === "win32") {
        try {
          const nativeResult = nativeCaptureScreen(outputPath);
          if (nativeResult && (await fs.stat(outputPath).then(s => s.size > 0).catch(() => false))) {
            const base64Data = await fs.readFile(outputPath, { encoding: "base64" });
            return {
              success: true,
              data: {
                path: outputPath,
                widthPx: nativeResult.widthPx,
                heightPx: nativeResult.heightPx,
                sizeBytes: nativeResult.sizeBytes,
                durationMs: nativeResult.durationMs,
                capturedAt: new Date().toISOString(),
                backend: "native-gdi",
                imageUri: `data:image/png;base64,${base64Data}`,
              },
              verified: true,
            };
          }
        } catch {
          // Native addon not available — fall through to PowerShell
        }

        // ─── Fallback: PowerShell GDI ─────────────────────────────────────
        const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bitmap = New-Object System.Drawing.Bitmap $screen.Width, $screen.Height
$graphic = [System.Drawing.Graphics]::FromImage($bitmap)
$graphic.CopyFromScreen($screen.X, $screen.Y, 0, 0, $bitmap.Size)
$bitmap.Save('${outputPath.replace(/\\/g, "\\\\")}', [System.Drawing.Imaging.ImageFormat]::Png)
$graphic.Dispose(); $bitmap.Dispose()
        `.trim().replace(/\n/g, "; ");
        const t0 = Date.now();
        await execAsync(`powershell -NoProfile -Command "${psScript}"`, { windowsHide: true });
        const stats = await fs.stat(outputPath);
        const psBase64 = await fs.readFile(outputPath, { encoding: "base64" });
        return {
          success: true,
          data: {
            path: outputPath,
            sizeBytes: stats.size,
            durationMs: Date.now() - t0,
            capturedAt: new Date().toISOString(),
            backend: "powershell-fallback",
            imageUri: `data:image/png;base64,${psBase64}`,
          },
          verified: stats.size > 0,
        };
      }

      // ─── macOS ────────────────────────────────────────────────────────────
      if (process.platform === "darwin") {
        const t0 = Date.now();
        await execAsync(`screencapture -x "${outputPath}"`);
        const stats = await fs.stat(outputPath);
        const macBase64 = await fs.readFile(outputPath, { encoding: "base64" });
        return {
          success: true,
          data: {
            path: outputPath,
            sizeBytes: stats.size,
            durationMs: Date.now() - t0,
            capturedAt: new Date().toISOString(),
            backend: "screencapture",
            imageUri: `data:image/png;base64,${macBase64}`,
          },
          verified: stats.size > 0,
        };
      }

      // ─── Linux ────────────────────────────────────────────────────────────
      const t0 = Date.now();
      const linuxCmds = [
        `gnome-screenshot -f "${outputPath}"`,
        `scrot "${outputPath}"`,
        `grim "${outputPath}"`,
        `import -window root "${outputPath}"`,
      ];

      let captured = false;
      let lastErr: any = null;
      for (const cmd of linuxCmds) {
        try {
          await execAsync(cmd);
          const stats = await fs.stat(outputPath);
          if (stats.size > 0) {
            captured = true;
            const linBase64 = await fs.readFile(outputPath, { encoding: "base64" });
            return {
              success: true,
              data: {
                path: outputPath,
                sizeBytes: stats.size,
                durationMs: Date.now() - t0,
                capturedAt: new Date().toISOString(),
                backend: cmd.split(" ")[0],
                imageUri: `data:image/png;base64,${linBase64}`,
              },
              verified: true,
            };
          }
        } catch (e) {
          lastErr = e;
        }
      }

      if (!captured) throw lastErr || new Error("No Linux screenshot tool found (tried gnome-screenshot, scrot, grim, import)");

      return { success: false, error: "Unsupported operating system", verified: false };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err), verified: false };
    }
  },

  async verify(_input: ScreenCaptureInput, result: ToolResult): Promise<boolean> {
    try {
      const data = result.data as any;
      if (data?.path) { await fs.stat(data.path); return true; }
      return false;
    } catch { return false; }
  },
};
