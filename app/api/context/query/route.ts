import { NextResponse } from "next/server";
import { runtimeService } from "@/lib/runtime/service";
import type { TabId } from "@/lib/types/runtime";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as { tabId?: TabId; queryId?: string; params?: Record<string, unknown> };
  if (!body.tabId || !body.queryId) {
    return NextResponse.json({ success: false, error: "tabId and queryId are required." }, { status: 400 });
  }
  const result = await runtimeService.getContextBus().queryTab(body.tabId, body.queryId, body.params || {});
  return NextResponse.json(result);
}
