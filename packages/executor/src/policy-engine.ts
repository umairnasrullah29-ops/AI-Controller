import { PlannedAction, RiskLevel } from "@ai-pc/contracts";

export interface PolicyCheckResult {
  allowed: boolean;
  requiresConfirmation: boolean;
  reason?: string;
}

export class PolicyEngine {
  public static evaluate(action: PlannedAction): PolicyCheckResult {
    const risk = action.riskLevel;

    if (risk === "safe" || risk === "low") {
      return {
        allowed: true,
        requiresConfirmation: false,
      };
    }

    if (risk === "medium") {
      return {
        allowed: true,
        requiresConfirmation: false,
      };
    }

    // High and Critical risks ALWAYS require user confirmation
    return {
      allowed: false,
      requiresConfirmation: true,
      reason: `Action '${action.toolId}' is flagged as '${risk}' risk and requires explicit user confirmation.`,
    };
  }
}
