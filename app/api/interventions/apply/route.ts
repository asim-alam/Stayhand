import { NextResponse } from "next/server";
import { runtimeService } from "@/lib/runtime/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as { eventId?: string; action?: string };
  if (!body.eventId || !body.action) {
    return NextResponse.json({ success: false, error: "eventId and action are required." }, { status: 400 });
  }

  const result = runtimeService.applyIntervention(body.eventId, body.action);
  if (!result) {
    return NextResponse.json({ success: false, error: "Event not found." }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    event: result.event,
    ledgerEntry: result.ledgerEntry,
    ledger: runtimeService.getLedger(),
    stats: await runtimeService.getStats(),
  });
}
