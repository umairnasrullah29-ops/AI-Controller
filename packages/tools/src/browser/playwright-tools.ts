/**
 * Playwright Browser Tool Definitions
 * All tools use the shared session manager for a singleton Chromium instance.
 */

import { z } from "zod";
import * as path from "path";
import * as os from "os";
import * as fs from "fs/promises";
import { ToolDefinition, ToolResult } from "@ai-pc/contracts";
import {
  playwrightNavigate,
  playwrightReadPage,
  playwrightClick,
  playwrightType,
  playwrightFillForm,
  playwrightScreenshot,
  playwrightSearch,
  playwrightClose,
} from "./session-manager";

// ─── browser.open (HTTP fetch, no Playwright) ─────────────────────────────────
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
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);
      if (process.platform === "win32") {
        await execAsync(`start "" "${input.url}"`, { windowsHide: false });
      } else if (process.platform === "darwin") {
        await execAsync(`open "${input.url}"`);
      } else {
        await execAsync(`xdg-open "${input.url}"`);
      }
      return { success: true, data: { url: input.url, opened: true }, verified: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err), verified: false };
    }
  },
};

// ─── browser.navigate ─────────────────────────────────────────────────────────
export const BrowserNavigateInputSchema = z.object({
  url: z.string().url().describe("URL to navigate the headless browser to"),
  sessionId: z.string().optional().default("default").describe("Named browser session (default: 'default')"),
});
export type BrowserNavigateInput = z.infer<typeof BrowserNavigateInputSchema>;
export const browserNavigateTool: ToolDefinition<BrowserNavigateInput> = {
  id: "browser.navigate",
  name: "Navigate Headless Browser",
  description: "Navigates the persistent headless Chromium browser to a URL and returns the loaded page title and final URL",
  inputSchema: BrowserNavigateInputSchema,
  riskLevel: "safe",
  requiresConfirmation: false,
  reversible: false,
  supportedPlatforms: ["windows", "linux", "macos"],
  timeoutMs: 20000,
  async execute(input: BrowserNavigateInput): Promise<ToolResult> {
    try {
      const result = await playwrightNavigate(input.url, input.sessionId);
      return { success: true, data: result, verified: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err), verified: false };
    }
  },
};

// ─── browser.read ─────────────────────────────────────────────────────────────
export const BrowserReadInputSchema = z.object({
  url: z.string().url().optional().describe("URL to navigate to before reading (optional if already on the page)"),
  sessionId: z.string().optional().default("default"),
});
export type BrowserReadInput = z.infer<typeof BrowserReadInputSchema>;
export const browserReadTool: ToolDefinition<BrowserReadInput> = {
  id: "browser.read",
  name: "Read Webpage Text",
  description: "Reads the visible text from the current headless browser page, with automatic secret/credential scrubbing. Optionally navigates to a URL first.",
  inputSchema: BrowserReadInputSchema,
  riskLevel: "safe",
  requiresConfirmation: false,
  reversible: false,
  supportedPlatforms: ["windows", "linux", "macos"],
  timeoutMs: 20000,
  async execute(input: BrowserReadInput): Promise<ToolResult> {
    try {
      if (input.url) {
        await playwrightNavigate(input.url, input.sessionId);
      }
      const result = await playwrightReadPage(input.sessionId);
      return { success: true, data: result, verified: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err), verified: false };
    }
  },
};

// ─── browser.click ───────────────────────────────────────────────────────────
export const BrowserClickInputSchema = z.object({
  selector: z.string().describe("CSS selector or text/aria-label selector to click (e.g. 'button.submit', 'text=Login')"),
  sessionId: z.string().optional().default("default"),
});
export type BrowserClickInput = z.infer<typeof BrowserClickInputSchema>;
export const browserClickTool: ToolDefinition<BrowserClickInput> = {
  id: "browser.click",
  name: "Click Browser Element",
  description: "Clicks a DOM element in the headless browser using a CSS or text selector",
  inputSchema: BrowserClickInputSchema,
  riskLevel: "low",
  requiresConfirmation: false,
  reversible: false,
  supportedPlatforms: ["windows", "linux", "macos"],
  timeoutMs: 15000,
  async execute(input: BrowserClickInput): Promise<ToolResult> {
    try {
      const result = await playwrightClick(input.selector, input.sessionId);
      return { success: true, data: result, verified: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err), verified: false };
    }
  },
};

// ─── browser.type ────────────────────────────────────────────────────────────
export const BrowserTypeInputSchema = z.object({
  selector: z.string().describe("CSS selector for the text input element"),
  text: z.string().describe("Text to type into the element"),
  clearFirst: z.boolean().optional().default(true).describe("Clear the field before typing (default: true)"),
  sessionId: z.string().optional().default("default"),
});
export type BrowserTypeInput = z.infer<typeof BrowserTypeInputSchema>;
export const browserTypeTool: ToolDefinition<BrowserTypeInput> = {
  id: "browser.type",
  name: "Type Text in Browser",
  description: "Types text into an input field in the headless browser (e.g. search box, textarea)",
  inputSchema: BrowserTypeInputSchema,
  riskLevel: "low",
  requiresConfirmation: false,
  reversible: false,
  supportedPlatforms: ["windows", "linux", "macos"],
  timeoutMs: 15000,
  async execute(input: BrowserTypeInput): Promise<ToolResult> {
    try {
      const result = await playwrightType(input.selector, input.text, input.clearFirst ?? true, input.sessionId);
      return { success: true, data: result, verified: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err), verified: false };
    }
  },
};

