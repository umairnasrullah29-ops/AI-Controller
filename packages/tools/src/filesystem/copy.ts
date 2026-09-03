import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import { ToolDefinition, ToolResult } from "@ai-pc/contracts";
import { resolveUserPath } from "./list";

export const CopyFileInputSchema = z.object({
  source: z.string().describe("Source file or folder path"),
  destination: z.string().describe("Destination file or folder path"),
});

export type CopyFileInput = z.infer<typeof CopyFileInputSchema>;

export const copyFileTool: ToolDefinition<CopyFileInput> = {
  id: "filesystem.copy",
  name: "Copy File / Directory",
  description: "Copies a file or folder from source to destination path on the host OS",
  inputSchema: CopyFileInputSchema,
  riskLevel: "low",
  requiresConfirmation: false,
  reversible: true,
  supportedPlatforms: ["windows", "linux", "macos"],
  timeoutMs: 10000,
  async execute(input: CopyFileInput): Promise<ToolResult> {
    try {
      const srcPath = resolveUserPath(input.source);
      const destPath = resolveUserPath(input.destination);

      await fs.cp(srcPath, destPath, { recursive: true });

      const isVerified = await copyFileTool.verify!(input, {
        success: true,
        verified: false,
      });

      return {
        success: true,
        data: { source: srcPath, destination: destPath, copied: true },
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
  async verify(input: CopyFileInput): Promise<boolean> {
    try {
      const destPath = resolveUserPath(input.destination);
      await fs.stat(destPath);
      return true;
    } catch {
      return false;
    }
  },
};
