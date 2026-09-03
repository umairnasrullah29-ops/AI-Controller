import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import * as crypto from "crypto";
import * as os from "os";
import { getTool } from "@ai-pc/tools";
import { ToolResult } from "@ai-pc/contracts";

const app = express();
const PORT = process.env.HOST_AGENT_PORT ? parseInt(process.env.HOST_AGENT_PORT, 10) : 8765;
const SECRET = process.env.HOST_AGENT_SECRET || "super-secret-host-agent-key-change-in-prod-12345";

app.use(cors());

// Raw body parser for signature validation
app.use(express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf.toString("utf8");
  }
}));

// HMAC Authentication middleware
function authenticateRequest(req: any, res: Response, next: NextFunction) {
  const timestamp = req.headers["x-host-agent-timestamp"] as string;
  const signature = req.headers["x-host-agent-signature"] as string;

  if (!timestamp || !signature) {
    return res.status(401).json({
      success: false,
      error: "Missing security headers (X-Host-Agent-Timestamp / X-Host-Agent-Signature)",
      verified: false,
    });
  }

  // Prevent stale requests (> 5 minutes)
  const reqTime = parseInt(timestamp, 10);
  if (isNaN(reqTime) || Math.abs(Date.now() - reqTime) > 300000) {
    return res.status(401).json({
      success: false,
      error: "Request timestamp expired or invalid",
      verified: false,
    });
  }

  const rawBody = req.rawBody || JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac("sha256", SECRET)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    return res.status(403).json({
      success: false,
      error: "Invalid request signature",
      verified: false,
    });
  }

  next();
}

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    hostname: os.hostname(),
    platform: process.platform,
    arch: os.arch(),
    uptime: os.uptime(),
  });
});

app.post("/execute", authenticateRequest, async (req: Request, res: Response) => {
  const { toolId, args } = req.body;

  if (!toolId) {
    return res.status(400).json({
      success: false,
      error: "Missing toolId in request body",
      verified: false,
    });
  }

  const tool = getTool(toolId);
  if (!tool) {
    return res.status(404).json({
      success: false,
      error: `Tool with id '${toolId}' is not registered on Host Agent`,
      verified: false,
    });
  }

  // Validate args with tool input schema
  const parseResult = tool.inputSchema.safeParse(args);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      error: `Invalid tool arguments for '${toolId}': ${parseResult.error.message}`,
      verified: false,
    });
  }

  try {
    const result: ToolResult = await tool.execute(parseResult.data);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err?.message || String(err),
      verified: false,
    });
  }
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`🚀 Host Agent running natively on http://127.0.0.1:${PORT}`);
  console.log(`Platform: ${process.platform} (${os.hostname()})`);
});
