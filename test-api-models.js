const fs = require("fs");
const dotenv = require("dotenv");

// Load .env
const envConfig = dotenv.parse(fs.readFileSync(".env"));
const GEMINI_KEY = envConfig.GEMINI_API_KEY;
const DEEPGRAM_KEY = envConfig.DEEPGRAM_API_KEY;

async function checkGemini() {
  console.log("==========================================");
  console.log("🔍 TESTING GOOGLE GEMINI API & MODELS...");
  console.log("==========================================");

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_KEY}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) {
      console.error("Gemini ListModels Error:", data);
      return;
    }

    if (data.models && Array.isArray(data.models)) {
      console.log(`✅ Gemini API Connection Successful! Found ${data.models.length} models:`);
      const contentModels = data.models.filter(
        (m) => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent")
      );

      console.log("\n--- Models Supporting 'generateContent' ---");
      contentModels.forEach((m) => {
        const name = m.name.replace("models/", "");
        console.log(` • ${name.padEnd(25)} | Display: ${m.displayName}`);
      });

      // Test generating content with top models
      console.log("\nTesting prompt generation on candidates...");
      for (const testModel of ["gemini-3.6-flash", "gemini-1.5-flash", "gemini-2.0-flash", "gemini-1.5-pro", "gemini-pro"]) {
        const modelMatch = contentModels.find((m) => m.name === `models/${testModel}`);
        if (!modelMatch) continue;
        try {
          const genRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${testModel}:generateContent?key=${GEMINI_KEY}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts: [{ text: "Respond with single word: OK" }] }],
              }),
            }
          );
          if (genRes.ok) {
            const genData = await genRes.json();
            const text = genData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            console.log(`   ✓ ${testModel}: ACCESSIBLE & WORKING (Response: "${text}")`);
          } else {
            console.log(`   ✗ ${testModel}: HTTP ${genRes.status}`);
          }
        } catch (e) {
          console.log(`   ✗ ${testModel}: Failed (${e.message})`);
        }
      }
    }
  } catch (err) {
    console.error("Gemini check error:", err);
  }
}

async function checkDeepgram() {
  console.log("\n==========================================");
  console.log("🔍 TESTING DEEPGRAM API & MODELS (STT & TTS)...");
  console.log("==========================================");

  try {
    // 1. Check Projects / Key validity
    const projRes = await fetch("https://api.deepgram.com/v1/projects", {
      headers: { Authorization: `Token ${DEEPGRAM_KEY}` },
    });

    if (!projRes.ok) {
      console.error("Deepgram Auth Error:", await projRes.text());
      return;
    }

    const projData = await projRes.json();
    console.log("✅ Deepgram Authentication Successful!");
    if (projData.projects) {
      projData.projects.forEach((p) => {
        console.log(` • Project: "${p.name}" (ID: ${p.project_id})`);
      });
    }

    // 2. Test Deepgram TTS Voices (Aura)
    console.log("\n--- Testing Deepgram Aura TTS Voices ---");
    const testVoices = [
      "aura-asteria-en",
      "aura-luna-en",
      "aura-stella-en",
      "aura-athena-en",
      "aura-hera-en",
      "aura-orion-en",
      "aura-arcas-en",
      "aura-perseus-en",
      "aura-angus-en",
      "aura-orpheus-en",
      "aura-helios-en",
      "aura-zeus-en",
    ];

    for (const voice of testVoices) {
      try {
        const ttsRes = await fetch(`https://api.deepgram.com/v1/speak?model=${voice}`, {
          method: "POST",
          headers: {
            Authorization: `Token ${DEEPGRAM_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text: "Test audio." }),
        });
        if (ttsRes.ok) {
          const buf = await ttsRes.arrayBuffer();
          console.log(`   ✓ TTS Voice '${voice}': ACCESSIBLE (${buf.byteLength} bytes mp3 returned)`);
        } else {
          console.log(`   ✗ TTS Voice '${voice}': HTTP ${ttsRes.status}`);
        }
      } catch (e) {
        console.log(`   ✗ TTS Voice '${voice}': ${e.message}`);
      }
    }

    // 3. Test Deepgram STT Models
    console.log("\n--- Testing Deepgram STT Models ---");
    const testSttModels = ["nova-2", "nova-3", "enhanced", "base"];
    // Dummy wav header + silence for testing STT model availability
    const dummyWavHeader = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
      0x66, 0x6d, 0x74, 0x20, 0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
      0x44, 0xac, 0x00, 0x00, 0x88, 0x58, 0x01, 0x00, 0x02, 0x00, 0x10, 0x00,
      0x64, 0x61, 0x74, 0x61, 0x00, 0x00, 0x00, 0x00
    ]);

    for (const sttModel of testSttModels) {
      try {
        const sttRes = await fetch(`https://api.deepgram.com/v1/listen?model=${sttModel}`, {
          method: "POST",
          headers: {
            Authorization: `Token ${DEEPGRAM_KEY}`,
            "Content-Type": "audio/wav",
          },
          body: dummyWavHeader,
        });
        if (sttRes.ok) {
          console.log(`   ✓ STT Model '${sttModel}': ACCESSIBLE & READY`);
        } else {
          const err = await sttRes.text();
          console.log(`   ✗ STT Model '${sttModel}': HTTP ${sttRes.status} (${err})`);
        }
      } catch (e) {
        console.log(`   ✗ STT Model '${sttModel}': ${e.message}`);
      }
    }
  } catch (err) {
    console.error("Deepgram check error:", err);
  }
}

async function runAll() {
  await checkGemini();
  await checkDeepgram();
  console.log("\n==========================================");
  console.log("🎉 ALL API & MODEL CHECKS COMPLETED");
  console.log("==========================================");
}

runAll();
