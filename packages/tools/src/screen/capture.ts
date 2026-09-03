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
        const nativeResult = nativeCaptureScreen(outputPath);
        if (nativeResult) {
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
            },
            verified: nativeResult.sizeBytes > 0,
          };
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
        return {
          success: true,
          data: {
            path: outputPath,
            sizeBytes: stats.size,
            durationMs: Date.now() - t0,
            capturedAt: new Date().toISOString(),
            backend: "powershell-fallback",
          },
          verified: stats.size > 0,
        };
      }

      // ─── macOS ────────────────────────────────────────────────────────────
      if (process.platform === "darwin") {
        const t0 = Date.now();
        await execAsync(`screencapture -x "${outputPath}"`);
        const stats = await fs.stat(outputPath);
        return {
          success: true,
          data: { path: outputPath, sizeBytes: stats.size, durationMs: Date.now() - t0, capturedAt: new Date().toISOString(), backend: "screencapture" },
          verified: stats.size > 0,
        };
      }

      // ─── Linux ────────────────────────────────────────────────────────────
      const t0 = Date.now();
      await execAsync(`import -window root "${outputPath}"`);
      const stats = await fs.stat(outputPath);
      return {
        success: true,
        data: { path: outputPath, sizeBytes: stats.size, durationMs: Date.now() - t0, capturedAt: new Date().toISOString(), backend: "imagemagick" },
        verified: stats.size > 0,
      };

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
