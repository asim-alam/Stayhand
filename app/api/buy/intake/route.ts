import { NextResponse } from "next/server";
import { intakeBuyDecision } from "@/lib/real-mode/buy-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { input?: string };
    if (typeof body.input !== "string" || !body.input.trim()) {
      return NextResponse.json({ error: "input is required" }, { status: 400 });
    }

    const response = await intakeBuyDecision(body.input);
    return NextResponse.json({ success: true, ...response });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "failed to intake purchase" },
      { status: 500 }
    );
  }
}

