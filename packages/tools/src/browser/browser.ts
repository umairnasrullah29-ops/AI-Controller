import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import { ToolDefinition, ToolResult } from "@ai-pc/contracts";

const execAsync = promisify(exec);

export const BrowserOpenInputSchema = z.object({
  url: z.string().url().describe("URL to open in the host OS default browser"),
});

export type BrowserOpenInput = z.infer<typeof BrowserOpenInputSchema>;

export const browserOpenTool: ToolDefinition<BrowserOpenInput> = {
  id: "browser.open",
  name: "Open Browser URL",
  description: "Opens a specified webpage URL in the host OS default web browser",
  inputSchema: BrowserOpenInputSchema,
  riskLevel: "safe",
  requiresConfirmation: false,
  reversible: false,
  supportedPlatforms: ["windows", "linux", "macos"],
  timeoutMs: 5000,
  async execute(input: BrowserOpenInput): Promise<ToolResult> {
    try {
      const url = input.url;
      if (process.platform === "win32") {
        await execAsync(`start "" "${url}"`, { windowsHide: false });
      } else if (process.platform === "darwin") {
        await execAsync(`open "${url}"`);
      } else {
        await execAsync(`xdg-open "${url}"`);
      }

      return {
        success: true,
        data: { url, opened: true },
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

export const BrowserReadInputSchema = z.object({
  url: z.string().url().describe("URL of the webpage to read and extract text from"),
});

export type BrowserReadInput = z.infer<typeof BrowserReadInputSchema>;

export const browserReadTool: ToolDefinition<BrowserReadInput> = {
  id: "browser.read",
  name: "Read Webpage Text",
  description: "Fetches and extracts readable text from a webpage URL with privacy scrubbing",
  inputSchema: BrowserReadInputSchema,
  riskLevel: "safe",
  requiresConfirmation: false,
  reversible: false,
  supportedPlatforms: ["windows", "linux", "macos"],
  timeoutMs: 10000,
  async execute(input: BrowserReadInput): Promise<ToolResult> {
    try {
      const res = await fetch(input.url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AI-PC-Controller/2.0",
        },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const html = await res.text();

      // Clean HTML tags and scrub tokens/passwords
      const cleanText = html
        .replace(/<script\b[^<]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style\b[^<]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .replace(/(bearer|token|apiKey|password)\s*[:=]\s*\S+/gi, "[REDACTED]")
        .trim();

      return {
        success: true,
        data: {
          url: input.url,
          title: cleanText.slice(0, 100),
          contentSnippet: cleanText.slice(0, 2000),
          length: cleanText.length,
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
