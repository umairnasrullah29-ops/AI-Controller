import { NextResponse } from "next/server";
import { db } from "@ai-pc/database";

export const dynamic = "force-dynamic";

export async function GET() {
  let dbStatus = "unknown";
  let hostAgentStatus = "unknown";

  try {
    await db.$queryRaw`SELECT 1`;
    dbStatus = "connected";
  } catch (err: any) {
    dbStatus = `error: ${err?.message || String(err)}`;
  }

  try {
    const hostAgentPort = process.env.HOST_AGENT_PORT || "8765";
    const res = await fetch(`http://127.0.0.1:${hostAgentPort}/health`, {
      cache: "no-store",
    });
    if (res.ok) {
      hostAgentStatus = "connected";
    } else {
      hostAgentStatus = `http_${res.status}`;
    }
  } catch (err: any) {
    hostAgentStatus = "disconnected";
  }

  return NextResponse.json({
    status: dbStatus === "connected" && hostAgentStatus === "connected" ? "healthy" : "degraded",
    database: dbStatus,
    hostAgent: hostAgentStatus,
    timestamp: new Date().toISOString(),
  });
}
