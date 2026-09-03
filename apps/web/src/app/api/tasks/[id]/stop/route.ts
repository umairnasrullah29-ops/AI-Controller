import { NextResponse } from "next/server";
import { db } from "@ai-pc/database";
// Import the shared cancelledTasks registry from the chat route
// This allows in-flight task loops to detect the stop signal
import { cancelledTasks } from "../../../chat/route";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const taskId = params.id;

    // Register the cancellation signal — the executing plan loop checks this
    cancelledTasks.add(taskId);

    const task = await db.task.findUnique({ where: { id: taskId } });
    if (!task) {
      return NextResponse.json({ success: false, error: "Task not found" }, { status: 404 });
    }

    await db.task.update({
      where: { id: taskId },
      data: { status: "cancelled" },
    });

    const summaryText = "🛑 Execution stopped by user.";
    await db.message.create({
      data: { conversationId: task.conversationId, role: "assistant", content: summaryText },
    });

    return NextResponse.json({ success: true, message: summaryText });
  } catch (err: any) {
    console.error("Stop Task Error:", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}
