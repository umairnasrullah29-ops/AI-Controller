import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "DEEPGRAM_API_KEY is not configured in .env" },
        { status: 500 }
      );
    }

    const { text } = await req.json();
    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { success: false, error: "Text string is required" },
        { status: 400 }
      );
    }

    // Clean markdown formatting characters from text for natural speech
    const cleanText = text
      .replace(/[*#`_~\[\]]/g, "")
      .replace(/https?:\/\/\S+/g, "")
      .trim();

    if (!cleanText) {
      return NextResponse.json(
        { success: false, error: "No speakable text provided" },
        { status: 400 }
      );
    }

    const voice = process.env.DEEPGRAM_TTS_VOICE || "aura-asteria-en";

    const response = await fetch(
      `https://api.deepgram.com/v1/speak?model=${voice}`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: cleanText }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { success: false, error: `Deepgram TTS error: ${errorText}` },
        { status: response.status }
      );
    }

    const audioArrayBuffer = await response.arrayBuffer();

    return new Response(audioArrayBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioArrayBuffer.byteLength.toString(),
      },
    });
  } catch (err: any) {
    console.error("TTS Error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || String(err) },
      { status: 500 }
    );
  }
}
