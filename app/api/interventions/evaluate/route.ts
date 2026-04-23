import { NextResponse } from "next/server";
import { runtimeService } from "@/lib/runtime/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as { eventId?: string };
  if (!body.eventId) {
    return NextResponse.json({ success: false, error: "eventId is required." }, { status: 400 });
  }

  const event = runtimeService.evaluateEvent(body.eventId);
  if (!event) {
    return NextResponse.json({ success: false, error: "Event not found." }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    event,
    stats: await runtimeService.getStats(),
  });
}
