import { NextResponse } from "next/server";
import { demoService } from "@/lib/core/demo-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as { momentId?: string };
  if (!body.momentId) {
    return NextResponse.json({ success: false, error: "momentId is required." }, { status: 400 });
  }

  const snapshot = await demoService.reviseMoment(body.momentId);
  if (!snapshot) {
    return NextResponse.json({ success: false, error: "Moment not found." }, { status: 404 });
  }

  return NextResponse.json({ success: true, snapshot });
}
