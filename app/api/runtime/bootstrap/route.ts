import { NextResponse } from "next/server";
import { runtimeService } from "@/lib/runtime/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const eventId = url.searchParams.get("eventId") || undefined;
  const connectorId = url.searchParams.get("connectorId") || undefined;
  const payload = await runtimeService.bootstrap(eventId, connectorId);
  return NextResponse.json(payload);
}
