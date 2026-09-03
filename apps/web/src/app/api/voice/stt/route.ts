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

    const model = process.env.DEEPGRAM_STT_MODEL || "nova-2";
    const audioBuffer = await req.arrayBuffer();

    if (!audioBuffer || audioBuffer.byteLength === 0) {
      return NextResponse.json(
        { success: false, error: "No audio data received" },
        { status: 400 }
      );
    }

    const contentType = req.headers.get("content-type") || "audio/webm";

    const response = await fetch(
      `https://api.deepgram.com/v1/listen?model=${model}&smart_format=true&punctuate=true`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": contentType,
        },
        body: Buffer.from(audioBuffer),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { success: false, error: `Deepgram API error: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const transcript =
      data.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";

    return NextResponse.json({
      success: true,
      transcript,
    });
  } catch (err: any) {
    console.error("STT Error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || String(err) },
      { status: 500 }
    );
  }
}
