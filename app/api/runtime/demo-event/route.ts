import { NextResponse } from "next/server";
import { runtimeService } from "@/lib/runtime/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { sourceId?: string };
  const event = await runtimeService.simulateDemoEvent(body.sourceId);
  return NextResponse.json({
    success: true,
    event,
    stats: await runtimeService.getStats(),
  });
}
