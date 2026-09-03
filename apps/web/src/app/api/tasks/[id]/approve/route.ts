import { NextResponse } from "next/server";
import { db } from "@ai-pc/database";
import { ExecutionGateway } from "@ai-pc/executor";
import { PlannedAction } from "@ai-pc/contracts";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const taskId = params.id;
    const body = await req.json().catch(() => ({}));
    const { actions } = body;

    const task = await db.task.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      return NextResponse.json(
        { success: false, error: "Task not found" },
        { status: 404 }
      );
    }

    const gateway = new ExecutionGateway();
    const results: Array<{ toolId: string; success: boolean; data?: any; error?: string; verified: boolean }> = [];
    let allSuccess = true;

    if (actions && Array.isArray(actions)) {
      for (const action of actions as PlannedAction[]) {
        const result = await gateway.executeAction(action, {
          taskId,
          overrideApproved: true,
        });
        results.push({
          toolId: action.toolId,
          success: result.success,
          data: result.data,
          error: result.error,
          verified: result.verified,
        });

        if (!result.success) {
          allSuccess = false;
          break;
        }
      }
    }

    await db.task.update({
      where: { id: taskId },
      data: { status: allSuccess ? "completed" : "failed" },
    });

    const formatApprovalSummary = (r: { toolId: string; verified: boolean; data?: any }) => {
      const data = r.data || {};
      if (r.toolId === "filesystem.delete") {
        return `- ✅ Permanently deleted **${data.path || "the file/folder"}**`;
      }
      if (r.toolId === "process.stop") {
        return `- ✅ Terminated process **${data.name || `PID ${data.pid}`}**`;
      }
      if (r.toolId === "filesystem.write") {
        return `- ✅ Updated file **${data.path || "target file"}**`;
      }
      return `- ✅ Executed action successfully`;
    };

    const summaryText = allSuccess
      ? `**Approved Action Completed Successfully**\n\n` +
        results.map(formatApprovalSummary).join("\n")
      : `Sorry, the action failed during execution: ${results.find((r) => !r.success)?.error?.replace(/Error:\s*/gi, "") || "Something went wrong"}`;

    await db.message.create({
      data: {
        conversationId: task.conversationId,
        role: "assistant",
        content: summaryText,
      },
    });

    return NextResponse.json({
      success: true,
      results,
      message: summaryText,
    });
  } catch (err: any) {
    console.error("Approve Task Error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || String(err) },
      { status: 500 }
    );
  }
}
