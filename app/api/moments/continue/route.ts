import { NextResponse } from "next/server";
import { demoService } from "@/lib/core/demo-service";
import type { DemoActionId } from "@/lib/core/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as { momentId?: string; action?: DemoActionId };
  if (!body.momentId || !body.action) {
    return NextResponse.json({ success: false, error: "momentId and action are required." }, { status: 400 });
  }

  const snapshot = await demoService.continueMoment(body.momentId, body.action);
  if (!snapshot) {
    return NextResponse.json({ success: false, error: "Moment not found." }, { status: 404 });
  }

  return NextResponse.json({ success: true, snapshot });
}
