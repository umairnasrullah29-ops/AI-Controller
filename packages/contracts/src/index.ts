import { z } from "zod";

export type RiskLevel = "safe" | "low" | "medium" | "high" | "critical";
export type Platform = "windows" | "linux" | "macos";

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  verified: boolean;
}

export interface ToolDefinition<TInput = any> {
  id: string;
  name: string;
  description: string;
  inputSchema: z.ZodType<any, any, any>;
  riskLevel: RiskLevel;
  requiresConfirmation: boolean;
  reversible: boolean;
  supportedPlatforms: Platform[];
  timeoutMs: number;
  execute(input: TInput): Promise<ToolResult>;
  verify?(input: TInput, result: ToolResult): Promise<boolean>;
}

export const PlannedActionSchema = z.object({
  toolId: z.string(),
  args: z.record(z.unknown()).or(z.unknown()),
  riskLevel: z.enum(["safe", "low", "medium", "high", "critical"]),
});

export type PlannedAction = z.infer<typeof PlannedActionSchema>;

export const TaskPlanSchema = z.object({
  goal: z.string(),
  steps: z.array(PlannedActionSchema),
});

export type TaskPlan = z.infer<typeof TaskPlanSchema>;

export const AgentDecisionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("respond"),
    message: z.string(),
  }),
  z.object({
    type: z.literal("plan"),
    plan: TaskPlanSchema,
  }),
  z.object({
    type: z.literal("ask_confirmation"),
    reason: z.string(),
    actions: z.array(PlannedActionSchema),
  }),
  z.object({
    type: z.literal("ask_clarification"),
    question: z.string(),
  }),
]);

export type AgentDecision = z.infer<typeof AgentDecisionSchema>;

export interface AIProvider {
  decide(input: {
    systemPolicy: string;
    availableTools: Array<{
      id: string;
      name: string;
      description: string;
      riskLevel: RiskLevel;
      inputSchema: Record<string, unknown> | string;
    }>;
    conversationContext: { role: string; content: string }[];
    userMessage: string;
  }): Promise<AgentDecision>;
}
