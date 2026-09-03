import { NextResponse } from "next/server";
import { db } from "@ai-pc/database";
import { GeminiProvider } from "@ai-pc/ai";
import { allTools } from "@ai-pc/tools";
import { ExecutionGateway, PolicyEngine } from "@ai-pc/executor";
import { AgentDecision, PlannedAction } from "@ai-pc/contracts";

export const dynamic = "force-dynamic";

const systemPolicy = `
- You are an autonomous AI Local PC Controller running on Windows host OS.
- You execute actions ONLY through declared tools.
- Never construct raw shell commands or ask the host to execute direct terminal text.
- Respect risk levels: safe/low/medium can be executed immediately.
- High/critical risk actions (delete, stop process) MUST use ask_confirmation or a plan step with their proper high riskLevel.
- Be concise, accurate, and professional in your summaries.
`;

// Persistent set of task IDs that have been cancelled mid-execution
const cancelledTasks = new Set<string>();

// Expose the set so the cancel endpoint can register a cancellation signal
export { cancelledTasks };

// Helper: execute a plan with one-shot recovery on step failure
async function executePlanWithRecovery(
  steps: PlannedAction[],
  taskId: string,
  gateway: ExecutionGateway,
  provider: GeminiProvider,
  conversationContext: { role: string; content: string }[],
  originalUserMessage: string
): Promise<{
  results: Array<{ toolId: string; success: boolean; data?: any; error?: string; verified: boolean }>;
  allSuccess: boolean;
  recoveryAttempted: boolean;
  recoveryMessage?: string;
}> {
  const results: Array<{ toolId: string; success: boolean; data?: any; error?: string; verified: boolean }> = [];
  let allSuccess = true;
  let recoveryAttempted = false;
  let recoveryMessage: string | undefined;

  for (const step of steps) {
    // Check if task was cancelled mid-execution
    if (cancelledTasks.has(taskId)) {
      cancelledTasks.delete(taskId);
      return { results, allSuccess: false, recoveryAttempted, recoveryMessage: "🛑 Stopped by user." };
    }

    const result = await gateway.executeAction(step, { taskId });

    results.push({
      toolId: step.toolId,
      success: result.success,
      data: result.data,
      error: result.error,
      verified: result.verified,
    });

    if (!result.success) {
      allSuccess = false;

      // ─── ONE-SHOT RECOVERY: Ask Gemini to reformulate with the error context ───
      if (!recoveryAttempted) {
        recoveryAttempted = true;
        try {
          const errorContext = `Previous attempt at '${step.toolId}' failed with error: "${result.error}". Please suggest an alternative approach using available tools.`;

          const recoveryDecision = await provider.decide({
            systemPolicy,
            availableTools: allTools.map((t) => ({
              id: t.id,
              name: t.name,
              description: t.description,
              riskLevel: t.riskLevel,
              inputSchema: t.description,
            })),
            conversationContext: [
              ...conversationContext,
              { role: "assistant", content: errorContext },
            ],
            userMessage: originalUserMessage,
          });

          if (recoveryDecision.type === "plan") {
            // Check recovery plan doesn't also require confirmation
            const recoveryNeedsConfirmation = recoveryDecision.plan.steps.some(
              (s) => PolicyEngine.evaluate(s).requiresConfirmation
            );

            if (!recoveryNeedsConfirmation) {
              // Execute the recovery plan steps
              for (const recoveryStep of recoveryDecision.plan.steps) {
                if (cancelledTasks.has(taskId)) break;
                const recoveryResult = await gateway.executeAction(recoveryStep, { taskId });
                results.push({
                  toolId: `[recovery] ${recoveryStep.toolId}`,
                  success: recoveryResult.success,
                  data: recoveryResult.data,
                  error: recoveryResult.error,
                  verified: recoveryResult.verified,
                });
                if (recoveryResult.success) {
                  allSuccess = true; // Recovery succeeded
                  recoveryMessage = `Auto-recovered using alternative: \`${recoveryStep.toolId}\``;
                }
              }
            } else {
              recoveryMessage = `Recovery plan requires confirmation. Cannot auto-recover.`;
            }
          } else if (recoveryDecision.type === "respond") {
            recoveryMessage = recoveryDecision.message;
          }
        } catch (_recoveryErr) {
          // Recovery itself failed — continue with original failure
        }
      }

      // If we couldn't recover, stop executing further steps
      if (!allSuccess) break;
    }
  }

  return { results, allSuccess, recoveryAttempted, recoveryMessage };
}

