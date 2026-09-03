import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import { ToolDefinition, ToolResult } from "@ai-pc/contracts";
import { resolveUserPath } from "./list";

export const RenameFileInputSchema = z.object({
  path: z.string().describe("Path of the file or directory to rename"),
  newName: z.string().describe("New name for the file or folder"),
});

export type RenameFileInput = z.infer<typeof RenameFileInputSchema>;

export const renameFileTool: ToolDefinition<RenameFileInput> = {
  id: "filesystem.rename",
  name: "Rename File / Directory",
  description: "Renames an existing file or directory on the host OS",
  inputSchema: RenameFileInputSchema,
  riskLevel: "low",
  requiresConfirmation: false,
  reversible: true,
  supportedPlatforms: ["windows", "linux", "macos"],
  timeoutMs: 5000,
  async execute(input: RenameFileInput): Promise<ToolResult> {
    try {
      const srcPath = resolveUserPath(input.path);
      const parentDir = path.dirname(srcPath);
      const newPath = path.join(parentDir, input.newName);

      await fs.rename(srcPath, newPath);

      const isVerified = await renameFileTool.verify!(input, {
        success: true,
        verified: false,
      });

      return {
        success: true,
        data: { oldPath: srcPath, newPath, renamed: true },
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
  async verify(input: RenameFileInput): Promise<boolean> {
    try {
      const srcPath = resolveUserPath(input.path);
      const parentDir = path.dirname(srcPath);
      const newPath = path.join(parentDir, input.newName);

      await fs.stat(newPath);
      return true;
    } catch {
      return false;
    }
  },
};
