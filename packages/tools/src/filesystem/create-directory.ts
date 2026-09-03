import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import { ToolDefinition, ToolResult } from "@ai-pc/contracts";
import { resolveUserPath } from "./list";

export const CreateDirectoryInputSchema = z.object({
  path: z.string().describe("Path where the new directory should be created (e.g. 'Desktop/Test' or 'C:/Users/.../Test')"),
  name: z.string().optional().describe("Optional directory name if not included in path"),
});

export type CreateDirectoryInput = z.infer<typeof CreateDirectoryInputSchema>;

export const createDirectoryTool: ToolDefinition<CreateDirectoryInput> = {
  id: "filesystem.create_directory",
  name: "Create Directory",
  description: "Creates a new directory at the specified path on the host OS",
  inputSchema: CreateDirectoryInputSchema,
  riskLevel: "low",
  requiresConfirmation: false,
  reversible: true,
  supportedPlatforms: ["windows", "linux", "macos"],
  timeoutMs: 5000,
  async execute(input: CreateDirectoryInput): Promise<ToolResult> {
    try {
      let fullPath = resolveUserPath(input.path);
      if (input.name) {
        fullPath = path.join(fullPath, input.name);
      }

      await fs.mkdir(fullPath, { recursive: true });

      const isVerified = await createDirectoryTool.verify!(input, {
        success: true,
        verified: false,
      });

      return {
        success: true,
        data: {
          path: fullPath,
          created: true,
        },
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
  async verify(input: CreateDirectoryInput): Promise<boolean> {
    try {
      let fullPath = resolveUserPath(input.path);
      if (input.name) {
        fullPath = path.join(fullPath, input.name);
      }

      const stat = await fs.stat(fullPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  },
};
