import { NextResponse } from "next/server";
import { UndoEngine } from "@ai-pc/tools";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshots = UndoEngine.listSnapshots();
    return NextResponse.json({ success: true, snapshots });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { snapshotId } = await req.json();
    if (!snapshotId) {
      return NextResponse.json({ success: false, error: "snapshotId is required" }, { status: 400 });
    }

    const result = await UndoEngine.rollback(snapshotId);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}
