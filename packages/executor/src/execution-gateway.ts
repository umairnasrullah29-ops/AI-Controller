import * as crypto from "crypto";
import { PlannedAction, ToolResult } from "@ai-pc/contracts";
import { PolicyEngine } from "./policy-engine";
import { AuditLogger } from "./audit-logger";

export class ExecutionGateway {
  private hostAgentUrl: string;
  private hostAgentSecret: string;

  constructor(
    hostAgentUrl = process.env.HOST_AGENT_URL || "http://localhost:8765",
    hostAgentSecret = process.env.HOST_AGENT_SECRET || "super-secret-host-agent-key-change-in-prod-12345"
  ) {
    this.hostAgentUrl = hostAgentUrl;
    this.hostAgentSecret = hostAgentSecret;
  }

  public async executeAction(
    action: PlannedAction,
    options?: { taskId?: string; overrideApproved?: boolean }
  ): Promise<ToolResult> {
    const policyResult = PolicyEngine.evaluate(action);
    const approved = options?.overrideApproved ?? policyResult.allowed;

    if (!approved) {
      return {
        success: false,
        error: policyResult.reason || "Action blocked by Policy Engine. Confirmation required.",
        verified: false,
      };
    }

    const startTime = Date.now();
    const auditRecord = await AuditLogger.logExecutionStart({
      taskId: options?.taskId,
      action,
      approved,
    });

    try {
      const timestamp = Date.now().toString();
      const body = JSON.stringify({
        toolId: action.toolId,
        args: action.args,
      });

      const signature = crypto
        .createHmac("sha256", this.hostAgentSecret)
        .update(`${timestamp}.${body}`)
        .digest("hex");

      const response = await fetch(`${this.hostAgentUrl}/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Host-Agent-Timestamp": timestamp,
          "X-Host-Agent-Signature": signature,
        },
        body,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Host Agent returned HTTP ${response.status}: ${errorText}`);
      }

      const result: ToolResult = await response.json();
      const durationMs = Date.now() - startTime;

      if (auditRecord) {
        await AuditLogger.logExecutionEnd({
          toolExecutionId: auditRecord.toolExecutionId,
          auditLogId: auditRecord.auditLogId,
          result,
          durationMs,
        });
      }

      return result;
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const errorResult: ToolResult = {
        success: false,
        error: err?.message || String(err),
        verified: false,
      };

      if (auditRecord) {
        await AuditLogger.logExecutionEnd({
          toolExecutionId: auditRecord.toolExecutionId,
          auditLogId: auditRecord.auditLogId,
          result: errorResult,
          durationMs,
        });
      }

      return errorResult;
    }
  }
}
