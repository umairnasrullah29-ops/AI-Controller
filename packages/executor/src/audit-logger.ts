import { db } from "@ai-pc/database";
import { PlannedAction, ToolResult } from "@ai-pc/contracts";

export class AuditLogger {
  public static async logExecutionStart(params: {
    taskId?: string;
    action: PlannedAction;
    approved: boolean;
  }) {
    try {
      const toolExecution = await db.toolExecution.create({
        data: {
          taskId: params.taskId || null,
          toolId: params.action.toolId,
          args: JSON.stringify(params.action.args),
          riskLevel: params.action.riskLevel,
          approved: params.approved,
          status: "pending",
        },
      });

      const auditLog = await db.auditLog.create({
        data: {
          taskId: params.taskId || null,
          toolId: params.action.toolId,
          args: JSON.stringify(params.action.args),
          riskLevel: params.action.riskLevel,
          approved: params.approved,
          resultStatus: "pending",
        },
      });

      return { toolExecutionId: toolExecution.id, auditLogId: auditLog.id };
    } catch (err) {
      console.error("Failed to write initial audit log to database:", err);
      return null;
    }
  }

  public static async logExecutionEnd(params: {
    toolExecutionId?: string;
    auditLogId?: string;
    result: ToolResult;
    durationMs: number;
  }) {
    try {
      if (params.toolExecutionId) {
        await db.toolExecution.update({
          where: { id: params.toolExecutionId },
          data: {
            status: params.result.success ? "success" : "failed",
            result: params.result.data ? JSON.stringify(params.result.data) : null,
            error: params.result.error || null,
            durationMs: params.durationMs,
          },
        });
      }

      if (params.auditLogId) {
        await db.auditLog.update({
          where: { id: params.auditLogId },
          data: {
            resultStatus: params.result.success ? "success" : "failed",
            durationMs: params.durationMs,
            error: params.result.error || null,
          },
        });
      }
    } catch (err) {
      console.error("Failed to update execution audit log in database:", err);
    }
  }
}