export async function POST(req: Request) {
  try {
    const { conversationId: inputConvoId, message } = await req.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json({ success: false, error: "Message is required" }, { status: 400 });
    }

    // 1. Get or create conversation
    let conversationId = inputConvoId;
    if (!conversationId) {
      const convo = await db.conversation.create({ data: {} });
      conversationId = convo.id;
    }

    await db.message.create({
      data: { conversationId, role: "user", content: message },
    });

    // 2. Load conversation history (last 10 messages for context)
    const history = await db.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      take: 10,
    });

    const conversationContext = history.map((m) => ({ role: m.role, content: m.content }));

    // 3. Call Gemini AI
    const provider = new GeminiProvider();
    const decision: AgentDecision = await provider.decide({
      systemPolicy,
      availableTools: allTools.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        riskLevel: t.riskLevel,
        inputSchema: t.description,
      })),
      conversationContext,
      userMessage: message,
    });

    let assistantResponseText = "";
    let pendingTaskId: string | undefined;
    let results: Array<{ toolId: string; success: boolean; data?: any; error?: string; verified: boolean }> = [];

    // 4. Handle decision types
    if (decision.type === "respond") {
      assistantResponseText = decision.message;

    } else if (decision.type === "ask_clarification") {
      assistantResponseText = decision.question;

    } else if (decision.type === "ask_confirmation") {
      const task = await db.task.create({
        data: { conversationId, goal: decision.reason, status: "awaiting_approval" },
      });
      pendingTaskId = task.id;
      assistantResponseText = `⚠️ **Confirmation Required**: ${decision.reason}`;

    } else if (decision.type === "plan") {
      const requiresConfirmation = decision.plan.steps.some(
        (step) => PolicyEngine.evaluate(step).requiresConfirmation
      );

      if (requiresConfirmation) {
        const task = await db.task.create({
          data: { conversationId, goal: decision.plan.goal, status: "awaiting_approval" },
        });
        pendingTaskId = task.id;
        assistantResponseText = `⚠️ **Confirmation Required**: The planned task "${decision.plan.goal}" contains high-risk operations. Please review and confirm.`;

      } else {
        // Execute immediately for safe/low/medium risk
        const task = await db.task.create({
          data: { conversationId, goal: decision.plan.goal, status: "running" },
        });

        const gateway = new ExecutionGateway();
        const executionResult = await executePlanWithRecovery(
          decision.plan.steps,
          task.id,
          gateway,
          provider,
          conversationContext,
          message
        );

        results = executionResult.results;

        await db.task.update({
          where: { id: task.id },
          data: { status: executionResult.allSuccess ? "completed" : "failed" },
        });

        if (executionResult.recoveryMessage && executionResult.recoveryAttempted) {
          // Prefix with recovery notice
          const recoveryNote = executionResult.allSuccess
            ? `♻️ **Auto-recovered**: ${executionResult.recoveryMessage}\n\n`
            : `⚠️ **Recovery attempted**: ${executionResult.recoveryMessage}\n\n`;

          assistantResponseText = recoveryNote + (executionResult.allSuccess
            ? `Completed task: **${decision.plan.goal}**\n\n` +
              results.map((r) => ` - \`${r.toolId}\`: ${r.verified ? "✅ Verified" : "⚠️ Executed"} ${r.data ? JSON.stringify(r.data) : ""}`).join("\n")
            : `Task failed after recovery attempt for **${decision.plan.goal}**.`);

        } else if (executionResult.allSuccess) {
          assistantResponseText = `Completed task: **${decision.plan.goal}**\n\n` +
            results.map((r) => ` - \`${r.toolId}\`: ${r.verified ? "✅ Verified" : "⚠️ Executed"} ${r.data ? JSON.stringify(r.data) : ""}`).join("\n");
        } else {
          const failedStep = results.find((r) => !r.success);
          assistantResponseText = `Task failed during **${failedStep?.toolId || "execution"}**: ${failedStep?.error || "Unknown error"}`;
        }
      }
    }

    // 5. Save assistant response
    await db.message.create({
      data: { conversationId, role: "assistant", content: assistantResponseText },
    });

    return NextResponse.json({
      success: true,
      conversationId,
      taskId: pendingTaskId,
      decision,
      results,
      message: assistantResponseText,
    });

  } catch (err: any) {
    console.error("Error in /api/chat:", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}
