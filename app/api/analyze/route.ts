import { NextResponse } from "next/server";
import { analyzeReplyDraft } from "@/lib/real-mode/reply-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { text?: string };
    if (typeof body.text !== "string") {
      return NextResponse.json({ error: "text must be a string" }, { status: 400 });
    }

    const response = await analyzeReplyDraft({ draft: body.text });
    return NextResponse.json({
      heat: response.result.heat,
      category: response.result.category,
      softened: response.result.softened,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "failed to analyze text" },
      { status: 500 }
    );
  }
}