// ─── browser.fill_form ───────────────────────────────────────────────────────
export const BrowserFillFormInputSchema = z.object({
  fields: z.array(z.object({
    selector: z.string().describe("CSS selector for form field"),
    value: z.string().describe("Value to fill into the field"),
  })).describe("Array of {selector, value} pairs to fill"),
  submitSelector: z.string().nullable().optional().describe("CSS selector of the submit button (null to skip submission)"),
  sessionId: z.string().optional().default("default"),
});
export type BrowserFillFormInput = z.infer<typeof BrowserFillFormInputSchema>;
export const browserFillFormTool: ToolDefinition<BrowserFillFormInput> = {
  id: "browser.fill_form",
  name: "Fill & Submit Browser Form",
  description: "Fills multiple form fields and optionally submits a form in the headless browser",
  inputSchema: BrowserFillFormInputSchema,
  riskLevel: "medium",
  requiresConfirmation: false,
  reversible: false,
  supportedPlatforms: ["windows", "linux", "macos"],
  timeoutMs: 20000,
  async execute(input: BrowserFillFormInput): Promise<ToolResult> {
    try {
      const result = await playwrightFillForm(input.fields, input.submitSelector ?? null, input.sessionId);
      return { success: true, data: result, verified: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err), verified: false };
    }
  },
};

// ─── browser.screenshot ──────────────────────────────────────────────────────
export const BrowserScreenshotInputSchema = z.object({
  filename: z.string().optional().describe("Output filename (default: browser-screenshot-<timestamp>.png)"),
  sessionId: z.string().optional().default("default"),
});
export type BrowserScreenshotInput = z.infer<typeof BrowserScreenshotInputSchema>;
export const browserScreenshotTool: ToolDefinition<BrowserScreenshotInput> = {
  id: "browser.screenshot",
  name: "Screenshot Browser Page",
  description: "Captures a screenshot of the current headless browser page viewport",
  inputSchema: BrowserScreenshotInputSchema,
  riskLevel: "safe",
  requiresConfirmation: false,
  reversible: false,
  supportedPlatforms: ["windows", "linux", "macos"],
  timeoutMs: 15000,
  async execute(input: BrowserScreenshotInput): Promise<ToolResult> {
    try {
      const dir = path.join(os.tmpdir(), "ai-pc-browser-screenshots");
      await fs.mkdir(dir, { recursive: true });
      const filename = input.filename || `browser-screenshot-${Date.now()}.png`;
      const outputPath = path.join(dir, filename);
      const result = await playwrightScreenshot(outputPath, input.sessionId);
      return { success: true, data: result, verified: result.sizeBytes > 0 };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err), verified: false };
    }
  },
};

// ─── browser.search ──────────────────────────────────────────────────────────
export const BrowserSearchInputSchema = z.object({
  query: z.string().describe("Search query to submit"),
  engine: z.enum(["bing", "duckduckgo"]).optional().default("duckduckgo").describe("Search engine to use"),
  sessionId: z.string().optional().default("default"),
});
export type BrowserSearchInput = z.infer<typeof BrowserSearchInputSchema>;
export const browserSearchTool: ToolDefinition<BrowserSearchInput> = {
  id: "browser.search",
  name: "Search the Web",
  description: "Submits a search query to DuckDuckGo or Bing and returns the results text with credential scrubbing",
  inputSchema: BrowserSearchInputSchema,
  riskLevel: "safe",
  requiresConfirmation: false,
  reversible: false,
  supportedPlatforms: ["windows", "linux", "macos"],
  timeoutMs: 20000,
  async execute(input: BrowserSearchInput): Promise<ToolResult> {
    try {
      const result = await playwrightSearch(input.query, input.engine ?? "duckduckgo", input.sessionId);
      return { success: true, data: result, verified: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err), verified: false };
    }
  },
};

// ─── browser.close ───────────────────────────────────────────────────────────
export const BrowserCloseInputSchema = z.object({
  sessionId: z.string().optional().default("default"),
});
export type BrowserCloseInput = z.infer<typeof BrowserCloseInputSchema>;
export const browserCloseTool: ToolDefinition<BrowserCloseInput> = {
  id: "browser.close",
  name: "Close Browser Session",
  description: "Closes the named headless browser session and releases all associated resources",
  inputSchema: BrowserCloseInputSchema,
  riskLevel: "safe",
  requiresConfirmation: false,
  reversible: false,
  supportedPlatforms: ["windows", "linux", "macos"],
  timeoutMs: 5000,
  async execute(input: BrowserCloseInput): Promise<ToolResult> {
    try {
      await playwrightClose(input.sessionId);
      return { success: true, data: { closed: true, sessionId: input.sessionId }, verified: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err), verified: false };
    }
  },
};
