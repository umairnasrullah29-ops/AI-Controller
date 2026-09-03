/**
 * Playwright Browser Session Manager
 *
 * Maintains a singleton headless Chromium browser instance.
 * Supports multiple named sessions (pages) and auto-closes on idle.
 * All page content is scrubbed of credentials/secrets before returning to the AI.
 */

import type { Browser, BrowserContext, Page } from "playwright";

interface SessionEntry {
  page: Page;
  ctx: BrowserContext;
  lastUsed: number;
}

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// ─── Credential / Secret Scrubbing Patterns ──────────────────────────────────
const SECRET_PATTERNS = [
  /bearer\s+[a-z0-9\-._~+/]+=*/gi,
  /api[_-]?key\s*[:=]\s*\S+/gi,
  /token\s*[:=]\s*\S+/gi,
  /password\s*[:=]\s*\S+/gi,
  /secret\s*[:=]\s*\S+/gi,
  /Authorization:\s*\S+/gi,
  /Set-Cookie:\s*[^\r\n]+/gi,
  /cookie\s*[:=]\s*[^\n;]+/gi,
];

export function scrubSecrets(text: string): string {
  let out = text;
  for (const pat of SECRET_PATTERNS) {
    out = out.replace(pat, "[REDACTED]");
  }
  return out;
}

// ─── Singleton Browser ───────────────────────────────────────────────────────

let _browserPromise: Promise<Browser> | null = null;
const _sessions = new Map<string, SessionEntry>();
let _idleTimer: ReturnType<typeof setInterval> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!_browserPromise) {
    const { chromium } = await import("playwright");
    _browserPromise = chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
  }
  return _browserPromise;
}

function startIdleWatcher() {
  if (_idleTimer) return;
  _idleTimer = setInterval(async () => {
    const now = Date.now();
    for (const [id, entry] of Array.from(_sessions.entries())) {
      if (now - entry.lastUsed > IDLE_TIMEOUT_MS) {
        try { await entry.ctx.close(); } catch { /* ignore */ }
        _sessions.delete(id);
      }
    }
    if (_sessions.size === 0 && _browserPromise) {
      try { const b = await _browserPromise; await b.close(); } catch { /* ignore */ }
      _browserPromise = null;
      clearInterval(_idleTimer!);
      _idleTimer = null;
    }
  }, 60_000);
}

async function getSession(sessionId = "default"): Promise<{ page: Page }> {
  const browser = await getBrowser();
  let entry = _sessions.get(sessionId);
  if (!entry) {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      extraHTTPHeaders: {},
    });
    const page = await ctx.newPage();
    entry = { page, ctx, lastUsed: Date.now() };
    _sessions.set(sessionId, entry);
    startIdleWatcher();
  }
  entry.lastUsed = Date.now();
  return { page: entry.page };
}

// ─── Public Session API ───────────────────────────────────────────────────────

export async function playwrightNavigate(
  url: string,
  sessionId = "default"
): Promise<{ url: string; title: string; statusCode: number | null }> {
  const { page } = await getSession(sessionId);
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
  return {
    url: page.url(),
    title: await page.title(),
    statusCode: response?.status() ?? null,
  };
}

export async function playwrightReadPage(
  sessionId = "default"
): Promise<{ url: string; title: string; text: string; truncated: boolean }> {
  const { page } = await getSession(sessionId);
  const rawText = await page.evaluate(() => {
    document.querySelectorAll("script, style, noscript, svg").forEach((el) => el.remove());
    return document.body?.innerText ?? "";
  });
  const scrubbed = scrubSecrets(rawText.replace(/\s+/g, " ").trim());
  return {
    url: page.url(),
    title: await page.title(),
    text: scrubbed.slice(0, 6000),
    truncated: scrubbed.length > 6000,
  };
}

export async function playwrightClick(
  selector: string,
  sessionId = "default"
): Promise<{ clicked: boolean; url: string }> {
  const { page } = await getSession(sessionId);
  await page.click(selector, { timeout: 10000 });
  await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {});
  return { clicked: true, url: page.url() };
}

export async function playwrightType(
  selector: string,
  text: string,
  clearFirst: boolean,
  sessionId = "default"
): Promise<{ typed: boolean }> {
  const { page } = await getSession(sessionId);
  if (clearFirst) await page.fill(selector, "");
  await page.type(selector, text, { delay: 30 });
  return { typed: true };
}

export async function playwrightFillForm(
  fields: Array<{ selector: string; value: string }>,
  submitSelector: string | null,
  sessionId = "default"
): Promise<{ filled: boolean; submitted: boolean; url: string }> {
  const { page } = await getSession(sessionId);
  for (const { selector, value } of fields) {
    await page.fill(selector, value, { timeout: 5000 });
  }
  let submitted = false;
  if (submitSelector) {
    await page.click(submitSelector, { timeout: 5000 });
    await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {});
    submitted = true;
  }
  return { filled: true, submitted, url: page.url() };
}

export async function playwrightScreenshot(
  outputPath: string,
  sessionId = "default"
): Promise<{ path: string; sizeBytes: number }> {
  const { page } = await getSession(sessionId);
  await page.screenshot({ path: outputPath, fullPage: false });
  const { statSync } = await import("fs");
  const size = statSync(outputPath).size;
  return { path: outputPath, sizeBytes: size };
}

export async function playwrightSearch(
  query: string,
  engine: "bing" | "duckduckgo",
  sessionId = "default"
): Promise<{ results: string; url: string }> {
  const { page } = await getSession(sessionId);
  const searchUrl = engine === "duckduckgo"
    ? `https://duckduckgo.com/?q=${encodeURIComponent(query)}&ia=web`
    : `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
  await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
  const rawText = await page.evaluate(() => {
    document.querySelectorAll("script, style, noscript, svg").forEach((el) => el.remove());
    return document.body?.innerText ?? "";
  });
  const scrubbed = scrubSecrets(rawText.replace(/\s+/g, " ").trim()).slice(0, 4000);
  return { results: scrubbed, url: page.url() };
}

export async function playwrightClose(sessionId = "default"): Promise<void> {
  const entry = _sessions.get(sessionId);
  if (entry) {
    try { await entry.ctx.close(); } catch { /* ignore */ }
    _sessions.delete(sessionId);
  }
}

export function getActiveSessions(): string[] {
  return Array.from(_sessions.keys());
}
