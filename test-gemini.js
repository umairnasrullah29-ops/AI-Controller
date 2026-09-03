process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AQ.Ab8RN6KVNSwvRQ770g7uETWiSBbJrVXHZI9w9Ck9aVsFw3r_0g";

async function testGemini() {
  // Directly test the API
  const { GoogleGenerativeAI } = require("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: "gemini-3.6-flash",
    generationConfig: { responseMimeType: "application/json", temperature: 0 },
  });

  const prompt = `You are an AI PC controller. Respond with JSON.

Available tools:
- filesystem.list: lists directory contents [risk: safe]
- filesystem.create_directory: creates a directory [risk: low]

Tool args:
- filesystem.list: {"path": "<Downloads|Desktop|Documents|absolute path>"}
- filesystem.create_directory: {"path": "<parent path>", "name": "<folder name>"}

User message: "List the files in my Downloads folder"

Respond with ONLY this JSON (no markdown):
{"type":"plan","plan":{"goal":"List Downloads folder","steps":[{"toolId":"filesystem.list","args":{"path":"Downloads"},"riskLevel":"safe"}]}}`;

  const res = await model.generateContent(prompt);
  const text = res.response.text();
  console.log("Raw Gemini output:", text);
  console.log("Parsed:", JSON.parse(text));
}

testGemini().catch(console.error);
