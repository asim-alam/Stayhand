import { NextResponse } from "next/server";
import { analyzeSendMoment } from "@/lib/real-mode/send-service";
import type { ThinkSurface } from "@/lib/real-mode/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      type?: ThinkSurface;
      draft?: string;
      context?: string;
      amount?: number;
    };

    if (typeof body.draft !== "string" || !body.draft.trim()) {
      return NextResponse.json({ error: "draft is required" }, { status: 400 });
    }

    const response = await analyzeSendMoment({
      surface: body.type === "buy" ? "buy" : "send",
      draft: body.draft,
      context: typeof body.context === "string" ? body.context : undefined,
      amount: typeof body.amount === "number" ? body.amount : undefined,
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "failed to analyze moment" },
      { status: 500 }
    );
  }
}

