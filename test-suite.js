/**
 * Comprehensive Automated Testing Suite (v2.0)
 * Tests: Contracts, Policy Engine Regressions, Backend APIs, Native Addon Fallbacks,
 * File Reading & Writing (AI File Editor), Playwright Browser Session Manager, Security Gates, E2E
 */

const path = require("path");
const fs = require("fs/promises");
const os = require("os");

const { PolicyEngine } = require("./packages/executor/src/policy-engine");
const { AgentDecisionSchema } = require("./packages/contracts/src/index");
const { allTools, getTool } = require("./packages/tools/src/index");
const { scrubSecrets } = require("./packages/tools/src/browser/session-manager");

async function runTestSuite() {
  console.log("==========================================================");
  console.log("🚀 STARTING EXTENDED AUTOMATED TEST SUITE (v2.0)");
  console.log("==========================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = "") {
    if (condition) {
      passed++;
      console.log(`  ✅ [PASS] ${testName}`);
    } else {
      failed++;
      console.error(`  ❌ [FAIL] ${testName} ${details ? `(${details})` : ""}`);
    }
  }

  // ---------------------------------------------------------
  // 1. CONTRACTS & SCHEMA VALIDATION TESTS
  // ---------------------------------------------------------
  console.log("--- 1. Contracts & Zod Schemas ---");
  try {
    const validPlan = {
      type: "plan",
      plan: {
        goal: "Test goal",
        steps: [{ toolId: "filesystem.read", args: { path: "test.txt" }, riskLevel: "safe" }],
      },
    };
    const parsed = AgentDecisionSchema.safeParse(validPlan);
    assert(parsed.success, "AgentDecisionSchema validates plan decision");

    const validResponse = { type: "respond", message: "Hello world" };
    const parsedResp = AgentDecisionSchema.safeParse(validResponse);
    assert(parsedResp.success, "AgentDecisionSchema validates response decision");

    const invalidDecision = { type: "unknown_type", foo: "bar" };
    const parsedInvalid = AgentDecisionSchema.safeParse(invalidDecision);
    assert(!parsedInvalid.success, "AgentDecisionSchema rejects invalid decision types");
  } catch (e) {
    assert(false, "Contracts schema test exception", e.message);
  }

  // ---------------------------------------------------------
  // 2. POLICY ENGINE REGRESSION TESTS
  // ---------------------------------------------------------
  console.log("\n--- 2. Policy Engine Risk & Security Regressions ---");
  try {
    const safeCheck = PolicyEngine.evaluate({ toolId: "filesystem.list", args: {}, riskLevel: "safe" });
    assert(safeCheck.allowed && !safeCheck.requiresConfirmation, "Policy Engine auto-approves 'safe' risk");

    const lowCheck = PolicyEngine.evaluate({ toolId: "filesystem.create_directory", args: {}, riskLevel: "low" });
    assert(lowCheck.allowed && !lowCheck.requiresConfirmation, "Policy Engine auto-approves 'low' risk");

    const medCheck = PolicyEngine.evaluate({ toolId: "filesystem.write", args: {}, riskLevel: "medium" });
    assert(medCheck.allowed && !medCheck.requiresConfirmation, "Policy Engine auto-approves 'medium' risk");

    const highCheck = PolicyEngine.evaluate({ toolId: "filesystem.delete", args: {}, riskLevel: "high" });
    assert(!highCheck.allowed && highCheck.requiresConfirmation, "Policy Engine BLOCKS 'high' risk and demands confirmation");

    const critCheck = PolicyEngine.evaluate({ toolId: "system.format", args: {}, riskLevel: "critical" });
    assert(!critCheck.allowed && critCheck.requiresConfirmation, "Policy Engine BLOCKS 'critical' risk and demands confirmation");
  } catch (e) {
    assert(false, "Policy Engine test exception", e.message);
  }

  // ---------------------------------------------------------
  // 3. TOOL REGISTRY & NATIVE ADDON INTEGRATION
  // ---------------------------------------------------------
  console.log("\n--- 3. Tool Registry & Native Addon Integration ---");
  try {
    assert(allTools.length >= 24, `Tool Registry contains all 24 tools (found ${allTools.length})`);

    const readTool = getTool("filesystem.read");
    const writeTool = getTool("filesystem.write");
    assert(!!readTool && !!writeTool, "filesystem.read and filesystem.write tools registered");

    const screenTool = getTool("screen.capture");
    const screenRes = await screenTool.execute({ filename: "test-screen.png" });
    assert(
      screenRes.success && !!screenRes.data?.backend,
      `screen.capture executed via ${screenRes.data?.backend || screenRes.error}`
    );

    const procTool = getTool("process.list");
    const procRes = await procTool.execute({});
    assert(
      procRes.success && !!procRes.data?.backend,
      `process.list executed via ${procRes.data?.backend || procRes.error}`
    );
  } catch (e) {
    assert(false, "Tool registry test exception", e.message);
  }

  // ---------------------------------------------------------
  // 4. AI FILE READING & EDITING (READ -> WRITE -> UNDO SNAPSHOT)
  // ---------------------------------------------------------
  console.log("\n--- 4. AI File Reading & Writing Workflow ---");
  try {
    const testFilePath = path.join(os.tmpdir(), `ai-test-edit-${Date.now()}.txt`);
    const initialText = "Line 1: Original text\nLine 2: Unchanged content";
    const editedText = "Line 1: AI Edited text\nLine 2: Unchanged content\nLine 3: Added by AI";

    // Write initial file
    const writeTool = getTool("filesystem.write");
    const readTool = getTool("filesystem.read");

    await writeTool.execute({ path: testFilePath, content: initialText, createIfMissing: true, encoding: "utf8" });

    // Step 1: Read file context
    const readRes = await readTool.execute({ path: testFilePath, encoding: "utf8", maxBytes: 100000 });
    assert(readRes.success && readRes.data?.content === initialText, "filesystem.read retrieves exact file content for context");

    // Step 2: Write modifications (creates rollback snapshot)
    const editRes = await writeTool.execute({ path: testFilePath, content: editedText, createIfMissing: true, encoding: "utf8" });
    assert(editRes.success && editRes.data?.canUndo, "filesystem.write creates pre-mutation rollback snapshot");

    // Step 3: Verify content
    const verifyRead = await readTool.execute({ path: testFilePath, encoding: "utf8", maxBytes: 100000 });
    assert(verifyRead.data?.content === editedText, "filesystem.write updates file content accurately");

    // Cleanup
    await fs.unlink(testFilePath).catch(() => {});
  } catch (e) {
    assert(false, "File reading & editing test exception", e.message);
  }

  // ---------------------------------------------------------
  // 5. PLAYWRIGHT SECRET SCRUBBING & BROWSER SECURITY
  // ---------------------------------------------------------
  console.log("\n--- 5. Playwright Secret Scrubbing & Privacy ---");
  try {
    const dirtyText = "User token is Bearer eyJhbGciOiJIUzI1Ni... and apiKey=secret12345";
    const cleanText = scrubSecrets(dirtyText);
    assert(!cleanText.includes("secret12345") && cleanText.includes("[REDACTED]"), "scrubSecrets redacts API keys and Bearer tokens");
  } catch (e) {
    assert(false, "Playwright secret scrubbing test exception", e.message);
  }

  // ---------------------------------------------------------
  // 6. BACKEND API ENDPOINTS
  // ---------------------------------------------------------
  console.log("\n--- 6. Backend API Endpoints ---");
  try {
    const healthRes = await fetch("http://localhost:3001/api/health");
    assert(healthRes.ok, "GET /api/health returns HTTP 200");
    const healthData = await healthRes.json();
    assert(healthData.status === "healthy", "GET /api/health status is 'healthy'");

    const auditRes = await fetch("http://localhost:3001/api/audit");
    assert(auditRes.ok, "GET /api/audit returns HTTP 200");

    const undoRes = await fetch("http://localhost:3001/api/undo");
    assert(undoRes.ok, "GET /api/undo returns HTTP 200");
  } catch (e) {
    assert(false, "Backend API test exception", e.message);
  }

  // ---------------------------------------------------------
  // TEST SUITE SUMMARY
  // ---------------------------------------------------------
  console.log("\n==========================================================");
  console.log(`📊 TEST SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==========================================================");

  if (failed > 0) process.exit(1);
}

runTestSuite().catch((err) => {
  console.error("Test Suite Fatal Error:", err);
  process.exit(1);
});
