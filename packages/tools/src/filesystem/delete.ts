import { z } from "zod";
import * as fs from "fs/promises";
import { ToolDefinition, ToolResult } from "@ai-pc/contracts";
import { resolveUserPath } from "./list";

export const DeleteFileInputSchema = z.object({
  path: z.string().describe("Path of the file or directory to delete"),
});

export type DeleteFileInput = z.infer<typeof DeleteFileInputSchema>;

export const deleteFileTool: ToolDefinition<DeleteFileInput> = {
  id: "filesystem.delete",
  name: "Delete File / Directory",
  description: "Permanently removes a file or directory from the host OS (High Risk - Requires Confirmation)",
  inputSchema: DeleteFileInputSchema,
  riskLevel: "high",
  requiresConfirmation: true,
  reversible: false,
  supportedPlatforms: ["windows", "linux", "macos"],
  timeoutMs: 10000,
  async execute(input: DeleteFileInput): Promise<ToolResult> {
    try {
      const targetPath = resolveUserPath(input.path);
      await fs.rm(targetPath, { recursive: true, force: true });

      const isVerified = await deleteFileTool.verify!(input, {
        success: true,
        verified: false,
      });

      return {
        success: true,
        data: { path: targetPath, deleted: true },
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
  async verify(input: DeleteFileInput): Promise<boolean> {
    try {
      const targetPath = resolveUserPath(input.path);
      await fs.stat(targetPath);
      return false; // Still exists -> deletion failed!
    } catch {
      return true; // Not found -> deletion confirmed!
    }
  },
};
