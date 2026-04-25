import { NextResponse } from "next/server";
import { analyzeSendMoment } from "@/lib/real-mode/send-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      draft?: string;
      context?: string;
      type?: string;
      tone?: string;
      amount?: number;
    };

    const draft = typeof body.draft === "string" ? body.draft : "";
    if (!draft.trim()) {
      return NextResponse.json({ error: "draft is required" }, { status: 400 });
    }

    const surface = body.type === "buy" ? "buy" : "send";

    const response = await analyzeSendMoment({
      surface,
      draft,
      context: typeof body.context === "string" ? body.context : undefined,
      amount: typeof body.amount === "number" ? body.amount : undefined,
      type: typeof body.type === "string" ? body.type : undefined,
      tone: typeof body.tone === "string" ? body.tone : undefined,
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "failed to analyze send draft" },
      { status: 500 }
    );
  }
}

