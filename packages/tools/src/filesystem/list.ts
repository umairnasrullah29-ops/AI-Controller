import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { ToolDefinition, ToolResult } from "@ai-pc/contracts";

export const ListFilesInputSchema = z.object({
  path: z.string().describe("Directory path to list files from (e.g., 'Downloads', 'Desktop', or absolute path)"),
});

export type ListFilesInput = z.infer<typeof ListFilesInputSchema>;

import * as fsSync from "fs";

export function resolveUserPath(inputPath: string): string {
  let target = inputPath.trim();
  const home = os.homedir();

  const checkFolder = (folderName: string): string => {
    const std = path.join(home, folderName);
    if (fsSync.existsSync(std)) return std;
    const oneDrive = path.join(home, "OneDrive", folderName);
    if (fsSync.existsSync(oneDrive)) return oneDrive;
    return std;
  };

  if (target.startsWith("~")) {
    target = path.join(home, target.slice(1));
  } else if (target.toLowerCase() === "downloads") {
    target = checkFolder("Downloads");
  } else if (target.toLowerCase() === "desktop") {
    target = checkFolder("Desktop");
  } else if (target.toLowerCase() === "documents") {
    target = checkFolder("Documents");
  }

  return path.resolve(target);
}

export const listFilesTool: ToolDefinition<ListFilesInput> = {
  id: "filesystem.list",
  name: "List Files",
  description: "Lists directory contents including file names, sizes, and types",
  inputSchema: ListFilesInputSchema,
  riskLevel: "safe",
  requiresConfirmation: false,
  reversible: false,
  supportedPlatforms: ["windows", "linux", "macos"],
  timeoutMs: 5000,
  async execute(input: ListFilesInput): Promise<ToolResult> {
    try {
      const resolvedPath = resolveUserPath(input.path);
      const entries = await fs.readdir(resolvedPath, { withFileTypes: true });

      const files = await Promise.all(
        entries.map(async (entry) => {
          const entryPath = path.join(resolvedPath, entry.name);
          let size = 0;
          let modifiedAt: string | undefined;

          try {
            const stat = await fs.stat(entryPath);
            size = stat.size;
            modifiedAt = stat.mtime.toISOString();
          } catch {
            // Ignore stat errors for system/locked files
          }

          return {
            name: entry.name,
            isDirectory: entry.isDirectory(),
            isFile: entry.isFile(),
            size,
            modifiedAt,
          };
        })
      );

      return {
        success: true,
        data: {
          path: resolvedPath,
          total: files.length,
          files,
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
  async verify(input: ListFilesInput, result: ToolResult): Promise<boolean> {
    if (!result.success) return false;
    try {
      const resolvedPath = resolveUserPath(input.path);
      const stat = await fs.stat(resolvedPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  },
};
