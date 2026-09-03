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
import { execSync } from "child_process";

let cachedShellFolders: { desktop: string; downloads: string; documents: string } | null = null;

export function getShellFolders(): { desktop: string; downloads: string; documents: string } {
  if (cachedShellFolders) return cachedShellFolders;

  const home = os.homedir();
  const folders = {
    desktop: path.join(home, "Desktop"),
    downloads: path.join(home, "Downloads"),
    documents: path.join(home, "Documents"),
  };

  if (process.platform === "win32") {
    try {
      const out = execSync(
        'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders"',
        { encoding: "utf8", timeout: 2000, windowsHide: true }
      );
      for (const line of out.split("\n")) {
        const desktopMatch = line.match(/\s+Desktop\s+REG_[A-Z_]+\s+(.+)/i);
        if (desktopMatch) {
          const raw = desktopMatch[1].trim().replace(/%USERPROFILE%/i, home);
          if (fsSync.existsSync(raw)) folders.desktop = raw;
        }
        const personalMatch = line.match(/\s+Personal\s+REG_[A-Z_]+\s+(.+)/i);
        if (personalMatch) {
          const raw = personalMatch[1].trim().replace(/%USERPROFILE%/i, home);
          if (fsSync.existsSync(raw)) folders.documents = raw;
        }
        const dlMatch = line.match(/\s+\{374DE290-123F-4565-9164-39C4925E467B\}\s+REG_[A-Z_]+\s+(.+)/i);
        if (dlMatch) {
          const raw = dlMatch[1].trim().replace(/%USERPROFILE%/i, home);
          if (fsSync.existsSync(raw)) folders.downloads = raw;
        }
      }
    } catch {
      // Fallback: Check OneDrive directories dynamically
      const oneDriveDocsDesktop = path.join(home, "OneDrive", "Documents", "Desktop");
      const oneDriveDesktop = path.join(home, "OneDrive", "Desktop");
      if (fsSync.existsSync(oneDriveDocsDesktop)) folders.desktop = oneDriveDocsDesktop;
      else if (fsSync.existsSync(oneDriveDesktop)) folders.desktop = oneDriveDesktop;
    }
  }

  cachedShellFolders = folders;
  return folders;
}

export function resolveUserPath(inputPath: string): string {
  let target = inputPath.trim();
  const home = os.homedir();
  const shell = getShellFolders();

  const norm = target.replace(/\\/g, "/");
  const lower = norm.toLowerCase();

  if (target.startsWith("~")) {
    target = path.join(home, target.slice(1));
  } else if (lower === "desktop" || lower === "my desktop" || lower === "the desktop") {
    target = shell.desktop;
  } else if (lower.startsWith("desktop/")) {
    target = path.join(shell.desktop, norm.slice(8));
  } else if (lower === "downloads" || lower === "my downloads" || lower === "the downloads") {
    target = shell.downloads;
  } else if (lower.startsWith("downloads/")) {
    target = path.join(shell.downloads, norm.slice(10));
  } else if (lower === "documents" || lower === "my documents" || lower === "the documents") {
    target = shell.documents;
  } else if (lower.startsWith("documents/")) {
    target = path.join(shell.documents, norm.slice(10));
  } else if (!path.isAbsolute(target)) {
    // Check if relative path exists on Desktop or in current dir
    const desktopCandidate = path.join(shell.desktop, target);
    if (fsSync.existsSync(desktopCandidate)) {
      target = desktopCandidate;
    }
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
