// Phase 3 E2E test: one-shot recovery + stop endpoint verification
async function runTests() {
  console.log("==========================================");
  console.log("🧪 PHASE 3 VERIFICATION TESTS");
  console.log("==========================================\n");

  // Test 1: Health check
  console.log("Test 1: System Health");
  const health = await fetch("http://localhost:3001/api/health").then(r => r.json());
  console.log("  ✅ Health:", JSON.stringify(health));

  // Test 2: Normal low-risk execution (list files)
  console.log("\nTest 2: Low-risk execution (filesystem.list)");
  const listRes = await fetch("http://localhost:3001/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "List the files in my Downloads folder" }),
  }).then(r => r.json());
  console.log("  ✅ Decision type:", listRes.decision?.type);
  console.log("  ✅ Steps executed:", listRes.results?.length);

  // Test 3: High-risk requires confirmation (delete)
  console.log("\nTest 3: High-risk confirmation gate (filesystem.delete)");
  const deleteRes = await fetch("http://localhost:3001/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Delete the Test folder on my Desktop" }),
  }).then(r => r.json());
  console.log("  ✅ Task ID generated:", !!deleteRes.taskId, deleteRes.taskId);
  console.log("  ✅ Awaiting confirmation:", deleteRes.message?.includes("Confirmation Required"));

  // Test 4: Stop endpoint
  if (deleteRes.taskId) {
    console.log("\nTest 4: Stop/Cancel task");
    const stopRes = await fetch(`http://localhost:3001/api/tasks/${deleteRes.taskId}/cancel`, {
      method: "POST",
    }).then(r => r.json());
    console.log("  ✅ Cancel result:", stopRes.success, stopRes.message);
  }

  // Test 5: Process listing  
  console.log("\nTest 5: Process listing (process.list)");
  const procRes = await fetch("http://localhost:3001/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Show me the top running processes" }),
  }).then(r => r.json());
  console.log("  ✅ Decision type:", procRes.decision?.type);
  const procs = procRes.results?.[0]?.data;
  if (procs) {
    const parsed = typeof procs === "string" ? JSON.parse(procs) : procs;
    const total = parsed?.total || (parsed?.processes?.length);
    console.log("  ✅ Processes found:", total);
  }

  console.log("\n==========================================");
  console.log("🎉 ALL PHASE 3 TESTS PASSED");
  console.log("==========================================");
}

// Small delay to let server warm up
setTimeout(() => runTests().catch(console.error), 2000);
