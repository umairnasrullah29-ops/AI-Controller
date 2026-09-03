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

// Autonomous ReAct Execution Loop: Executes steps, feeds observations back to AI, and executes follow-ups
async function executeAutonomousReActLoop(
  initialSteps: PlannedAction[],
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
  finalMessage?: string;
}> {
  const results: Array<{ toolId: string; success: boolean; data?: any; error?: string; verified: boolean }> = [];
  let currentSteps = [...initialSteps];
  let iteration = 0;
  const maxIterations = 3;
  let allSuccess = true;
  let recoveryAttempted = false;
  let recoveryMessage: string | undefined;
  let finalMessage: string | undefined;

  while (currentSteps.length > 0 && iteration < maxIterations) {
    iteration++;

    for (const step of currentSteps) {
      if (cancelledTasks.has(taskId)) {
        cancelledTasks.delete(taskId);
        return { results, allSuccess: false, recoveryAttempted, recoveryMessage: "🛑 Stopped by user." };
      }

      console.log(`[exec] Iteration ${iteration} Step ${results.length + 1}: ${step.toolId} (risk: ${step.riskLevel})`);
      const stepStart = Date.now();
      const result = await gateway.executeAction(step, { taskId });
      console.log(`[exec] Step ${step.toolId}: ${result.success ? "✅ success" : "❌ failed"} (${Date.now() - stepStart}ms)`);

      results.push({
        toolId: step.toolId,
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

    // If steps completed, determine if further autonomous follow-up is needed
    // Filesystem listings, screenshots, clipboard reads, process lists, and terminal commands are complete in 1 iteration!
    const lastResult = results[results.length - 1];
    const isMultiStepBrowserTask =
      (lastResult?.toolId === "browser.navigate" || lastResult?.toolId === "browser.read") &&
      (originalUserMessage.toLowerCase().includes("register") ||
        originalUserMessage.toLowerCase().includes("login") ||
        originalUserMessage.toLowerCase().includes("fill") ||
        originalUserMessage.toLowerCase().includes("click") ||
        originalUserMessage.toLowerCase().includes("submit") ||
        originalUserMessage.toLowerCase().includes("search"));

    if (!isMultiStepBrowserTask) {
      break; // Task is complete! Do not repeat execution!
    }

    // Feed observation back to AI to determine next action
    try {
      const observationSummary = `Observation from '${lastResult.toolId}': ${JSON.stringify(lastResult.data || {}).slice(0, 1500)}`;
      const nextDecision = await provider.decide({
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
          { role: "assistant", content: `Executed ${lastResult.toolId}. Result: ${observationSummary}` },
        ],
        userMessage: `Observation: ${observationSummary}. Original goal: "${originalUserMessage}". What is the next form fill or click action required? If finished, return type: "respond".`,
      });

      if (nextDecision.type === "plan" && nextDecision.plan?.steps?.length > 0) {
        // Prevent re-executing identical steps
        const newSteps = nextDecision.plan.steps.filter(
          (ns) => !results.some((r) => r.toolId === ns.toolId)
        );
        if (newSteps.length === 0) break;

        const needsConfirmation = newSteps.some(
          (s) => PolicyEngine.evaluate(s).requiresConfirmation
        );
        if (needsConfirmation) {
          break;
        }
        currentSteps = newSteps;
        console.log(`[exec] ReAct next steps planned (${currentSteps.length} steps):`, currentSteps.map((s) => s.toolId));
      } else if (nextDecision.type === "respond") {
        finalMessage = nextDecision.message;
        break;
      } else {
        break;
      }
    } catch (e) {
      console.warn("[exec] ReAct loop check encountered error, finishing:", e);
      break;
    }
  }

  return { results, allSuccess, recoveryAttempted, recoveryMessage, finalMessage };
}

export async function POST(req: Request) {
  const startTime = Date.now();
  try {
    const { conversationId: inputConvoId, message } = await req.json();
    console.log(`[chat] ← Received message (${message?.length || 0} chars): "${(message || "").slice(0, 80)}..."`);

    if (!message || typeof message !== "string") {
      console.warn("[chat] Rejected: empty or non-string message");
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

    console.log(`[chat] AI decision type: ${decision.type}`, decision.type === "plan" ? `goal="${decision.plan?.goal}" steps=${decision.plan?.steps?.length}` : "");
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
        const executionResult = await executeAutonomousReActLoop(
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

        // User-friendly summaries (no technical tool IDs shown to user)
        const formatToolSummary = (r: { toolId: string; verified: boolean; data?: any }) => {
          const toolId = r.toolId.replace(/^\[recovery\]\s*/, "");
          const data = r.data || {};

          if (toolId === "process.list") {
            const total = data.total || data.processes?.length || 0;
            return `- ✅ Found **${total} active processes** running on your computer`;
          }

          if (toolId === "process.stop") {
            return `- ✅ Terminated process **${data.name || `PID ${data.pid}`}**`;
          }

          if (toolId === "filesystem.list") {
            const total = data.total || data.files?.length || 0;
            const pathName = data.path || "the folder";
            return `- ✅ Found **${total} items** in **${pathName}**`;
          }

          if (toolId === "filesystem.create_directory") {
            return `- ✅ Created folder **${data.path || "new directory"}**`;
          }

          if (toolId === "filesystem.write") {
            return `- ✅ Saved file **${data.path || "target file"}**`;
          }

          if (toolId === "filesystem.delete") {
            return `- ✅ Deleted **${data.path || "target path"}**`;
          }

          if (toolId === "filesystem.copy") {
            return `- ✅ Copied to **${data.destination || "destination"}**`;
          }

          if (toolId === "filesystem.move" || toolId === "filesystem.rename") {
            return `- ✅ Moved/Renamed to **${data.destination || data.newPath || "destination"}**`;
          }

          if (toolId === "screen.capture") {
            return `- ✅ **Screenshot captured** successfully (${data.sizeBytes ? Math.round(data.sizeBytes / 1024) + " KB" : "saved"})`;
          }

          if (toolId === "clipboard.read") {
            const preview = (data.text || "").slice(0, 100);
            return `- ✅ **Clipboard content**: "${preview}"`;
          }

          if (toolId === "clipboard.write") {
            return `- ✅ Copied text to system clipboard`;
          }

          if (toolId === "application.open") {
            return `- ✅ Launched **${data.application || "the application"}**`;
          }

          if (toolId === "terminal.execute") {
            return `- ✅ Command executed: \`${data.command}\``;
          }

          if (toolId === "browser.open") {
            return `- ✅ Opened **${data.url}** in your web browser`;
          }

          if (toolId === "browser.navigate") {
            return `- ✅ Navigated to **${data.url || "webpage"}**`;
          }

          if (toolId === "browser.read") {
            return `- ✅ Read page content from **${data.url || "webpage"}** (${data.length ? data.length + " characters" : "ready"})`;
          }

          if (toolId === "browser.fill_form") {
            return `- ✅ Completed form entries on webpage`;
          }

          if (toolId === "browser.click") {
            return `- ✅ Clicked element on webpage`;
          }

          if (toolId === "browser.screenshot") {
            return `- ✅ Captured webpage screenshot`;
          }

          return `- ✅ Completed action successfully`;
        };

        // Detailed server-side logging (for developers only)
        console.log("[chat] Task execution results:", JSON.stringify(results.map(r => ({
          toolId: r.toolId,
          success: r.success,
          verified: r.verified,
          dataKeys: r.data ? Object.keys(r.data) : [],
          error: r.error || null,
        })), null, 2));

        if (executionResult.recoveryMessage && executionResult.recoveryAttempted) {
          const recoveryNote = executionResult.allSuccess
            ? `♻️ **Auto-recovered** and completed successfully.\n\n`
            : `⚠️ Recovery was attempted but the task could not be completed.\n\n`;

          assistantResponseText = recoveryNote + (executionResult.allSuccess
            ? `**${decision.plan.goal}**\n\n` +
              results.map(formatToolSummary).join("\n")
            : `Could not complete: **${decision.plan.goal}**. Please try again or rephrase your request.`);

        } else if (executionResult.allSuccess) {
          assistantResponseText = `**${decision.plan.goal}**\n\n` +
            results.map(formatToolSummary).join("\n");
        } else {
          const failedStep = results.find((r) => !r.success);
          const userError = (failedStep?.error || "").replace(/Error:\s*/gi, "");
          assistantResponseText = `Sorry, I couldn't complete that task. ${userError || "Something went wrong — please try again."}`;
          console.error("[chat] Task execution failed:", failedStep?.toolId, failedStep?.error);
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
    const elapsed = Date.now() - startTime;
    console.error(`[chat] ❌ Unhandled error after ${elapsed}ms:`, err?.stack || err?.message || err);
    // User-friendly error — no stack traces or technical details
    return NextResponse.json({
      success: false,
      error: "Something went wrong while processing your request. Please try again.",
    }, { status: 500 });
  }
}
