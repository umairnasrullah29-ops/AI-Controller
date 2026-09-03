import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import { ToolDefinition, ToolResult } from "@ai-pc/contracts";
import { UndoEngine } from "../undo/undo-engine";

export const WriteFileInputSchema = z.object({
  path: z.string().describe("Absolute or relative path to the file to write"),
  content: z.string().describe("Complete new file content to write"),
  createIfMissing: z.boolean().default(true)
    .describe("If true, creates the file and any parent directories if they do not exist"),
  encoding: z.enum(["utf8", "base64"]).default("utf8"),
});

export type WriteFileInput = z.infer<typeof WriteFileInputSchema>;

export const writeFileTool: ToolDefinition<WriteFileInput> = {
  id: "filesystem.write",
  name: "Write File Contents",
  description: "Writes or overwrites a file with the given content on behalf of the user. Always read the file first with filesystem.read to understand current state. Creates a rollback snapshot before writing.",
  inputSchema: WriteFileInputSchema,
  riskLevel: "medium",
  requiresConfirmation: false,
  reversible: true,
  supportedPlatforms: ["windows", "linux", "macos"],
  timeoutMs: 15000,

  async execute(input: WriteFileInput): Promise<ToolResult> {
    try {
      const absPath = path.resolve(input.path);

      let snapshotId: string | undefined;
      try {
        const stat = await fs.stat(absPath);
        if (stat.isFile()) {
          const snap = await UndoEngine.createSnapshot(absPath, "delete");
          snapshotId = snap?.id;
        }
      } catch {
        // File does not exist yet
      }

      if (input.createIfMissing ?? true) {
        await fs.mkdir(path.dirname(absPath), { recursive: true });
      }

      const encoding = (input.encoding ?? "utf8") as BufferEncoding;
      await fs.writeFile(absPath, input.content, { encoding });

      const stat = await fs.stat(absPath);

      return {
        success: true,
        data: {
          path: absPath,
          bytesWritten: stat.size,
          snapshotId,
          canUndo: !!snapshotId,
          writtenAt: new Date().toISOString(),
        },
        verified: stat.size > 0 || input.content.length === 0,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || String(err),
        verified: false,
      };
    }
  },

  async verify(input: WriteFileInput, _result: ToolResult): Promise<boolean> {
    try {
      const absPath = path.resolve(input.path);
      const fileContent = await fs.readFile(absPath, { encoding: "utf8" });
      if (input.encoding !== "base64") {
        return fileContent === input.content;
      }
      return true;
    } catch { return false; }
  },
};
