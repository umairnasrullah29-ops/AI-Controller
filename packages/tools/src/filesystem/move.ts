import { z } from "zod";
import * as fs from "fs/promises";
import { ToolDefinition, ToolResult } from "@ai-pc/contracts";
import { resolveUserPath } from "./list";

export const MoveFileInputSchema = z.object({
  source: z.string().describe("Source file or folder path to move"),
  destination: z.string().describe("Destination path"),
});

export type MoveFileInput = z.infer<typeof MoveFileInputSchema>;

export const moveFileTool: ToolDefinition<MoveFileInput> = {
  id: "filesystem.move",
  name: "Move / Relocate File",
  description: "Moves a file or directory to a new location on the host OS",
  inputSchema: MoveFileInputSchema,
  riskLevel: "medium",
  requiresConfirmation: false,
  reversible: true,
  supportedPlatforms: ["windows", "linux", "macos"],
  timeoutMs: 10000,
  async execute(input: MoveFileInput): Promise<ToolResult> {
    try {
      const srcPath = resolveUserPath(input.source);
      const destPath = resolveUserPath(input.destination);

      await fs.rename(srcPath, destPath);

      const isVerified = await moveFileTool.verify!(input, {
        success: true,
        verified: false,
      });

      return {
        success: true,
        data: { source: srcPath, destination: destPath, moved: true },
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
  async verify(input: MoveFileInput): Promise<boolean> {
    try {
      const srcPath = resolveUserPath(input.source);
      const destPath = resolveUserPath(input.destination);

      // Verify destination exists
      await fs.stat(destPath);

      // Verify source is gone
      try {
        await fs.stat(srcPath);
        return false; // Source still exists!
      } catch {
        return true; // Source is gone, destination exists
      }
    } catch {
      return false;
    }
  },
};
