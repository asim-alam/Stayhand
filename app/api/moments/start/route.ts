import { NextResponse } from "next/server";
import { demoService } from "@/lib/core/demo-service";
import type { MomentSurface } from "@/lib/core/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    surface?: MomentSurface;
    scenarioId?: string;
    judgeMode?: boolean;
  };

  if (!body.surface || !["send", "buy", "reply"].includes(body.surface)) {
    return NextResponse.json({ success: false, error: "Valid surface is required." }, { status: 400 });
  }

  const snapshot = await demoService.startMoment(body.surface, body.scenarioId, Boolean(body.judgeMode));
  return NextResponse.json({ success: true, snapshot });
}
