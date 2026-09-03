import { ToolDefinition } from "@ai-pc/contracts";
import { listFilesTool } from "./filesystem/list";
import { createDirectoryTool } from "./filesystem/create-directory";
import { copyFileTool } from "./filesystem/copy";
import { moveFileTool } from "./filesystem/move";
import { renameFileTool } from "./filesystem/rename";
import { deleteFileTool } from "./filesystem/delete";
import { readFileTool } from "./filesystem/read";
import { writeFileTool } from "./filesystem/write";
import { listProcessesTool } from "./process/list";
import { stopProcessTool } from "./process/stop";
import { openApplicationTool } from "./process/open";
import { screenCaptureTool } from "./screen/capture";
import { clipboardReadTool } from "./clipboard/read";
import { clipboardWriteTool } from "./clipboard/write";
import { terminalExecuteTool } from "./terminal/execute";
import {
  browserOpenTool,
  browserNavigateTool,
  browserReadTool,
  browserClickTool,
  browserTypeTool,
  browserFillFormTool,
  browserScreenshotTool,
  browserSearchTool,
  browserCloseTool,
} from "./browser/playwright-tools";

// Re-exports
export * from "./filesystem/list";
export * from "./filesystem/create-directory";
export * from "./filesystem/copy";
export * from "./filesystem/move";
export * from "./filesystem/rename";
export * from "./filesystem/delete";
export * from "./filesystem/read";
export * from "./filesystem/write";
export * from "./process/list";
export * from "./process/stop";
export * from "./process/open";
export * from "./screen/capture";
export * from "./clipboard/read";
export * from "./clipboard/write";
export * from "./terminal/execute";
export * from "./browser/playwright-tools";
export * from "./browser/session-manager";
export * from "./undo/undo-engine";

export const allTools: ToolDefinition<any>[] = [
  // Filesystem
  listFilesTool,
  createDirectoryTool,
  readFileTool,
  writeFileTool,
  copyFileTool,
  moveFileTool,
  renameFileTool,
  deleteFileTool,
  // Process & Application
  listProcessesTool,
  stopProcessTool,
  openApplicationTool,
  // Screen & Clipboard
  screenCaptureTool,
  clipboardReadTool,
  clipboardWriteTool,
  // Terminal
  terminalExecuteTool,
  // Browser (Playwright)
  browserOpenTool,
  browserNavigateTool,
  browserReadTool,
  browserClickTool,
  browserTypeTool,
  browserFillFormTool,
  browserScreenshotTool,
  browserSearchTool,
  browserCloseTool,
];

export const toolRegistry = new Map<string, ToolDefinition<any>>(
  allTools.map((tool) => [tool.id, tool])
);

export function getTool(id: string): ToolDefinition<any> | undefined {
  return toolRegistry.get(id);
}
