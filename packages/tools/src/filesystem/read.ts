import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import { ToolDefinition, ToolResult } from "@ai-pc/contracts";

export const ReadFileInputSchema = z.object({
  path: z.string().describe("Absolute or relative path to the file to read"),
  encoding: z.enum(["utf8", "base64"]).default("utf8")
    .describe("File encoding (utf8 for text files, base64 for binary)"),
  maxBytes: z.number().default(100_000)
    .describe("Maximum bytes to read (default 100KB, max 500KB)"),
});

export type ReadFileInput = z.infer<typeof ReadFileInputSchema>;

export const readFileTool: ToolDefinition<ReadFileInput> = {
  id: "filesystem.read",
  name: "Read File Contents",
  description: "Reads and returns the text content of a file so the AI can understand its current state before making edits. Caps at 100KB by default.",
  inputSchema: ReadFileInputSchema,
  riskLevel: "safe",
  requiresConfirmation: false,
  reversible: false,
  supportedPlatforms: ["windows", "linux", "macos"],
  timeoutMs: 10000,

  async execute(input: ReadFileInput): Promise<ToolResult> {
    try {
      const maxBytes = Math.min(input.maxBytes ?? 100_000, 500_000);
      const absPath = path.resolve(input.path);

      const stat = await fs.stat(absPath);
      if (stat.isDirectory()) {
        return {
          success: false,
          error: `'${absPath}' is a directory. Use filesystem.list to inspect directories.`,
          verified: false,
        };
      }

      let content: string;
      if (stat.size > maxBytes) {
        const fd = await fs.open(absPath, "r");
        const buf = Buffer.alloc(maxBytes);
        await fd.read(buf, 0, maxBytes, 0);
        await fd.close();
        content = (input.encoding === "base64")
          ? buf.toString("base64")
          : buf.toString("utf8");

        return {
          success: true,
          data: {
            path: absPath,
            content,
            totalBytes: stat.size,
            readBytes: maxBytes,
            truncated: true,
            encoding: input.encoding ?? "utf8",
          },
          verified: true,
        };
      }

      content = await fs.readFile(absPath, { encoding: (input.encoding as BufferEncoding) ?? "utf8" });

      return {
        success: true,
        data: {
          path: absPath,
          content,
          totalBytes: stat.size,
          readBytes: stat.size,
          truncated: false,
          encoding: input.encoding ?? "utf8",
          lastModified: stat.mtime.toISOString(),
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
};
