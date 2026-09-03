import * as path from "path";

interface NativeAddon {
  captureScreen(outputPath: string): {
    widthPx: number;
    heightPx: number;
    sizeBytes: number;
    durationMs: number;
  };
  listProcesses(filter?: string): Array<{
    pid: number;
    name: string;
    sessionId: number;
    memKb: number;
    threads: number;
    _meta?: { total: number; durationMs: number };
  }>;
}

let _addon: NativeAddon | null = null;
let _loadAttempted = false;

function getDirname(): string {
  if (typeof __dirname !== "undefined") return __dirname;
  try {
    return path.dirname(require.main?.filename || process.cwd());
  } catch {
    return process.cwd();
  }
}

function loadAddon(): NativeAddon | null {
  if (_loadAttempted) return _addon;
  _loadAttempted = true;

  const baseDir = getDirname();
  const candidatePaths = [
    path.join(baseDir, "node_modules", "@ai-pc", "native", "build", "Release", "ai_pc_native.node"),
    path.join(baseDir, "..", "native", "build", "Release", "ai_pc_native.node"),
    path.join(baseDir, "build", "Release", "ai_pc_native.node"),
  ];

  for (const candidate of candidatePaths) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      _addon = require(candidate) as NativeAddon;
      console.log(`[native] ✅ Loaded native addon from ${candidate}`);
      return _addon;
    } catch {
      // try next path
    }
  }

  return null;
}

/**
 * Capture the primary display and save as PNG.
 * @returns metadata if native addon available, null otherwise (caller should fall back).
 */
export function nativeCaptureScreen(
  outputPath: string
): { widthPx: number; heightPx: number; sizeBytes: number; durationMs: number } | null {
  const addon = loadAddon();
  if (!addon) return null;
  try {
    return addon.captureScreen(outputPath);
  } catch (err) {
    console.error("[native] captureScreen error:", err);
    return null;
  }
}

/**
 * Enumerate running processes, optionally filtered by name substring.
 * @returns array of process info if native addon available, null otherwise.
 */
export function nativeListProcesses(filter?: string): Array<{
  pid: number;
  name: string;
  sessionId: number;
  memKb: number;
  threads: number;
}> | null {
  const addon = loadAddon();
  if (!addon) return null;
  try {
    const results = addon.listProcesses(filter);
    return results.map(({ pid, name, sessionId, memKb, threads }) => ({
      pid, name, sessionId, memKb, threads,
    }));
  } catch (err) {
    console.error("[native] listProcesses error:", err);
    return null;
  }
}

/** Whether the native addon was successfully loaded */
export function isNativeAvailable(): boolean {
  return loadAddon() !== null;
}
